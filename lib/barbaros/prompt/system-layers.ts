// lib/barbaros/prompt/system-layers.ts
// Dynamic system prompt layers — what changes per session/candidate.
// Consumed by: prompt-builder.ts (assembles layers into final system prompt)
//
// FIXES APPLIED:
// Fix #1 — Time is the ONLY authority for ending sessions (never end early)
// Fix #2 — "technical_depth" renamed to "domain_expertise" everywhere
// Fix #5 — Arabic: never truncate, always wait for full response before TTS
// Fix #6 — Mixed language: Arabic structure, English terminology only

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

// ─── Layer 1: Identity ────────────────────────────────────────────────────────

export function buildIdentityLayer(): SystemLayer {
  return {
    label:   'identity',
    weight:  1,
    content: BARBAROS_IDENTITY_RULES.join('\n'),
  }
}

// ─── Layer 2: Response Style ──────────────────────────────────────────────────

export function buildResponseStyleLayer(): SystemLayer {
  return {
    label:   'response_style',
    weight:  2,
    content: BARBAROS_RESPONSE_RULES.join('\n'),
  }
}

// ─── Layer 3: Session Context ─────────────────────────────────────────────────

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
// Fix #5 + #6: Explicit rules for Arabic completion and Mixed language structure

export function buildLanguageLayer(language: string): SystemLayer {
  let rule: string

  if (language === 'ar') {
    // Fix #5: ensure full Arabic response before any truncation or TTS
    rule = [
      'LANGUAGE: Conduct the ENTIRE interview in Modern Standard Arabic (فصحى).',
      'CRITICAL: Always write your COMPLETE response in Arabic before finishing.',
      'Never truncate or cut short an Arabic response mid-sentence.',
      'Never switch to English under any circumstances.',
      'Ensure every response is fully formed and grammatically complete in Arabic.',
    ].join('\n')
  } else if (language === 'mixed') {
    // Fix #6: Arabic structure, English terminology only
    rule = [
      'LANGUAGE: Use Mixed mode — Arabic sentence structure with English professional terms.',
      'RULE: Keep the sentence structure, grammar, and flow primarily in Arabic.',
      'RULE: Use English ONLY for specific professional/technical terminology.',
      'CORRECT: "كيف تعاملت مع موقف stakeholder management صعب في مشروعك السابق؟"',
      'WRONG: "كيف did you handle the stakeholders في your organization؟"',
      'Never randomly switch mid-sentence. Arabic carries the sentence; English carries the term.',
    ].join('\n')
  } else {
    // Default: English
    rule = BARBAROS_LANGUAGE_RULES[language] ?? DEFAULT_LANGUAGE_RULE
  }

  return {
    label:   'language',
    weight:  4,
    content: `LANGUAGE RULE (CRITICAL):\n${rule}`,
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

// ─── Layer 6: Behavioral Pressure ────────────────────────────────────────────

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

// ─── Layer 7: Weakness Awareness ─────────────────────────────────────────────

export function buildWeaknessLayer(
  weaknesses:     TrackedWeakness[],
  isFirstSession: boolean
): SystemLayer {
  if (isFirstSession || weaknesses.length === 0) {
    return { label: 'weakness', weight: 7, content: '' }
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

// ─── Layer 8: Growth Recognition ─────────────────────────────────────────────

export function buildGrowthLayer(
  growthSignals:  TrackedGrowth[],
  isFirstSession: boolean
): SystemLayer {
  if (isFirstSession || growthSignals.length === 0) {
    return { label: 'growth', weight: 8, content: '' }
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

// ─── Layer 9: Scoring Instruction ────────────────────────────────────────────
// Fix #2: "technical_depth" renamed to "domain_expertise"

export function buildScoringLayer(): SystemLayer {
  return {
    label:   'scoring',
    weight:  9,
    content: [
      'SCORING: After every substantive answer, append exactly:',
      '<score>{"score":0,"clarity":0,"confidence":0,"relevance":0,"domain_expertise":0,"notes":""}</score>',
      'Fill all fields 0-100. notes: max 10 words. Never omit this tag.',
      'Use "domain_expertise" — never "technical_depth". Applies to ALL sectors including Education, HR, Legal, Healthcare.',
    ].join('\n'),
  }
}

// ─── Layer 10: Time Control ───────────────────────────────────────────────────
// Fix #1: Time is the ONLY authority. AI must NEVER end session early.
// "final question" / "last question" forbidden unless remainingTime <= 120s.

export function buildTimeLayer(
  elapsedMinutes: number,
  totalMinutes:   number
): SystemLayer {
  const remainingMinutes = totalMinutes - elapsedMinutes
  const remainingSeconds = remainingMinutes * 60

  let content: string

  if (remainingSeconds <= 90) {
    // Only now is closing allowed
    content = [
      `TIME: ${remainingMinutes} minute(s) remaining.`,
      'ACTION: Move to closing NOW. Ask your final question and begin wrap-up.',
      'You MAY say "final question" or "last question" only at this point.',
    ].join('\n')

  } else if (remainingSeconds <= 180) {
    // 3 minutes left — wrap up technical, do not close yet
    content = [
      `TIME: ${remainingMinutes} minute(s) remaining.`,
      'ACTION: Begin transitioning to closing phase. Finish current topic, then move to wrap-up.',
      'Do NOT say "final question" or "last question" yet.',
    ].join('\n')

  } else if (remainingSeconds <= 480) {
    // 8 minutes left — deepen analysis
    content = [
      `TIME: ${remainingMinutes} minute(s) remaining.`,
      'ACTION: Move into deeper analysis — pressure handling and critical thinking questions.',
      'FORBIDDEN: Do NOT close the session. Do NOT say "final question" or "last question".',
    ].join('\n')

  } else {
    // Normal session — core questions
    content = [
      `TIME: ${elapsedMinutes}/${totalMinutes} minutes elapsed. ${remainingMinutes} minutes remaining.`,
      'ACTION: Continue with core domain expertise and behavioral questions.',
      'CRITICAL RULE: You are FORBIDDEN from ending or closing this session.',
      'FORBIDDEN PHRASES: "final question", "last question", "session complete", "that concludes".',
      'The session ends ONLY when the timer expires — NOT based on your judgment.',
      'Even if you feel the interview is complete — KEEP ASKING QUESTIONS until time runs out.',
    ].join('\n')
  }

  return {
    label:   'time',
    weight:  10,
    content,
  }
}
