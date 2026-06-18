// lib/barbaros/state/source-consistency-probe.ts
// Barbaros — Source Consistency (Group B: deterministic verification gate).
//
// Pure decision layer. It never detects issues, calls the LLM, changes scoring,
// report, panel, timing, or closing. It never overwrites cvEvidence or
// candidateStatement. addressed becomes true only after a related clarification.

import {
  normalizeName,
  isPlausibleNameLine,
  parseExperienceRange,
} from './source-consistency.ts'

import type {
  Language,
  Message,
  PendingSourceConsistency,
  SourceConsistencyIssue,
} from '../types'

export const MAX_SOURCE_CONSISTENCY_PROMPTS = 2

const PRIORITY: readonly string[] = [
  'name_mismatch',
  'experience_mismatch',
]

const COURTESY_ONLY = new Set([
  'ok',
  'okay',
  'thanks',
  'thank you',
  'sure',
  'fine',
  'hello',
  'hi',
  'yes',
  'no',
  'حسنا',
  'شكرا',
  'تمام',
  'طيب',
  'اوك',
  'نعم',
  'لا',
  'مرحبا',
  'اهلا',
])

const CONFUSION_MARKERS: readonly string[] = [
  'لم افهم',
  'ما فهمت',
  'مافهمت',
  'لا افهم',
  'اعد',
  'كرر',
  'ماذا تقصد',
  'وضح',
  'didnt understand',
  'dont understand',
  'did not understand',
  'do not understand',
  'come again',
  'say again',
  'repeat',
  'what do you mean',
  'pardon',
]

const NAME_LEADINS: readonly string[] = [
  'افضل استخدام',
  'افضل اسم',
  'اسمي هو',
  'my name is',
  'call me',
  'use the name',
  'اسمي',
  'نادني',
  'اعتمد',
]

const NAME_RESOLUTION_PHRASES: readonly string[] = [
  'الاسم في السيره',
  'الاسم المدخل',
  'الاسم الموجود',
  'الموجود في السيره',
  'كلاهما',
  'اسم مختصر',
  'مختصر',
  'اللقب',
  'name in the cv',
  'name on the cv',
  'entered name is correct',
  'both are mine',
  'nickname',
  'shortened name',
]

const SOURCE_DEFERRAL_PHRASES: readonly string[] = [
  'الموجود في السيره هو الصحيح',
  'الموجوده في السيره هي الصحيحه',
  'السيره هي الصحيحه',
  'المدخله هي الاحدث',
  'البيانات المدخله هي الاحدث',
  'المدخله هي الصحيحه',
  'the cv value is correct',
  'the cv is correct',
  'the entered information is newer',
  'the entered data is newer',
]

const EXPERIENCE_ZERO_PHRASES: readonly string[] = [
  'خريج جديد',
  'حديث التخرج',
  'حديث تخرج',
  'متخرج جديد',
  'اقل من سنه',
  'اقل من عام',
  'بدون خبره',
  'لا خبره',
  'ما عندي خبره',
  'no experience',
  'fresh graduate',
  'fresh grad',
  'recent graduate',
  'less than a year',
  'less than one year',
  'newly graduated',
  'just graduated',
]

export interface GateInput {
  issues: SourceConsistencyIssue[]
  pending: PendingSourceConsistency | null
  lastUserMsg: Message | null
  canAsk: boolean
  promptCount: number
  now: number
}

export type GateDecision =
  | {
      action: 'ask'
      issue: SourceConsistencyIssue
      issues: SourceConsistencyIssue[]
      pendingAfter: PendingSourceConsistency
      promptCountAfter: number
      verificationConsumedThisTurn: boolean
    }
  | {
      action: 'continue'
      issues: SourceConsistencyIssue[]
      pendingAfter: PendingSourceConsistency | null
      resolvedThisTurn: boolean
      verificationConsumedThisTurn: boolean
      promptCountAfter: number
    }

export function decideSourceConsistencyGate(
  input: GateInput
): GateDecision {
  const {
    issues,
    pending,
    lastUserMsg,
    canAsk,
    promptCount,
    now,
  } = input

  const budgetLeft =
    promptCount < MAX_SOURCE_CONSISTENCY_PROMPTS

  if (pending) {
    const issue =
      issues.find(item => item.id === pending.issueId) ?? null

    if (!issue) {
      return {
        action: 'continue',
        issues,
        pendingAfter: null,
        resolvedThisTurn: false,
        verificationConsumedThisTurn: true,
        promptCountAfter: promptCount,
      }
    }

    if (isValidClarification(issue, lastUserMsg)) {
      const resolved = issues.map(item =>
        item.id === pending.issueId &&
        item.addressed !== true
          ? {
              ...item,
              addressed: true,
              clarification:
                (lastUserMsg as Message).content.trim(),
              clarifiedAt: now,
            }
          : item
      )

      const next =
        canAsk && budgetLeft
          ? selectNextSourceConsistencyIssue(resolved)
          : null

      if (next && typeof next.id === 'string') {
        return {
          action: 'ask',
          issue: next,
          issues: resolved,
          pendingAfter: {
            issueId: next.id,
            askedAt: now,
            attempts: 1,
          },
          promptCountAfter: promptCount + 1,
          verificationConsumedThisTurn: true,
        }
      }

      return {
        action: 'continue',
        issues: resolved,
        pendingAfter: null,
        resolvedThisTurn: true,
        verificationConsumedThisTurn: true,
        promptCountAfter: promptCount,
      }
    }

    if (canAsk && budgetLeft) {
      return {
        action: 'ask',
        issue,
        issues,
        pendingAfter: {
          issueId: pending.issueId,
          askedAt: now,
          attempts: (pending.attempts ?? 1) + 1,
        },
        promptCountAfter: promptCount + 1,
        verificationConsumedThisTurn: true,
      }
    }

    if (!budgetLeft) {
      const exhausted = issues.map(item =>
        item.id === pending.issueId
          ? {
              ...item,
              verificationExhausted: true,
            }
          : item
      )

      return {
        action: 'continue',
        issues: exhausted,
        pendingAfter: null,
        resolvedThisTurn: false,
        verificationConsumedThisTurn: true,
        promptCountAfter: promptCount,
      }
    }

    return {
      action: 'continue',
      issues,
      pendingAfter: pending,
      resolvedThisTurn: false,
      verificationConsumedThisTurn: true,
      promptCountAfter: promptCount,
    }
  }

  if (canAsk && budgetLeft) {
    const next =
      selectNextSourceConsistencyIssue(issues)

    if (next && typeof next.id === 'string') {
      return {
        action: 'ask',
        issue: next,
        issues,
        pendingAfter: {
          issueId: next.id,
          askedAt: now,
          attempts: 1,
        },
        promptCountAfter: promptCount + 1,
        verificationConsumedThisTurn: false,
      }
    }
  }

  return {
    action: 'continue',
    issues,
    pendingAfter: null,
    resolvedThisTurn: false,
    verificationConsumedThisTurn: false,
    promptCountAfter: promptCount,
  }
}

export function selectNextSourceConsistencyIssue(
  issues: SourceConsistencyIssue[]
): SourceConsistencyIssue | null {
  for (const type of PRIORITY) {
    const found = issues.find(
      item =>
        item.issueType === type &&
        item.addressed !== true &&
        item.verificationExhausted !== true &&
        typeof item.id === 'string'
    )

    if (found) return found
  }

  return null
}

export function assessmentExclusion(
  decision: GateDecision
): {
  excludeLastUserMessageFromAssessment: boolean
  excludeResponseFromAssessment: boolean
} {
  return {
    excludeLastUserMessageFromAssessment:
      decision.verificationConsumedThisTurn === true,

    excludeResponseFromAssessment:
      decision.action === 'ask',
  }
}

export function isValidClarification(
  issue: SourceConsistencyIssue | null,
  msg: Message | null
): boolean {
  if (!issue || !msg || msg.role !== 'user') {
    return false
  }

  const raw = (msg.content ?? '').trim()

  if (raw.length === 0) {
    return false
  }

  const norm = normalizeName(raw)

  if (!norm) {
    return false
  }

  if (COURTESY_ONLY.has(norm)) {
    return false
  }

  if (
    CONFUSION_MARKERS.some(marker =>
      norm.includes(marker)
    )
  ) {
    return false
  }

  return issue.issueType === 'experience_mismatch'
    ? isValidExperienceClarification(raw, norm)
    : isValidNameClarification(norm, issue)
}

function isValidNameClarification(
  norm: string,
  issue: SourceConsistencyIssue
): boolean {
  if (
    NAME_RESOLUTION_PHRASES.some(phrase =>
      norm.includes(phrase)
    )
  ) {
    return true
  }

  const afterLead = extractNameAfterLeadIn(norm)

  if (
    afterLead &&
    isPlausibleNameLine(afterLead)
  ) {
    return true
  }

  if (isPlausibleNameLine(norm)) {
    const refs = nameRefTokens(issue)

    for (const token of norm.split(' ')) {
      if (
        token.length >= 2 &&
        refs.has(token)
      ) {
        return true
      }
    }
  }

  return false
}

function isValidExperienceClarification(
  raw: string,
  norm: string
): boolean {
  if (parseExperienceRange(raw) !== null) {
    return true
  }

  if (
    EXPERIENCE_ZERO_PHRASES.some(phrase =>
      norm.includes(phrase)
    )
  ) {
    return true
  }

  if (
    SOURCE_DEFERRAL_PHRASES.some(phrase =>
      norm.includes(phrase)
    )
  ) {
    return true
  }

  return false
}

function extractNameAfterLeadIn(
  norm: string
): string | null {
  for (const lead of NAME_LEADINS) {
    const index = norm.indexOf(lead)

    if (index !== -1) {
      const after =
        norm.slice(index + lead.length).trim()

      if (after) {
        return after
      }
    }
  }

  return null
}

function nameRefTokens(
  issue: SourceConsistencyIssue
): Set<string> {
  const tokens = new Set<string>()

  for (
    const source of [
      issue.candidateStatement,
      issue.cvEvidence,
    ]
  ) {
    for (
      const token of
      normalizeName(source ?? '').split(' ')
    ) {
      if (token.length >= 2) {
        tokens.add(token)
      }
    }
  }

  return tokens
}


/**
 * Rebuilds resolved source-consistency clarifications as conversation-only
 * question/answer pairs. These messages are supplied to the interview LLM for
 * factual continuity, but the engine keeps using evaluationMessages for every
 * assessment, scoring, coverage, contradiction, weakness, and growth path.
 */
export function buildSourceConsistencyContextMessages(
  baseMessages: Message[],
  issues: SourceConsistencyIssue[],
  language: Language | string
): Message[] {
  const contextMessages: Message[] = []

  for (const issue of issues) {
    const clarification =
      typeof issue.clarification === 'string'
        ? issue.clarification.trim()
        : ''

    if (
      issue.addressed !== true ||
      !clarification ||
      !Number.isFinite(issue.clarifiedAt)
    ) {
      continue
    }

    const clarifiedAt = issue.clarifiedAt as number

    contextMessages.push(
      {
        role: 'assistant',
        content: buildVerificationQuestion(
          issue.issueType ?? '',
          language
        ),
        timestamp: Math.max(0, clarifiedAt - 1),
        isQuestion: true,
      },
      {
        role: 'user',
        content: clarification,
        timestamp: clarifiedAt,
      }
    )
  }

  return [...baseMessages, ...contextMessages]
    .sort((left, right) => left.timestamp - right.timestamp)
}

export function buildVerificationQuestion(
  issueType: string,
  language: Language | string
): string {
  if (issueType === 'experience_mismatch') {
    return language === 'ar'
      ? 'تظهر سنوات الخبرة بصورة مختلفة بين البيانات المُدخلة والسيرة الذاتية. كيف تصف سنوات خبرتك الفعلية؟'
      : 'Your years of experience appear differently between the information provided and your CV. How would you describe your actual years of experience?'
  }

  return language === 'ar'
    ? 'لاحظت اختلافاً بين الاسم المُدخل والاسم الظاهر في السيرة الذاتية. ما الاسم الذي تفضّل اعتماده خلال هذه المقابلة؟'
    : 'I noticed a difference between the name provided and the name shown on your CV. Which name would you prefer to use during this interview?'
}
