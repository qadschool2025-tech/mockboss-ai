
// lib/barbaros/prompt/system-layers.ts
// Dynamic system prompt layers — what changes per session/candidate.
// Consumed by: prompt-builder.ts (assembles layers into final system prompt)
//
// Rules:
// - Each layer is a pure function: (context) → string
// - No LLM calls, no async, no side effects
// - Layers are independent — order is handled by prompt-builder
// - Personality constants come from personality.ts — never duplicated here

import type { InterviewConfig }        from '../types'
import type { SessionState }           from '../state/session-state'
import type { TrackedWeakness }        from '../longitudinal/weakness-tracker'
import type { TrackedGrowth }          from '../longitudinal/growth-tracker'
import {
  BARBAROS_IDENTITY_RULES,
  BARBAROS_RESPONSE_RULES,
  BARBAROS_PRESSURE_PHRASES,
  BARBAROS_POSITIVE_PHRASES,
  BARBAROS_INTERVIEW_PHASES,
  SECTOR_FOCUS_HINTS,
  BARBAROS_LANGUAGE_RULES,
  DEFAULT_LANGUAGE_RULE,
} from './personality'

// ─── Layer Output Type ────────────────────────────────────────────────────────

export interface SystemLayer {
  label:   string    // for debugging — not injected into prompt
  content: string    // injected into system prompt
  weight:  number    // ordering priority (lower = earlier in prompt)
}

// ─── Layer 1: Identity (always injected, never changes) ───────────────────────

export function buildIdentityLayer(): SystemLayer {
  return {
    label:   'identity',
    weight:  1,
    content: BARBAROS_IDENTITY_RULES.join('\n'),
  }
}

// ─── Layer 2: Response Style (always injected) ────────────────────────────────

export function buildResponseStyleLayer(): SystemLayer {
  return {
    label:   'response_style',
    weight:  2,
    content: BARBAROS_RESPONSE_RULES.join('\n'),
  }
}

// ─── Layer 3: Session Context (candidate + role info) ────────────────────────

export function buildSessionContextLayer(config: InterviewConfig): SystemLayer {
  const lines: string[] = [
    `CANDIDATE: ${config.candidateName}`,
    `ROLE: ${config.jobTitle}`,
    `INSTITUTION: ${config.institution}`,
    `SECTOR: ${config.sector}`,
    `EXPERIENCE: ${config.yearsExperience}`,
  ]

  if (config.isCareerSwitch) {
    lines.push('NOTE: This candidate is making a career switch. Probe how prior experience transfers.')
  }

  if (config.jobRequirements) {
    lines.push(`JOB REQUIREMENTS:\n${config.jobRequirements}`)
  }

  if (config.cvSummary) {
    lines.push(`CV SUMMARY (use to tailor questions):\n${config.cvSummary}`)
  }

  const sectorHint = SECTOR_FOCUS_HINTS[config.sector]
  if (sectorHint) {
    lines.push(`SECTOR FOCUS: ${sectorHint}`)
  }

  return {
    label:   'session_context',
    weight:  3,
    content: lines.join('\n'),
  }
}

// ─── Layer 4: Language ────────────────────────────────────────────────────────

export function buildLanguageLayer(language: string): SystemLayer {
  const rule = BARBAROS_LANGUAGE_RULES[language] ?? DEFAULT_LANGUAGE_RULE
  return {
    label:   'language',
    weight:  4,
    content: `LANGUAGE RULE (CRITICAL): ${rule}`,
  }
}

// ─── Layer 5: Interview Structure ─────────────────────────────────────────────

export function buildStructureLayer(currentPhase: string): SystemLayer {
  const phases = Object.entries(BARBAROS_INTERVIEW_PHASES)
    .map(([key, phase]) => {
      const isActive = key === currentPhase
      const marker   = isActive ? '→ CURRENT' : '  '
      const count    = typeof phase.questionCount === 'object'
        ? `${phase.questionCount.min}-${phase.questionCount.max} questions`
        : `${phase.questionCount} question`
      return `${marker} [${phase.label}] ${count} — ${phase.purpose}`
    })
    .join('\n')

  return {
    label:   'structure',
    weight:  5,
    content: `INTERVIEW STRUCTURE:\n${phases}`,
  }
}

// ─── Layer 6: Behavioral Pressure (from live session state) ──────────────────

export function buildPressureLayer(state: SessionState): SystemLayer {
  const lines: string[] = []

  if (state.pressureLevel >= 7) {
    lines.push('PRESSURE MODE: HIGH — be direct and unrelenting. Do not soften follow-ups.')
  } else if (state.pressureLevel >= 4) {
    lines.push('PRESSURE MODE: MEDIUM — push for specifics on weak answers.')
  } else {
    lines.push('PRESSURE MODE: STANDARD — professional pace, probe vague answers once.')
  }

  if (state.silenceRisk === 'high') {
    lines.push(`ON SILENCE: ${BARBAROS_PRESSURE_PHRASES.silence}`)
  }

  if (state.contradictionCount > 0) {
    lines.push(
      `CONTRADICTION DETECTED (${state.contradictionCount} so far): ` +
      'If candidate contradicts a previous statement, use the contradiction_caught phrase.'
    )
  }

  return {
    label:   'pressure',
    weight:  6,
    content: lines.join('\n'),
  }
}

// ─── Layer 7: Weakness Awareness (from longitudinal state) ───────────────────

export function buildWeaknessLayer(
  weaknesses:     TrackedWeakness[],
  isFirstSession: boolean
): SystemLayer {
  if (isFirstSession || weaknesses.length === 0) {
    return {
      label:   'weakness',
      weight:  7,
      content: '',   // empty — prompt-builder skips empty layers
    }
  }

  const severe   = weaknesses.filter(w => w.severity === 'severe')
  const moderate = weaknesses.filter(w => w.severity === 'moderate')

  const lines: string[] = ['KNOWN WEAKNESSES FROM PREVIOUS SESSIONS (probe these areas):']

  if (severe.length > 0) {
    lines.push('Critical (press hard if these topics arise):')
    severe.forEach(w => lines.push(`  - ${w.label} [${w.sessionCount} sessions]`))
  }

  if (moderate.length > 0) {
    lines.push('Moderate (probe if given the opportunity):')
    moderate.forEach(w => lines.push(`  - ${w.label} [${w.sessionCount} sessions]`))
  }

  return {
    label:   'weakness',
    weight:  7,
    content: lines.join('\n'),
  }
}

// ─── Layer 8: Growth Recognition (from longitudinal state) ───────────────────

export function buildGrowthLayer(
  growthSignals:  TrackedGrowth[],
  isFirstSession: boolean
): SystemLayer {
  if (isFirstSession || growthSignals.length === 0) {
    return {
      label:   'growth',
      weight:  8,
      content: '',
    }
  }

  const sustained = growthSignals.filter(g => g.strength === 'sustained')
  const confirmed = growthSignals.filter(g => g.strength === 'confirmed')

  if (sustained.length === 0 && confirmed.length === 0) {
    return { label: 'growth', weight: 8, content: '' }
  }

  const lines: string[] = ['CONFIRMED GROWTH AREAS (acknowledge briefly if demonstrated again):']

  sustained.forEach(g => lines.push(`  - ${g.label} (sustained across ${g.sessionCount} sessions)`))
  confirmed.forEach(g => lines.push(`  - ${g.label} (confirmed in ${g.sessionCount} sessions)`))

  lines.push(
    `If candidate demonstrates strength in these areas: "${BARBAROS_POSITIVE_PHRASES.strong_answer}"`
  )

  return {
    label:   'growth',
    weight:  8,
    content: lines.join('\n'),
  }
}

// ─── Layer 9: Scoring Instruction (always injected) ──────────────────────────

export function buildScoringLayer(): SystemLayer {
  return {
    label:   'scoring',
    weight:  9,
    content:
      'SCORING: After every substantive answer, append exactly:\n' +
      '<score>{"score":0,"clarity":0,"confidence":0,"relevance":0,"technical_depth":0,"notes":""}</score>\n' +
      'Fill all fields 0-100. notes: max 10 words. Never omit this tag.',
  }
}

// ─── Layer 10: Time Awareness ─────────────────────────────────────────────────

export function buildTimeLayer(
  elapsedMinutes: number,
  totalMinutes:   number
): SystemLayer {
  const remaining = totalMinutes - elapsedMinutes
  let urgency = ''

  if (remaining <= 3) {
    urgency = 'TIME CRITICAL: Less than 3 minutes remaining. Move immediately to closing.'
  } else if (remaining <= 8) {
    urgency = `TIME AWARE: ${remaining} minutes remaining. Begin wrapping up technical questions.`
  } else {
    urgency = `SESSION TIME: ${elapsedMinutes}/${totalMinutes} minutes elapsed.`
  }

  return {
    label:   'time',
    weight:  10,
    content: urgency,
  }
}
