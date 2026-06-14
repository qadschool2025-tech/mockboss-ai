
// lib/barbaros/policy/conduct-policy.ts
// Deterministic session-conduct policy.
// The existing interview LLM call emits an internal <conduct> tag.
// This module parses that tag, applies fail-safe escalation, and never scores.

import type {
  ConductAction,
  ConductSignal,
  ConductState,
  Language,
  Message,
} from '../types'

const DEFAULT_CONDUCT_STATE: ConductState = {
  redirected: false,
  warned: false,
  violationsAfterWarning: 0,
  pendingQuestion: null,
}

export interface ConductDecision {
  action: ConductAction
  state: ConductState
  duplicate: boolean
  signal: ConductSignal
}

export function normalizeConductState(state?: ConductState): ConductState {
  return {
    ...DEFAULT_CONDUCT_STATE,
    ...(state ?? {}),
    redirected: state?.redirected === true,
    warned: state?.warned === true,
    violationsAfterWarning: Number.isFinite(state?.violationsAfterWarning)
      ? Math.max(0, state?.violationsAfterWarning ?? 0)
      : 0,
    pendingQuestion:
      typeof state?.pendingQuestion === 'string'
        ? state.pendingQuestion
        : null,
  }
}

/**
 * Fail-safe parser. Missing, malformed, unknown, and uncertain values are
 * treated as professional so a paid session is never paused on ambiguity.
 */
export function parseConductSignal(content: string): ConductSignal {
  const match = content.match(/<conduct>\s*([^<]+?)\s*<\/conduct>/i)
  if (!match) return 'professional'

  const value = match[1].trim().toLowerCase()

  if (value === 'off_topic_or_playful') return 'off_topic_or_playful'
  if (value === 'explicit_abuse') return 'explicit_abuse'
  if (value === 'professional') return 'professional'

  return 'professional'
}

/** Remove closed, dangling-open, and stray-closing conduct tags. */
export function stripConductTag(content: string): string {
  return content
    .replace(/<conduct>[\s\S]*?<\/conduct>/gi, '')
    .replace(/<conduct>[\s\S]*$/gi, '')
    .replace(/<\/conduct>/gi, '')
    .trim()
}

export function getCurrentAssessmentQuestion(messages: Message[]): string | null {
  const eligible = messages.filter(message => message.assessmentEligible !== false)
  const lastUserIndex = findLastIndex(eligible, message => message.role === 'user')
  const searchFrom = lastUserIndex >= 0 ? lastUserIndex - 1 : eligible.length - 1

  for (let index = searchFrom; index >= 0; index -= 1) {
    const message = eligible[index]
    if (message.role !== 'assistant') continue
    if (message.isQuestion === true || /[?؟]\s*$/.test(message.content.trim())) {
      return message.content.trim()
    }
  }

  for (let index = searchFrom; index >= 0; index -= 1) {
    const message = eligible[index]
    if (message.role === 'assistant' && message.content.trim()) {
      return message.content.trim()
    }
  }

  return null
}

export function decideConduct(
  signal: ConductSignal,
  currentState: ConductState | undefined,
  question: string | null,
  answer: string,
  messageIdentity?: string
): ConductDecision {
  const state = normalizeConductState(currentState)

  if (signal === 'professional' || signal === 'uncertain') {
    return { action: 'none', state, duplicate: false, signal: 'professional' }
  }

  const fingerprint = createConductFingerprint(question, answer, messageIdentity)

  if (
    fingerprint === state.lastViolationFingerprint &&
    state.lastViolationAction
  ) {
    return {
      action: state.lastViolationAction,
      state,
      duplicate: true,
      signal,
    }
  }

  const pendingQuestion = state.pendingQuestion ?? question

  // Once any warning has been issued, every new distinct violation pauses the
  // session. Exact retries are returned above and never escalate.
  if (state.warned) {
    return {
      action: 'pause',
      duplicate: false,
      signal,
      state: {
        ...state,
        warned: true,
        violationsAfterWarning: state.violationsAfterWarning + 1,
        pendingQuestion,
        lastViolationFingerprint: fingerprint,
        lastViolationAction: 'pause',
        lastViolationSignal: signal,
      },
    }
  }

  if (signal === 'explicit_abuse') {
    return {
      action: 'warning',
      duplicate: false,
      signal,
      state: {
        ...state,
        warned: true,
        pendingQuestion,
        lastViolationFingerprint: fingerprint,
        lastViolationAction: 'warning',
        lastViolationSignal: signal,
      },
    }
  }

  if (!state.redirected) {
    return {
      action: 'redirect',
      duplicate: false,
      signal,
      state: {
        ...state,
        redirected: true,
        pendingQuestion,
        lastViolationFingerprint: fingerprint,
        lastViolationAction: 'redirect',
        lastViolationSignal: signal,
      },
    }
  }

  return {
    action: 'warning',
    duplicate: false,
    signal,
    state: {
      ...state,
      warned: true,
      pendingQuestion,
      lastViolationFingerprint: fingerprint,
      lastViolationAction: 'warning',
      lastViolationSignal: signal,
    },
  }
}

export function buildConductResponse(
  action: ConductAction,
  signal: ConductSignal,
  language: Language,
  question: string | null
): string {
  const Arabic = language !== 'en'

  if (action === 'redirect') {
    if (Arabic) {
      const prefix = 'دعنا نحافظ على سياق المقابلة. أحتاج إجابة مرتبطة بالسؤال حتى أستطيع تقييمك بصورة عادلة.'
      return question ? `${prefix} السؤال هو: ${question}` : `${prefix} ما إجابتك؟`
    }

    const prefix = 'Let us keep this within the interview context. I need an answer connected to the question so I can assess you fairly.'
    return question ? `${prefix} The question is: ${question}` : `${prefix} What is your answer?`
  }

  if (action === 'warning') {
    if (signal === 'explicit_abuse') {
      return Arabic
        ? 'يمكننا متابعة المقابلة، لكن يلزم الحفاظ على أسلوب مهني ومحترم. إذا تكرر هذا الأسلوب فسأوقف الجلسة مؤقتاً.'
        : 'We can continue the interview, but the discussion must remain professional and respectful. If this happens again, I will pause the session.'
    }

    return Arabic
      ? 'يمكننا متابعة المقابلة، لكن يلزم الحفاظ على إجابات مهنية ومرتبطة بالأسئلة. إذا استمر هذا الأسلوب فسأوقف الجلسة مؤقتاً.'
      : 'We can continue the interview, but your answers must remain professional and connected to the questions. If this continues, I will pause the session.'
  }

  if (action === 'pause') {
    return Arabic
      ? 'تم إيقاف المقابلة مؤقتاً. يمكنك استئنافها عندما تكون مستعداً للمتابعة بأسلوب مهني.'
      : 'The interview has been paused. You can resume when you are ready to continue professionally.'
  }

  return ''
}

export function buildResumeResponse(
  language: Language,
  question: string | null
): string {
  if (question) return question

  return language === 'en'
    ? 'The interview has resumed. Please continue with your answer.'
    : 'تم استئناف المقابلة. تفضل بمتابعة إجابتك.'
}

export function createConductFingerprint(
  question: string | null,
  answer: string,
  messageIdentity?: string
): string {
  const identity = typeof messageIdentity === 'string' && messageIdentity.trim()
    ? `id:${messageIdentity.trim()}`
    : `content:${normalizeText(question ?? '')}\u241f${normalizeText(answer)}`
  const value = identity
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function findLastIndex<T>(
  items: T[],
  predicate: (item: T) => boolean
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index
  }
  return -1
}
