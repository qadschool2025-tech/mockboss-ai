// lib/barbaros/panel/panel-rotation.ts
// Barbaros Panel — Evidence-Driven Handover (Step 2 of the three-member panel).
//
// SAFETY: This module is standalone and not integrated into runtime yet,
// but it must pass typecheck before merge. The engine adopts it in the next step.
//
// DESIGN CONTRACT (no mechanical rotation):
// A panel member holds the floor until the EVIDENCE for their exclusively
// owned axes is complete — never until a question counter expires. This
// mirrors real interview panels: a strong candidate clears an assessor in
// two questions; an evasive one stays under pressure for five.
//
// Handover happens on exactly two conditions:
//   1. 'axes_covered' — every REACHABLE owned axis of the active member is
//      covered, per resolveCoveredAreas (the single source of truth for
//      evidence-based coverage — the same function that drives the closing
//      message and the report).
//   2. 'time_guard'   — a cumulative time ceiling that prevents one member
//      from consuming the segments of the members after them. A report
//      missing ownership_level because HR talked for 25 minutes is an
//      incomplete product; the guard protects coverage completeness.
//
// PRESENCE FLOOR: A member must ask at least one question before any
// handover. A panel member who never speaks is decoration, and decoration
// is forbidden by the panel design contract.
//
// STRUCTURALLY UNREACHABLE AXES: cv_consistency cannot be evidenced without
// a CV; job_requirement_match cannot be evidenced without stated job
// requirements. Such axes are excluded from the completion check so a member
// is never stuck waiting for evidence that cannot exist. Reachability
// derivation mirrors coverage-resolver semantics exactly (hasCv is derived
// from cvText / cvSummary / parsedCv — it is not a typed field).
//
// LAST MEMBER RULE: The final member never hands over. Once the panel cycle
// completes, they keep pressing until the session ends.
//
// CROSS-MEMBER MEMORY: Contradiction confrontation is NOT gated by the
// active member. The Director layer stays fully independent of rotation —
// any member may confront a contradiction made in front of another member.
// Mandate exclusivity governs what a member ASKS about, not what the panel
// holds the candidate accountable for.

import type { InterviewConfig, Message } from '../types'
import type { SessionState } from '../state/session-state'
import {
  resolveCoveredAreas,
  type EssentialAxis,
} from '../scoring/coverage-resolver'
import type {
  PanelRoleId,
  ResolvedPanel,
  ResolvedPanelMember,
} from './panel-roles'

// ─── Tuning constants ─────────────────────────────────────────────────────────

// A member may overrun their proportional time share by this factor when the
// evidence for their axes is still incomplete. Beyond it, the guard fires.
const TIME_GUARD_TOLERANCE = 1.2

// Minimum questions the active member must ask before ANY handover fires.
const MIN_QUESTIONS_BEFORE_HANDOVER = 1

// ─── Persisted turn state ─────────────────────────────────────────────────────
// Carried inside the engine statePatch (same pattern as directorBudget).
// Must stay JSON-serializable.

export type PanelHandoverReason = 'axes_covered' | 'time_guard'

export interface PanelHandoverRecord {
  from:             PanelRoleId
  to:               PanelRoleId
  reason:           PanelHandoverReason
  atElapsedMinutes: number
}

export interface PanelTurnState {
  // Index into ResolvedPanel.members of the member currently holding the floor.
  activeIndex: number

  // Questions asked by the active member in their CURRENT segment.
  // The engine increments this on each assistant question and the handover
  // decision resets it to 0 when the floor changes.
  questionsAskedByActive: number

  // Audit trail of every handover, consumed later by the report layer
  // (Step 4: panel verdict cards + point of disagreement).
  handovers: PanelHandoverRecord[]
}

export function createPanelTurnState(): PanelTurnState {
  return {
    activeIndex:            0,
    questionsAskedByActive: 0,
    handovers:              [],
  }
}

// ─── Handover decision ────────────────────────────────────────────────────────

export interface PanelHandoverInput {
  panel:          ResolvedPanel
  turnState:      PanelTurnState
  state:          SessionState
  config:         InterviewConfig
  messages:       Message[]
  elapsedMinutes: number
  totalMinutes:   number
}

export interface PanelHandoverDecision {
  // Member holding the floor AFTER this evaluation. Null when the panel is
  // disabled (essential plan / unknown plan) — caller falls back to the
  // single-interviewer path untouched.
  member: ResolvedPanelMember | null

  // Turn state AFTER this evaluation. Caller persists it via statePatch.
  turnState: PanelTurnState

  handedOver: boolean
  reason:     PanelHandoverReason | null
}

/**
 * evaluatePanelHandover
 * Pure function, no side effects. Called by the engine once per turn,
 * BEFORE prompt assembly, so the resulting member shapes the next question.
 */
export function evaluatePanelHandover(
  input: PanelHandoverInput
): PanelHandoverDecision {
  const {
    panel,
    turnState,
    state,
    config,
    messages,
    elapsedMinutes,
    totalMinutes,
  } = input

  // Numeric guards: a NaN/zero totalMinutes would make the time-guard
  // comparison silently false forever, freezing handover with no visible
  // error. Clamp to safe values instead of trusting upstream arithmetic.
  const safeTotalMinutes =
    Number.isFinite(totalMinutes) && totalMinutes > 0 ? totalMinutes : 30
  const safeElapsedMinutes =
    Number.isFinite(elapsedMinutes) && elapsedMinutes >= 0 ? elapsedMinutes : 0

  // Panel disabled → single-interviewer path. The caller must not alter
  // any existing behavior in this case.
  if (!panel.enabled || panel.members.length === 0) {
    return { member: null, turnState, handedOver: false, reason: null }
  }

  const members = panel.members
  const safeIndex = clampIndex(turnState.activeIndex, members.length)
  const active = members[safeIndex]
  const isLastMember = safeIndex >= members.length - 1

  // The final member never hands over — they press until the session ends.
  if (isLastMember) {
    return {
      member:     active,
      turnState:  { ...turnState, activeIndex: safeIndex },
      handedOver: false,
      reason:     null,
    }
  }

  // PRESENCE FLOOR: no handover of any kind before the member has spoken.
  if (turnState.questionsAskedByActive < MIN_QUESTIONS_BEFORE_HANDOVER) {
    return {
      member:     active,
      turnState:  { ...turnState, activeIndex: safeIndex },
      handedOver: false,
      reason:     null,
    }
  }

  // ── Condition 1: evidence completeness for the member's reachable axes ──

  const covered = new Set<EssentialAxis>(
    resolveCoveredAreas(state, config, messages)
  )

  const reachableAxes = active.ownedAxes.filter(axis =>
    isAxisReachable(axis, config)
  )

  const axesCovered =
    reachableAxes.length > 0 &&
    reachableAxes.every(axis => covered.has(axis))

  // ── Condition 2: cumulative time guard ──────────────────────────────────
  // Member i must release the floor once elapsed time passes their
  // cumulative proportional share (with tolerance), so every later member
  // still gets real floor time and the report keeps full coverage.

  const cumulativeShare =
    ((safeIndex + 1) / members.length) * safeTotalMinutes
  const timeGuardFired =
    safeElapsedMinutes >= cumulativeShare * TIME_GUARD_TOLERANCE

  if (!axesCovered && !timeGuardFired) {
    return {
      member:     active,
      turnState:  { ...turnState, activeIndex: safeIndex },
      handedOver: false,
      reason:     null,
    }
  }

  // ── Handover ────────────────────────────────────────────────────────────

  const reason: PanelHandoverReason = axesCovered
    ? 'axes_covered'
    : 'time_guard'

  const nextIndex = safeIndex + 1
  const next = members[nextIndex]

  const record: PanelHandoverRecord = {
    from:             active.id,
    to:               next.id,
    reason,
    atElapsedMinutes: roundMinutes(safeElapsedMinutes),
  }

  return {
    member: next,
    turnState: {
      activeIndex:            nextIndex,
      questionsAskedByActive: 0,
      handovers:              [...turnState.handovers, record],
    },
    handedOver: true,
    reason,
  }
}

// ─── Axis reachability ────────────────────────────────────────────────────────
// Mirrors coverage-resolver derivation exactly. An axis whose evidence is
// structurally impossible in this session must not block a handover.

function isAxisReachable(
  axis:   EssentialAxis,
  config: InterviewConfig
): boolean {
  if (axis === 'cv_consistency') {
    return deriveHasCv(config)
  }

  if (axis === 'job_requirement_match') {
    return (config.jobRequirements ?? '').trim().length > 0
  }

  return true
}

// hasCv is NOT a typed server-side field — always derived, never read.
function deriveHasCv(config: InterviewConfig): boolean {
  return Boolean(
    config.cvText?.trim() ||
    config.cvSummary?.trim() ||
    config.parsedCv
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0
  if (index >= length) return length - 1
  return Math.floor(index)
}

function roundMinutes(minutes: number): number {
  return Math.round(minutes * 10) / 10
}
