// lib/barbaros/director/director-types.ts
// Barbaros V4 — Director Type System (Tactical Decision Layer).
// Pure types only — zero runtime logic. Sibling to types.ts.
//
// PURPOSE:
//   The Director answers ONE question per turn: "What should Barbaros DO next?"
//   This is distinct from escalation-policy, which answers a different question:
//   "How deeply should I ANALYZE this answer?" (stay_tier1 / run_tier2 / run_tier3).
//
// CONTRACT (mirrors escalation-policy discipline):
//   - This file is the contract between the decider (decide-next-move.ts) and
//     its consumers (engine.ts → prompt-builder.ts).
//   - The Director READS a decision-relevant slice of state and RETURNS a single
//     decision. It never mutates state, never calls the LLM, never analyzes.
//   - Budgets enforce DISCIPLINED authority: every "hard" intervention costs
//     budget; when a counter reaches zero the decider falls back to a softer
//     intent. This is what prevents Barbaros from becoming an interrogator.
//
// DEPENDENCIES:
//   Imports type-only from ../types (the unified contract). No runtime imports.

import type {
  CandidateProfile,
  CompetencyCoverage,
  Contradiction,
  InterviewPhase,
  Plan,
  TopicMemory,
} from '../types'

// ============================================================================
// SECTION 1 — INTENT
// ============================================================================

/**
 * The tactical move Barbaros makes on its next turn.
 * EXACTLY ONE is selected per turn by the decider.
 *
 * Soft intents (no budget cost):   GO_DEEPER, REQUEST_EXAMPLE, OPEN_NEW_TOPIC,
 *                                  CLOSE_TOPIC
 * Hard intents (consume budget):   CHALLENGE, RAISE_DIFFICULTY, RETURN_TO_PREVIOUS
 */
export type DirectorIntent =
  | 'OPEN_NEW_TOPIC'      // move to a fresh competency / topic
  | 'GO_DEEPER'          // probe further within the current topic
  | 'REQUEST_EXAMPLE'    // demand a concrete, specific example
  | 'CHALLENGE'          // push back on a vague / weak / evasive answer
  | 'RAISE_DIFFICULTY'   // escalate complexity for a strong candidate
  | 'RETURN_TO_PREVIOUS' // revisit an earlier unresolved point / contradiction
  | 'CLOSE_TOPIC'        // wrap up current topic (coverage met or time tight)

// ============================================================================
// SECTION 2 — BUDGET
// ============================================================================

/**
 * Budgeted intervention counters for a single session.
 * Initialized at session start, scaled by plan duration, then decremented as
 * the decider spends interventions. A counter at zero blocks its intervention.
 */
export interface InterventionBudget {
  challenge: number               // remaining CHALLENGE moves
  interruption: number            // remaining hard interruptions
  contradictionEscalation: number // remaining RETURN_TO_PREVIOUS on contradictions
}

/**
 * The budget counters an intervention may consume.
 */
export type BudgetKey = keyof InterventionBudget

// ============================================================================
// SECTION 3 — REASONS (inspectability / tuning)
// ============================================================================

/**
 * Justification codes attached to every decision — for the audit trail and
 * threshold tuning. Mirrors escalation-policy's EscalationReason pattern so
 * decisions are always inspectable, never opaque.
 */
export type DirectorReason =
  | 'unaddressed_major_contradiction'
  | 'unaddressed_contradiction'
  | 'high_confidence_low_depth'
  | 'vague_answer'
  | 'evasive_answer'
  | 'missing_competency'
  | 'topic_coverage_complete'
  | 'time_running_low'
  | 'opening_phase'
  | 'closing_phase'
  | 'budget_exhausted_softened'
  | 'default_deepen'

// ============================================================================
// SECTION 4 — DECISION (the Director's output)
// ============================================================================

/**
 * The Director's output for a single turn. Inspectable and loggable.
 * Consumed by prompt-builder, which instructs the LLM to EXECUTE this intent
 * — rather than letting the LLM freely choose its own next move.
 *
 * `targetRef` points at what the intent acts on:
 *   - RETURN_TO_PREVIOUS / CHALLENGE              → a Contradiction.id
 *   - OPEN_NEW_TOPIC / CLOSE_TOPIC                → a competency key or topic
 *   - GO_DEEPER / REQUEST_EXAMPLE / RAISE_DIFFICULTY → current topic, or null
 *
 * `budgetSpent` records what this decision consumed (empty for soft intents).
 * `budgetAfter` is the full budget state once this decision is applied — the
 * engine persists it so the next turn sees the updated counters.
 */
export interface DirectorDecision {
  intent: DirectorIntent
  targetRef: string | null
  reasons: DirectorReason[]
  budgetSpent: Partial<Record<BudgetKey, number>>
  budgetAfter: InterventionBudget
  decidedAt: number
}

// ============================================================================
// SECTION 5 — CONTEXT (the decider's input)
// ============================================================================

/**
 * The decision-relevant slice the decider reads. Assembled by engine.ts from
 * the live InterviewState AFTER per-turn state patches are applied, so the
 * decider sees the most up-to-date contradictions, coverage, and profile.
 *
 * The Director deliberately does NOT receive the full InterviewState — only
 * this slice — keeping the decision layer decoupled and unit-testable.
 */
export interface DirectorContext {
  phase: InterviewPhase
  plan: Plan

  // Episodic layer — drives RETURN_TO_PREVIOUS / CHALLENGE / OPEN_NEW_TOPIC.
  // `unaddressedContradictions` is expected pre-sorted (major first), as
  // returned by contradiction-tracker.getUnaddressedContradictions().
  unaddressedContradictions: Contradiction[]
  recentTopics: TopicMemory[]

  // Coverage — drives OPEN_NEW_TOPIC / CLOSE_TOPIC.
  competencyCoverage: Record<string, CompetencyCoverage>
  missingCompetencies: string[]

  // Trait layer — drives HOW hard to push (e.g. high confidence + low depth).
  candidateProfile: CandidateProfile

  // Latest-answer signals — drive GO_DEEPER / REQUEST_EXAMPLE / CHALLENGE.
  // Sourced from the per-turn BehaviorSignals (vagueness, hasExamples).
  lastAnswerVagueness: 'low' | 'medium' | 'high'
  lastAnswerHasExamples: boolean

  // Time & budget.
  elapsedMinutes: number
  totalMinutes: number
  budget: InterventionBudget

  // Injected for deterministic time (testing / replay) — never Date.now().
  now: number
}
