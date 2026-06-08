// lib/barbaros/prompt/system-layers.ts
// Dynamic system prompt layers. What changes per session/candidate.
// Consumed by: prompt-builder.ts
//
// FIXES APPLIED:
// Fix #1: Time is the ONLY authority. AI forbidden from ending early.
// Fix #2: domain_expertise everywhere, replaces technical_depth.
// Fix #5: Arabic, complete response required, never truncate.
// Fix #6: Mixed, Arabic structure, English terminology only.
// Fix #scoring: Human-realistic scoring philosophy with anchors.
// Fix #contract: buildPressureLayer uses real InterviewState fields
//                pressureMode enum + metrics.contradictionCount.
// Fix #cv_source: Adds CV + job requirements as interview source context only.
//                 Does NOT change Barbaros identity, tone, or pressure style.

import type { InterviewConfig } from '../types'
import type { SessionState }    from '../state/session-state'
import type { TrackedWeakness } from '../longitudinal/weakness-tracker'
import type { TrackedGrowth }   from '../longitudinal/growth-tracker'
import {
  BARBAROS_IDENTITY_RULES,
  BARBAROS_RESPONSE_RULES,
  BARBAROS_PRESSURE_PHRASES,
  BARBAROS_POSITIVE_PHRASES,
  BARBAROS_INTERVIEW_PHASES,
  BARBAROS_SCORING_PHILOSOPHY,
  BARBAROS_SCORING_ANCHORS,
  SECTOR_FOCUS_HINTS,
  BARBAROS_LANGUAGE_RULES,
  DEFAULT_LANGUAGE_RULE,
} from './personality'

// ─── Layer Output Type ────────────────────────────────────────────────────────

export interface SystemLayer {
  label:   string
  content: string
  weight:  number
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
    lines.push('NOTE: Career switch candidate. Probe how prior experience transfers.')
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

// ─── Layer 3b: CV + Job Source Context ────────────────────────────────────────

export function buildCvJobContextLayer(config: InterviewConfig): SystemLayer {
  const parsedCv = config.parsedCv
  const hasCvSource =
    Boolean(config.cvSummary?.trim()) ||
    Boolean(config.cvText?.trim()) ||
    Boolean(parsedCv)

  const hasJobRequirements = Boolean(config.jobRequirements?.trim())

  if (!hasCvSource && !hasJobRequirements) {
    return { label: 'cv_job_context', weight: 3.5, content: '' }
  }

  const lines: string[] = [
    'CV + JOB SOURCE CONTEXT:',
    'Use the CV and job requirements as professional interview sources only.',
    'Do NOT change Barbaros identity, tone, pressure style, or interview personality.',
  ]

  if (config.cvSummary?.trim()) {
    lines.push(`CV SUMMARY:\n${limitText(config.cvSummary, 900)}`)
  }

  if (parsedCv) {
    const cvFacts: string[] = []

    if (parsedCv.candidateName) {
      cvFacts.push(`CV name: ${parsedCv.candidateName}`)
    }

    if (parsedCv.currentTitle || parsedCv.currentCompany) {
      cvFacts.push(
        `Current or most recent role: ${[parsedCv.currentTitle, parsedCv.currentCompany]
          .filter(Boolean)
          .join(' at ')}`
      )
    }

    if (parsedCv.totalYearsExperience) {
      cvFacts.push(`CV stated experience: ${parsedCv.totalYearsExperience}`)
    }

    if (parsedCv.roles && parsedCv.roles.length > 0) {
      const roleLines = parsedCv.roles
        .slice(0, 4)
        .map(role => formatCvRole(role))
        .filter(Boolean)

      if (roleLines.length > 0) {
        cvFacts.push(`Recent CV roles:\n${roleLines.map(r => `- ${r}`).join('\n')}`)
      }
    }

    if (parsedCv.skills && parsedCv.skills.length > 0) {
      cvFacts.push(`CV skills: ${parsedCv.skills.slice(0, 18).join(', ')}`)
    }

    if (parsedCv.certifications && parsedCv.certifications.length > 0) {
      cvFacts.push(`CV certifications: ${parsedCv.certifications.slice(0, 8).join(', ')}`)
    }

    if (parsedCv.achievements && parsedCv.achievements.length > 0) {
      cvFacts.push(`CV achievements:\n${parsedCv.achievements.slice(0, 4).map(a => `- ${a}`).join('\n')}`)
    }

    if (parsedCv.projects && parsedCv.projects.length > 0) {
      const projectLines = parsedCv.projects
        .slice(0, 3)
        .map(project => {
          const name = project.name || 'Unnamed project'
          const role = project.role ? `, role: ${project.role}` : ''
          const description = project.description ? `, ${project.description}` : ''
          return `${name}${role}${description}`
        })

      cvFacts.push(`CV projects:\n${projectLines.map(p => `- ${limitText(p, 220)}`).join('\n')}`)
    }

    if (cvFacts.length > 0) {
      lines.push(cvFacts.join('\n'))
    }
  }

  if (hasJobRequirements) {
    lines.push(
      [
        'JOB REQUIREMENT LINKAGE:',
        'Use the job requirements as the standard for fit.',
        'When asking from the CV, connect the question to ONE relevant role requirement or competency.',
        'Do not read requirements back mechanically. Convert them into natural interview questions.',
      ].join('\n')
    )
  }

  lines.push(
    [
      'SOURCE USE RULES:',
      '- Treat the CV as an interview source, not as a weapon.',
      '- Ask from the CV naturally, as a professional HR interviewer with the CV open.',
      '- Do NOT say "parsed CV", "structured data", "JSON", or expose internal fields.',
      '- Do NOT accuse the candidate unless there is a clear, material conflict.',
      '- Prefer neutral phrases such as "help me understand", "walk me through", or "I want to clarify the level of ownership".',
      '- Ask ONE question at a time.',
      '- Use CV facts to test role fit, job requirement match, ownership, domain depth, communication, problem solving, consistency, and growth potential.',
      '- If the CV shows execution-level work but the candidate claims ownership, ask about the real level of responsibility without attacking.',
      '- If the CV background is far from the target role, ask for evidence of transferability.',
      '- If there is a clear timeline gap, ask about it once in a neutral professional way.',
      '- If there is no useful CV evidence, continue the normal interview flow unchanged.',
    ].join('\n')
  )

  return {
    label:   'cv_job_context',
    weight:  3.5,
    content: lines.join('\n\n'),
  }
}

// ─── Layer 4: Language ────────────────────────────────────────────────────────
// Fix #5 + #6

export function buildLanguageLayer(language: string): SystemLayer {
  let rule: string

  if (language === 'ar') {
    rule = [
      'Conduct the ENTIRE interview in Modern Standard Arabic (فصحى).',
      'CRITICAL: Always write your COMPLETE response in Arabic before finishing.',
      'Never truncate or cut short an Arabic response mid-sentence.',
      'Never switch to English under any circumstances.',
      'Every response must be fully formed and grammatically complete in Arabic.',
    ].join('\n')

  } else if (language === 'mixed') {
    rule = [
      'Use Mixed mode: Arabic sentence structure with English professional terms only.',
      'RULE: Sentence grammar and flow must be primarily Arabic.',
      'RULE: Use English ONLY for specific professional or technical terminology.',
      'CORRECT: "كيف تعاملت مع موقف stakeholder management صعب في مشروعك السابق؟"',
      'WRONG:   "كيف did you handle the stakeholders في your organization؟"',
      'Arabic carries the sentence. English carries the term. Never random mid-sentence switching.',
    ].join('\n')

  } else {
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

// ─── Layer 6: Behavioral Pressure ─────────────────────────────────────────────
// CONTRACT FIX: InterviewState exposes `pressureMode` enum and
// `metrics.contradictionCount`, not pressureLevel / silenceRisk.
// Pressure intensity is derived from the pressureMode enum.

export function buildPressureLayer(state: SessionState): SystemLayer {
  const lines: string[] = []

  const mode = state.pressureMode

  if (mode === 'skeptical' || mode === 'silence_pressure') {
    lines.push('PRESSURE MODE: HIGH — be direct and unrelenting. Do not soften follow-ups.')
  } else if (mode === 'analytical' || mode === 'fast_paced') {
    lines.push('PRESSURE MODE: MEDIUM — push for specifics on weak answers.')
  } else {
    lines.push('PRESSURE MODE: STANDARD — professional pace, probe vague answers once.')
  }

  if (mode === 'silence_pressure') {
    lines.push(`ON SILENCE: ${BARBAROS_PRESSURE_PHRASES.silence}`)
  }

  const contradictionCount = state.metrics.contradictionCount
  if (contradictionCount > 0) {
    lines.push(
      `CONTRADICTION DETECTED (${contradictionCount} so far): ` +
      'If candidate contradicts a previous statement, use the contradiction_caught phrase.'
    )
  }

  return {
    label:   'pressure',
    weight:  6,
    content: lines.join('\n'),
  }
}

// ─── Layer 7: Weakness Awareness ──────────────────────────────────────────────

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

// ─── Layer 8: Growth Recognition ──────────────────────────────────────────────

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
  lines.push(`If candidate demonstrates strength here: "${BARBAROS_POSITIVE_PHRASES.strong_answer}"`)

  return {
    label:   'growth',
    weight:  8,
    content: lines.join('\n'),
  }
}

// ─── Layer 9: Scoring, philosophy + anchors + format ─────────────────────────
// Fix #2: domain_expertise, not technical_depth.
// Fix #scoring: human-realistic philosophy with anchored examples.

export function buildScoringLayer(): SystemLayer {
  return {
    label:   'scoring',
    weight:  9,
    content: [
      BARBAROS_SCORING_PHILOSOPHY,
      '',
      BARBAROS_SCORING_ANCHORS,
      '',
      'OUTPUT FORMAT — after every substantive answer, append exactly:',
      '<score>{"score":0,"clarity":0,"confidence":0,"relevance":0,"domain_expertise":0,"notes":""}</score>',
      'Fill all fields 0–100. notes: max 10 words. Never omit this tag.',
      'Use "domain_expertise" — NEVER "technical_depth". Applies to ALL sectors.',
    ].join('\n'),
  }
}

// ─── Layer 10: Time Control ───────────────────────────────────────────────────
// Fix #1: AI forbidden from ending early. Integer math, no decimals to LLM.

export function buildTimeLayer(
  elapsedMinutes: number,
  totalMinutes:   number
): SystemLayer {
  const elapsedSeconds   = Math.max(0, Math.floor(elapsedMinutes * 60))
  const totalSeconds     = totalMinutes * 60
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds)
  const remainingMins    = Math.ceil(remainingSeconds / 60)
  const elapsedMins      = Math.floor(elapsedSeconds / 60)

  let content: string

  const INTERNAL_TIMING_GUARD =
    '[INTERNAL TIMING — guides YOUR pacing only. NEVER tell the candidate the time, '   +
    'minutes elapsed, minutes remaining, or mention any clock/timer. NEVER output a '    +
    'line starting with TIME:, ACTION:, FORBIDDEN:, or ABSOLUTE RULE:. Speak naturally.]'

  if (remainingSeconds <= 90) {
    content = [
      INTERNAL_TIMING_GUARD,
      `TIME: ${remainingMins} minute(s) remaining.`,
      'ACTION: Move to closing NOW. Ask your final question and begin wrap-up.',
      'You MAY use "final question" or "last question" only at this stage.',
    ].join('\n')

  } else if (remainingSeconds <= 180) {
    content = [
      INTERNAL_TIMING_GUARD,
      `TIME: ${remainingMins} minute(s) remaining.`,
      'ACTION: Finish current topic, then transition to closing phase.',
      'Do NOT say "final question" or "last question" yet.',
    ].join('\n')

  } else if (remainingSeconds <= 480) {
    content = [
      INTERNAL_TIMING_GUARD,
      `TIME: ${remainingMins} minute(s) remaining.`,
      'ACTION: Move to deeper analysis — pressure handling and critical thinking questions.',
      'FORBIDDEN: Do NOT close. Do NOT say "final question" or "last question".',
    ].join('\n')

  } else {
    content = [
      INTERNAL_TIMING_GUARD,
      `TIME: ${elapsedMins}/${totalMinutes} minutes elapsed. ${remainingMins} minutes remaining.`,
      'ACTION: Continue with core domain expertise and behavioral questions.',
      'ABSOLUTE RULE: You are FORBIDDEN from ending or closing this session.',
      'FORBIDDEN PHRASES: "final question", "last question", "session complete", "that concludes", "before we wrap up".',
      'The session ends ONLY when the timer expires — NEVER based on your judgment.',
      'If you feel you have covered everything — ask deeper follow-ups, probe past examples, request elaboration.',
      'Keep asking until the timer runs out.',
    ].join('\n')
  }

  return {
    label:   'time',
    weight:  10,
    content,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCvRole(role: NonNullable<NonNullable<InterviewConfig['parsedCv']>['roles']>[number]): string {
  const title = role.title || 'Role'
  const company = role.company ? ` at ${role.company}` : ''
  const dates = [role.startDate, role.endDate || (role.isCurrent ? 'Present' : '')]
    .filter(Boolean)
    .join(' to ')
  const dateText = dates ? ` (${dates})` : ''
  const responsibilities = role.responsibilities?.length
    ? ` Responsibilities: ${role.responsibilities.slice(0, 2).join('; ')}.`
    : ''
  const achievements = role.achievements?.length
    ? ` Achievements: ${role.achievements.slice(0, 2).join('; ')}.`
    : ''

  return limitText(`${title}${company}${dateText}.${responsibilities}${achievements}`, 320)
}

function limitText(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return clean
  return `${clean.slice(0, Math.max(0, maxChars - 15)).trim()} [truncated]`
}
