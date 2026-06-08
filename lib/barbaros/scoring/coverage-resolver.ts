// lib/barbaros/scoring/coverage-resolver.ts
// Barbaros V4 — Essential Assessment coverage resolver.
//
// PURPOSE:
//   Decides which of the 6 Essential Assessment axes were GENUINELY covered in a
//   session. The result (`coveredAreas`) is the SINGLE SOURCE OF TRUTH shared by:
//     - the spoken farewell (buildClosingMessage in prompt/personality.ts)
//     - the report's "Assessment Coverage" section (later wiring)
//   so the farewell can never diverge from the report.
//
// DESIGN — AXIS ← SIGNAL, NOT AXIS ← COMPETENCY-NAME:
//   Only 3 of the 6 axes live in competencyCoverage. The other 3 are evaluative
//   signals (contradictions / CV presence / job-requirement probing), so each
//   axis reads its OWN correct source rather than a competency key:
//
//     role_fit               ← candidate engaged with the role/motivation opening
//     cv_consistency         ← a CV exists AND a consistency pass was possible
//     job_requirement_match  ← job requirements existed AND a sector skill was probed
//     domain_expertise       ← sector competencies (+ problem_solving) coverage
//     communication_clarity  ← 'communication' competency coverage
//     ownership_level        ← 'ownership' competency coverage
//
// EVIDENCE, NOT PHASE POSITION:
//   At end-of-session the phase is forced to 'closing', so "phase >= motivation"
//   is trivially true and would LIE. We therefore measure real evidence:
//     - user answer count (from `messages` — ground truth; metrics.totalAnswers
//       is NOT reliably maintained on the live server path)
//     - competencyCoverage.coverage / .evidenceCount (maintained per turn)
//     - presence of a CV / job requirements on the config
//
// HONESTY:
//   This module returns ONLY the axes whose signal actually fired (0..6). It
//   NEVER invents a covered axis. The "name at least 2 or stay generic" honesty
//   guard for the farewell lives in buildClosingMessage — NOT here.
//
// PURITY:
//   Pure & deterministic. No state mutation, no Date.now, no I/O, no LLM calls.
//   Same (state, config, messages) → same output.

import type { InterviewConfig, Message } from '../types'
import type { SessionState }             from '../state/session-state'
import { UNIVERSAL_COMPETENCIES }        from '../constants'

// ─── Public taxonomy ──────────────────────────────────────────────────────────

export type EssentialAxis =
  | 'role_fit'
  | 'cv_consistency'
  | 'job_requirement_match'
  | 'domain_expertise'
  | 'communication_clarity'
  | 'ownership_level'

// Canonical display order — keeps the covered list stable across sessions.
export const ESSENTIAL_AXIS_ORDER: readonly EssentialAxis[] = [
  'role_fit',
  'cv_consistency',
  'job_requirement_match',
  'domain_expertise',
  'communication_clarity',
  'ownership_level',
] as const

// ─── Thresholds (reuse the engine's "missing < 50" convention) ──────────────────

const COVERAGE_THRESHOLD       = 50  // a competency counts as "covered" at >= this
const MIN_ANSWERS_FOR_ROLE_FIT = 1   // one real answer = the role/motivation was touched
const MIN_ANSWERS_FOR_CV_CHECK = 2   // contradiction detection needs >= 2 user answers

// ─── Helpers ────────────────────────────────────────────────────────────────────

// hasCv is NOT a typed InterviewConfig field (it is client-only in page.tsx).
// Derive it type-safely from the declared optional CV fields.
function deriveHasCv(config: InterviewConfig): boolean {
  return Boolean(config.cvText || config.cvSummary || config.parsedCv)
}

function countUserAnswers(messages: Message[]): number {
  return messages.filter(m => m.role === 'user').length
}

// Sector competencies = every seeded coverage key that is NOT universal.
// competencyCoverage is seeded at init with UNIVERSAL + SECTOR[sector], so the
// remainder is exactly the candidate's sector set — no normalizeSector needed.
function sectorCompetencyKeys(state: SessionState): string[] {
  return Object.keys(state.competencyCoverage).filter(
    key => !UNIVERSAL_COMPETENCIES.includes(key)
  )
}

function coverageOf(state: SessionState, key: string): number {
  return state.competencyCoverage[key]?.coverage ?? 0
}

function evidenceCountOf(state: SessionState, key: string): number {
  return state.competencyCoverage[key]?.evidenceCount ?? 0
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve the Essential axes genuinely covered this session.
 * Returns the fired axes only, in canonical order (0..6 items).
 */
export function resolveCoveredAreas(
  state:    SessionState,
  config:   InterviewConfig,
  messages: Message[]
): EssentialAxis[] {
  const userAnswers     = countUserAnswers(messages)
  const hasCv           = deriveHasCv(config)
  const hasJobReqs      = (config.jobRequirements ?? '').trim().length > 0
  const sectorKeys      = sectorCompetencyKeys(state)
  const domainKeys      = [...sectorKeys, 'problem_solving']

  const signals: Record<EssentialAxis, boolean> = {
    // The candidate engaged with the opening/role-fit question.
    role_fit:
      userAnswers >= MIN_ANSWERS_FOR_ROLE_FIT,

    // A CV exists AND enough answers happened for a consistency pass to run.
    // (No contradiction found is still a consistency check that ran.)
    cv_consistency:
      hasCv && userAnswers >= MIN_ANSWERS_FOR_CV_CHECK,

    // Job requirements were provided AND at least one sector skill was probed
    // (evidence tied to the requirements, not generic domain mastery).
    job_requirement_match:
      hasJobReqs && sectorKeys.some(key => evidenceCountOf(state, key) > 0),

    // Mastery of the field: any sector competency (or problem_solving) reached
    // the coverage threshold. Independent of job requirements.
    domain_expertise:
      domainKeys.some(key => coverageOf(state, key) >= COVERAGE_THRESHOLD),

    communication_clarity:
      coverageOf(state, 'communication') >= COVERAGE_THRESHOLD,

    ownership_level:
      coverageOf(state, 'ownership') >= COVERAGE_THRESHOLD,
  }

  return ESSENTIAL_AXIS_ORDER.filter(axis => signals[axis])
}
