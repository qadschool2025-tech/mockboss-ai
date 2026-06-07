// lib/barbaros/director/decide-next-move.ts
// Barbaros V4 — Director (Tactical Decision Layer).
//
// CONTRACT: Decision layer only. No analysis. No execution. No memory. No LLM.
//   - Sole authority for "what should Barbaros DO next?".
//   - Reads a DirectorContext slice, returns ONE DirectorDecision.
//   - Pure & deterministic: same context → same decision. `now` is injected.
//   - Thresholds and per-plan budgets are centralized here — change once.
//
// DISCIPLINE (the anti-interrogator rule):
//   Hard intents (CHALLENGE, RAISE_DIFFICULTY, RETURN_TO_PREVIOUS) each cost
//   budget. When a counter hits zero, the decider softens to a no-cost intent
//   instead of repeating the hard move. This rations authority across the
//   session the way a real interviewer picks their battles.
//
// CLOSING WINDOW:
//   The final 90 seconds are protected.
//   - >90s: normal assessment behavior.
//   - 90–60s: only a final candidate question is allowed.
//   - 60–30s: prepare to close. No new evaluation question.
//   - 30–0s: handled by page.tsx, which starts the farewell screen.
//
// PRIORITY ORDER (first match wins):
//   1. Closing window                           → CLOSE_TOPIC
//   2. Major unresolved contradiction (+budget) → RETURN_TO_PREVIOUS
//   3. Closing phase                            → CLOSE_TOPIC
//   4. Opening phase                            → OPEN_NEW_TOPIC
//   5. Lesser unresolved contradiction (+budget)→ RETURN_TO_PREVIOUS
//   6. Strong but shallow                       → RAISE_DIFFICULTY / soften
//   7. Vague or evasive                         → CHALLENGE / soften
//   8. No concrete example                      → REQUEST_EXAMPLE
//   9. Topic sufficiently covered (plan-aware)  → OPEN_NEW_TOPIC / CLOSE_TOPIC  [TEMP]
//  10. Topic saturated + gaps remain            → OPEN_NEW_TOPIC
//  11. Default                                  → GO_DEEPER

import type { Plan } from '../types';
import type {
  BudgetKey,
  DirectorContext,
  DirectorDecision,
  DirectorIntent,
  DirectorReason,
  InterventionBudget,
} from './director-types';

// ─── Thresholds (change here only) ─────────────────────────────────────────────

const THRESHOLDS = {
  highConfidence: 70,            // candidateProfile.confidenceLevel ≥ → "can take more"
  lowDepth: 50,                  // candidateProfile.depth < → answer lacks substance
  finalQuestionSeconds: 90,      // final candidate question window starts here
  prepareClosingSeconds: 60,     // no new evaluation question after this point
  maxTopicVisits: 3,             // a topic visited ≥ this is considered saturated
} as const;

// ─── Per-plan starting budgets ─────────────────────────────────────────────────
// Scaled by session duration. Matches the agreed Expert profile
// (challenge 4, interruption 2, contradictionEscalation 2).

const BUDGET_BY_PLAN: Record<Plan, InterventionBudget> = {
  free:   { challenge: 2, interruption: 1, contradictionEscalation: 1 },
  go:     { challenge: 2, interruption: 1, contradictionEscalation: 1 },
  pro:    { challenge: 3, interruption: 2, contradictionEscalation: 2 },
  expert: { challenge: 4, interruption: 2, contradictionEscalation: 2 },
};

// ─── Per-plan "sufficiently covered" visit threshold ────────────────────────────
//
// TEMPORARY
// Replace visit-based coverage gating with longitudinal evidence progression
// from CandidateEvolutionProfile (longitudinal engine). This is a local stopgap
// to break the GO_DEEPER loop on good answers; it is NOT the final coverage
// model. Plan-aware so Go favors breadth (move on sooner) while Pro/Expert allow
// more depth. NOTE: the effective ceiling is bounded by THRESHOLDS.maxTopicVisits
// (still plan-blind) until that is unified in the deferred audit.

const COVERAGE_SUFFICIENT_VISITS_BY_PLAN: Record<Plan, number> = {
  free:   2,
  go:     2,
  pro:    3,
  expert: 3,
};

/**
 * Initialize the intervention budget for a session. Called once at session
 * start by the engine and persisted on state between turns.
 */
export function createInterventionBudget(plan: Plan): InterventionBudget {
  const base = BUDGET_BY_PLAN[plan] ?? BUDGET_BY_PLAN.free;
  return { ...base };
}

// ─── Main Decision Function ─────────────────────────────────────────────────────

/**
 * Sole entry point. Reads the decision-relevant slice of state and returns a
 * single tactical decision. Pure — never mutates `ctx`.
 */
export function decideNextMove(ctx: DirectorContext): DirectorDecision {
  const { now, budget } = ctx;

  const secondsRemaining = Math.max(
    0,
    (ctx.totalMinutes - ctx.elapsedMinutes) * 60
  );

  // 1. Closing Window — highest priority.
  //    Last 90 seconds are reserved for controlled closing behavior.
  //    90–60s: only the final candidate question is allowed.
  //    60–30s: no new evaluation question. Prepare to close.
  //    30–0s: handled by page.tsx, which starts the farewell.
  if (secondsRemaining <= THRESHOLDS.prepareClosingSeconds) {
    return makeDecision(
      'CLOSE_TOPIC',
      'prepare_closing',
      ['time_running_low'],
      budget,
      null,
      now,
    );
  }

  if (secondsRemaining <= THRESHOLDS.finalQuestionSeconds) {
    return makeDecision(
      'CLOSE_TOPIC',
      'final_candidate_question',
      ['time_running_low'],
      budget,
      null,
      now,
    );
  }

  // 2. Flagship move — a MAJOR unresolved contradiction. Worth pursuing while
  //    outside the protected closing window, but only if escalation budget remains.
  const major = ctx.unaddressedContradictions.find((c) => c.severity === 'major');
  if (major && budget.contradictionEscalation > 0) {
    return makeDecision(
      'RETURN_TO_PREVIOUS',
      major.id,
      ['unaddressed_major_contradiction'],
      budget,
      'contradictionEscalation',
      now,
    );
  }

  // 3. Closing phase — wind down, no new probing.
  if (ctx.phase === 'closing') {
    return makeDecision('CLOSE_TOPIC', null, ['closing_phase'], budget, null, now);
  }

  // 4. Opening phase — get into a real topic.
  if (ctx.phase === 'opening') {
    return makeDecision(
      'OPEN_NEW_TOPIC',
      pickMissingCompetency(ctx),
      ['opening_phase'],
      budget,
      null,
      now,
    );
  }

  // 5. A lesser (moderate/minor) unresolved contradiction, if budget remains.
  //    Contradictions are pre-sorted major-first; majors are handled above.
  const lesser = ctx.unaddressedContradictions[0];
  if (lesser && budget.contradictionEscalation > 0) {
    return makeDecision(
      'RETURN_TO_PREVIOUS',
      lesser.id,
      ['unaddressed_contradiction'],
      budget,
      'contradictionEscalation',
      now,
    );
  }

  // 6. Strong but shallow — escalate difficulty (soften if budget exhausted).
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
      );
    }

    return makeDecision(
      'REQUEST_EXAMPLE',
      currentTopic(ctx),
      ['high_confidence_low_depth', 'budget_exhausted_softened'],
      budget,
      null,
      now,
    );
  }

  // 7. Vague or evasive answer — challenge it (soften if budget exhausted).
  if (ctx.lastAnswerVagueness === 'high') {
    const reasons: DirectorReason[] = ctx.lastAnswerHasExamples
      ? ['vague_answer']
      : ['evasive_answer'];

    if (budget.challenge > 0) {
      return makeDecision('CHALLENGE', currentTopic(ctx), reasons, budget, 'challenge', now);
    }

    return makeDecision(
      'REQUEST_EXAMPLE',
      currentTopic(ctx),
      [...reasons, 'budget_exhausted_softened'],
      budget,
      null,
      now,
    );
  }

  // 8. No concrete example offered — ask for one (no budget cost).
  if (!ctx.lastAnswerHasExamples) {
    return makeDecision('REQUEST_EXAMPLE', currentTopic(ctx), ['vague_answer'], budget, null, now);
  }

  // 9. TEMPORARY — current topic sufficiently covered for this plan.
  //    Reached only for concrete answers (not closing/opening, no unresolved
  //    contradiction, vagueness is not 'high', and an example WAS given — see
  //    branches above). Once the current topic has been engaged enough times
  //    for the plan, move on instead of deepening further.
  const coverageVisitsThreshold =
    COVERAGE_SUFFICIENT_VISITS_BY_PLAN[ctx.plan] ??
    COVERAGE_SUFFICIENT_VISITS_BY_PLAN.free;

  if (currentTopicVisits(ctx) >= coverageVisitsThreshold) {
    if (ctx.missingCompetencies.length > 0) {
      return makeDecision(
        'OPEN_NEW_TOPIC',
        pickMissingCompetency(ctx),
        ['topic_coverage_complete'],
        budget,
        null,
        now,
      );
    }

    return makeDecision(
      'CLOSE_TOPIC',
      currentTopic(ctx),
      ['topic_coverage_complete'],
      budget,
      null,
      now,
    );
  }

  // 10. Current topic saturated and competency gaps remain — open a new topic.
  if (isCurrentTopicSaturated(ctx) && ctx.missingCompetencies.length > 0) {
    return makeDecision(
      'OPEN_NEW_TOPIC',
      pickMissingCompetency(ctx),
      ['missing_competency'],
      budget,
      null,
      now,
    );
  }

  // 11. Default — probe deeper on the current thread.
  return makeDecision('GO_DEEPER', currentTopic(ctx), ['default_deepen'], budget, null, now);
}

// ─── Inspection helper (audit trail / debugging) ────────────────────────────────

/**
 * Human-readable one-line summary of a decision. Mirrors escalation-policy's
 * summarizeDecision for a consistent audit format.
 */
export function summarizeDecision(decision: DirectorDecision): string {
  const target = decision.targetRef ? ` → ${decision.targetRef}` : '';
  const spent = Object.keys(decision.budgetSpent).length
    ? ` [spent: ${Object.entries(decision.budgetSpent)
        .map(([k, v]) => `${k}×${v}`)
        .join(', ')}]`
    : '';

  return `${decision.intent}${target} — ${decision.reasons.join(', ')}${spent}`;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────────

/**
 * Build a decision and apply any budget cost in one place, so spending is
 * never duplicated across branches.
 */
function makeDecision(
  intent: DirectorIntent,
  targetRef: string | null,
  reasons: DirectorReason[],
  budget: InterventionBudget,
  spendKey: BudgetKey | null,
  now: number,
): DirectorDecision {
  let budgetAfter: InterventionBudget = budget;
  const budgetSpent: Partial<Record<BudgetKey, number>> = {};

  if (spendKey) {
    budgetAfter = { ...budget, [spendKey]: Math.max(0, budget[spendKey] - 1) };
    budgetSpent[spendKey] = 1;
  }

  return { intent, targetRef, reasons, budgetSpent, budgetAfter, decidedAt: now };
}

/**
 * Most recently visited topic name, or null if none recorded yet.
 */
function currentTopic(ctx: DirectorContext): string | null {
  if (ctx.recentTopics.length === 0) return null;

  let latest = ctx.recentTopics[0];

  for (const t of ctx.recentTopics) {
    if (t.lastVisitedAt > latest.lastVisitedAt) latest = t;
  }

  return latest.topic;
}

/**
 * Visit count of the current topic, or 0 if none recorded yet.
 *
 * NOTE: `timesVisited` is incremented per candidate message that mentions the
 * topic keyword (topic-memory.ts), so it is a candidate-vocabulary proxy for
 * probing depth — not a precise interviewer follow-up count. Used here only as
 * a stopgap gate.
 */
function currentTopicVisits(ctx: DirectorContext): number {
  const topic = currentTopic(ctx);
  if (!topic) return 0;

  const record = ctx.recentTopics.find((t) => t.topic === topic);
  return record ? record.timesVisited : 0;
}

/**
 * First competency still missing coverage, or null.
 */
function pickMissingCompetency(ctx: DirectorContext): string | null {
  return ctx.missingCompetencies.length > 0 ? ctx.missingCompetencies[0] : null;
}

/**
 * Whether the current topic has been visited enough to be considered saturated.
 */
function isCurrentTopicSaturated(ctx: DirectorContext): boolean {
  const topic = currentTopic(ctx);
  if (!topic) return false;

  const record = ctx.recentTopics.find((t) => t.topic === topic);
  return !!record && record.timesVisited >= THRESHOLDS.maxTopicVisits;
}
