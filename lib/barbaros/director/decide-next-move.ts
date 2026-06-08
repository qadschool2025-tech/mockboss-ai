// lib/barbaros/director/decide-next-move.ts
// Barbaros V4 — Director (Tactical Decision Layer).
//
// CONTRACT: Decision layer only. No analysis. No execution. No memory. No LLM.
//   - Sole authority for "what should Barbaros DO next?"
//   - Reads a DirectorContext slice, returns ONE DirectorDecision.
//   - Pure and deterministic: same context -> same decision. `now` is injected.
//   - Thresholds and per-plan budgets are centralized here. Change once.
//
// DISCIPLINE, anti-interrogator rule:
//   Hard intents (CHALLENGE, RAISE_DIFFICULTY, RETURN_TO_PREVIOUS) each cost
//   budget. When a counter hits zero, the decider softens to a no-cost intent
//   instead of repeating the hard move. This rations authority across the
//   session the way a real interviewer picks their battles.
//
// CLOSING WINDOW, graceful wind-down:
//   The final window winds the interview down instead of opening new threads.
//   Desired flow:
//   - >180s: normal assessment behavior.
//   - 180-90s: FINAL_QUESTION, one last consolidating question. No new topic.
//   - <=90s: INVITE_QUESTIONS, no new evaluation question. Prepare to close.
//   - The actual farewell + report handoff is owned by engine + page.tsx.
//   - This file does not generate the farewell. It only prevents late new topics.
//
// PRIORITY ORDER, first match wins:
//   1. Closing window, <=90 -> INVITE_QUESTIONS, <=180 -> FINAL_QUESTION
//   2. Major unresolved contradiction with budget -> RETURN_TO_PREVIOUS
//   3. Closing phase -> INVITE_QUESTIONS
//   4. Opening phase -> OPEN_NEW_TOPIC
//   5. Lesser unresolved contradiction with budget -> RETURN_TO_PREVIOUS
//   6. Strong but shallow -> RAISE_DIFFICULTY or soften
//   7. Vague or evasive -> CHALLENGE or soften
//   8. No concrete example -> REQUEST_EXAMPLE
//   9. Topic sufficiently covered, plan-aware -> OPEN_NEW_TOPIC or CLOSE_TOPIC
//  10. Topic saturated + gaps remain -> OPEN_NEW_TOPIC
//  11. Default -> GO_DEEPER

import type { Plan } from '../types'
import type {
  BudgetKey,
  DirectorContext,
  DirectorDecision,
  DirectorIntent,
  DirectorReason,
  InterventionBudget,
} from './director-types'

// ─── Thresholds ───────────────────────────────────────────────────────────────

const THRESHOLDS = {
  highConfidence: 70,
  lowDepth: 50,

  // Ask the last assessment question earlier so the candidate has time to answer.
  finalQuestionSeconds: 180,

  // After this point, do not open any new evaluation line.
  // The system should prepare the farewell and report handoff.
  prepareClosingSeconds: 90,

  maxTopicVisits: 3,
} as const

// ─── Per-plan starting budgets ────────────────────────────────────────────────

const BUDGET_BY_PLAN: Record<Plan, InterventionBudget> = {
  free:   { challenge: 2, interruption: 1, contradictionEscalation: 1 },
  go:     { challenge: 2, interruption: 1, contradictionEscalation: 1 },
  pro:    { challenge: 3, interruption: 2, contradictionEscalation: 2 },
  expert: { challenge: 4, interruption: 2, contradictionEscalation: 2 },
}

// ─── Per-plan coverage threshold ──────────────────────────────────────────────

const COVERAGE_SUFFICIENT_VISITS_BY_PLAN: Record<Plan, number> = {
  free:   2,
  go:     2,
  pro:    3,
  expert: 3,
}

/**
 * Initialize the intervention budget for a session.
 */
export function createInterventionBudget(plan: Plan): InterventionBudget {
  const base = BUDGET_BY_PLAN[plan] ?? BUDGET_BY_PLAN.free
  return { ...base }
}

// ─── Main Decision Function ──────────────────────────────────────────────────

/**
 * Sole entry point.
 * Reads the decision-relevant slice of state and returns a single tactical
 * decision. Pure. Never mutates ctx.
 */
export function decideNextMove(ctx: DirectorContext): DirectorDecision {
  const { now, budget } = ctx

  // Prefer the engine-supplied absolute seconds.
  // Fall back to deriving from minutes so this stays correct before engine.ts
  // populates the field.
  const secondsRemaining =
    typeof ctx.secondsRemaining === 'number'
      ? Math.max(0, ctx.secondsRemaining)
      : Math.max(0, (ctx.totalMinutes - ctx.elapsedMinutes) * 60)

  // 1. Closing window.
  // Tighter window first. At <=90s, stop new evaluation questions entirely.
  // At <=180s, ask exactly one final consolidating question.
  if (secondsRemaining <= THRESHOLDS.prepareClosingSeconds) {
    return makeDecision(
      'INVITE_QUESTIONS',
      null,
    ['invite_questions_window'],
      budget,
      null,
      now,
    )
  }

  if (secondsRemaining <= THRESHOLDS.finalQuestionSeconds) {
    return makeDecision(
      'FINAL_QUESTION',
      null,
      ['final_question_window'],
      budget,
      null,
      now,
    )
  }

  // 2. Major unresolved contradiction.
  const major = ctx.unaddressedContradictions.find((c) => c.severity === 'major')
  if (major && budget.contradictionEscalation > 0) {
    return makeDecision(
      'RETURN_TO_PREVIOUS',
      major.id,
      ['unaddressed_major_contradiction'],
      budget,
      'contradictionEscalation',
      now,
    )
  }

  // 3. Closing phase.
  if (ctx.phase === 'closing') {
    return makeDecision(
      'INVITE_QUESTIONS',
      null,
      ['closing_phase'],
      budget,
      null,
      now,
    )
  }

  // 4. Opening phase.
  if (ctx.phase === 'opening') {
    return makeDecision(
      'OPEN_NEW_TOPIC',
      pickMissingCompetency(ctx),
      ['opening_phase'],
      budget,
      null,
      now,
    )
  }

  // 5. Lesser unresolved contradiction.
  const lesser = ctx.unaddressedContradictions[0]
  if (lesser && budget.contradictionEscalation > 0) {
    return makeDecision(
      'RETURN_TO_PREVIOUS',
      lesser.id,
      ['unaddressed_contradiction'],
      budget,
      'contradictionEscalation',
      now,
    )
  }

  // 6. Strong but shallow.
  if (
    ctx.candidateProfile.confidenceLevel >= THRESHOLDS.highConfidence &&
    ctx.candidateProfile.depth < THRESHOLDS.lowDepth
  ) {
    if (budget.interruption > 0) {
      return makeDecision(
        'RAISE_DIFFICULTY',
        currentTopic(ctx),
        ['high_confidence_low_depth'],
        budget,
        'interruption',
        now,
      )
    }

    return makeDecision(
      'REQUEST_EXAMPLE',
      currentTopic(ctx),
      ['high_confidence_low_depth', 'budget_exhausted_softened'],
      budget,
      null,
      now,
    )
  }

  // 7. Vague or evasive answer.
  if (ctx.lastAnswerVagueness === 'high') {
    const reasons: DirectorReason[] = ctx.lastAnswerHasExamples
      ? ['vague_answer']
      : ['evasive_answer']

    if (budget.challenge > 0) {
      return makeDecision(
        'CHALLENGE',
        currentTopic(ctx),
        reasons,
        budget,
        'challenge',
        now,
      )
    }

    return makeDecision(
      'REQUEST_EXAMPLE',
      currentTopic(ctx),
      [...reasons, 'budget_exhausted_softened'],
      budget,
      null,
      now,
    )
  }

  // 8. No concrete example.
  if (!ctx.lastAnswerHasExamples) {
    return makeDecision(
      'REQUEST_EXAMPLE',
      currentTopic(ctx),
      ['vague_answer'],
      budget,
      null,
      now,
    )
  }

  // 9. Current topic sufficiently covered for this plan.
  const coverageVisitsThreshold =
    COVERAGE_SUFFICIENT_VISITS_BY_PLAN[ctx.plan] ??
    COVERAGE_SUFFICIENT_VISITS_BY_PLAN.free

  if (currentTopicVisits(ctx) >= coverageVisitsThreshold) {
    if (ctx.missingCompetencies.length > 0) {
      return makeDecision(
        'OPEN_NEW_TOPIC',
        pickMissingCompetency(ctx),
        ['topic_coverage_complete'],
        budget,
        null,
        now,
      )
    }

    return makeDecision(
      'CLOSE_TOPIC',
      currentTopic(ctx),
      ['topic_coverage_complete'],
      budget,
      null,
      now,
    )
  }

  // 10. Current topic saturated and gaps remain.
  if (isCurrentTopicSaturated(ctx) && ctx.missingCompetencies.length > 0) {
    return makeDecision(
      'OPEN_NEW_TOPIC',
      pickMissingCompetency(ctx),
      ['missing_competency'],
      budget,
      null,
      now,
    )
  }

  // 11. Default.
  return makeDecision(
    'GO_DEEPER',
    currentTopic(ctx),
    ['default_deepen'],
    budget,
    null,
    now,
  )
}

// ─── Inspection helper ────────────────────────────────────────────────────────

export function summarizeDecision(decision: DirectorDecision): string {
  const target = decision.targetRef ? ` -> ${decision.targetRef}` : ''
  const spent = Object.keys(decision.budgetSpent).length
    ? ` [spent: ${Object.entries(decision.budgetSpent)
        .map(([k, v]) => `${k}×${v}`)
        .join(', ')}]`
    : ''

  return `${decision.intent}${target} - ${decision.reasons.join(', ')}${spent}`
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function makeDecision(
  intent: DirectorIntent,
  targetRef: string | null,
  reasons: DirectorReason[],
  budget: InterventionBudget,
  spendKey: BudgetKey | null,
  now: number,
): DirectorDecision {
  let budgetAfter: InterventionBudget = budget
  const budgetSpent: Partial<Record<BudgetKey, number>> = {}

  if (spendKey) {
    budgetAfter = { ...budget, [spendKey]: Math.max(0, budget[spendKey] - 1) }
    budgetSpent[spendKey] = 1
  }

  return {
    intent,
    targetRef,
    reasons,
    budgetSpent,
    budgetAfter,
    decidedAt: now,
  }
}

function currentTopic(ctx: DirectorContext): string | null {
  if (ctx.recentTopics.length === 0) return null

  let latest = ctx.recentTopics[0]

  for (const t of ctx.recentTopics) {
    if (t.lastVisitedAt > latest.lastVisitedAt) latest = t
  }

  return latest.topic
}

function currentTopicVisits(ctx: DirectorContext): number {
  const topic = currentTopic(ctx)
  if (!topic) return 0

  const record = ctx.recentTopics.find((t) => t.topic === topic)
  return record ? record.timesVisited : 0
}

function pickMissingCompetency(ctx: DirectorContext): string | null {
  return ctx.missingCompetencies.length > 0 ? ctx.missingCompetencies[0] : null
}

function isCurrentTopicSaturated(ctx: DirectorContext): boolean {
  const topic = currentTopic(ctx)
  if (!topic) return false

  const record = ctx.recentTopics.find((t) => t.topic === topic)
  return !!record && record.timesVisited >= THRESHOLDS.maxTopicVisits
}
