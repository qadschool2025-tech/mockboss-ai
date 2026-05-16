// lib/barbaros/state/phase-engine.ts
// Decides when to transition between interview phases.
//
// CONTRACT CHECK (against types.ts v3):
//   InterviewState fields used:
//     phase, phaseQuestionCount, phaseStartedAt,
//     config.plan, contradictions, metrics.startedAt,
//     metrics.pressureEscalations, candidateProfile.engagement,
//     competencyCoverage, isComplete
//   Returns: PhaseTransitionResult
//     { previousPhase, nextPhase, transitioned, reason }
//
// PHASES (7):
//   opening → motivation → cv_deep_dive → technical
//   → behavioral → pressure → closing
//
// ARCHITECTURAL RULES:
//   - Pure functions. No mutation. No LLM calls.
//   - All time queries use `Date.now()` internally for live decisions,
//     but downstream consumers may inject time for testing.

import type {
  InterviewState,
  InterviewPhase,
  PhaseTransitionResult,
} from "../types";
import {
  PHASE_ORDER,
  MAX_QUESTIONS_PER_PHASE,
  MIN_QUESTIONS_PER_PHASE,
  TIME_LIMITS,
} from "../constants";
import { getNextPhase } from "./session-state";

// ─────────────────────────────────────────────────────────────
// SECTION 1 — TIME BUDGETING
// ─────────────────────────────────────────────────────────────

function getSessionDurationMs(state: InterviewState): number {
  return Date.now() - state.metrics.startedAt;
}

function getPhaseDurationMs(state: InterviewState): number {
  return Date.now() - state.phaseStartedAt;
}

function getSessionTimeLimitMs(state: InterviewState): number {
  const minutes = TIME_LIMITS[state.config.plan] ?? TIME_LIMITS.free;
  return minutes * 60 * 1000;
}

function getTimeRemainingMs(state: InterviewState): number {
  return Math.max(
    0,
    getSessionTimeLimitMs(state) - getSessionDurationMs(state)
  );
}

/**
 * Phase weights for time budgeting.
 * Heavier weight on technical/cv_deep_dive/behavioral (the substance).
 * Lighter weight on opening/motivation/closing.
 */
const PHASE_WEIGHTS: Record<InterviewPhase, number> = {
  opening: 0.08,
  motivation: 0.10,
  cv_deep_dive: 0.20,
  technical: 0.22,
  behavioral: 0.20,
  pressure: 0.12,
  closing: 0.08,
};

function getPhaseTimeBudget(
  state: InterviewState,
  phase: InterviewPhase
): number {
  const totalMs = getSessionTimeLimitMs(state);
  const weight = PHASE_WEIGHTS[phase] ?? 1 / PHASE_ORDER.length;
  return totalMs * weight;
}

// ─────────────────────────────────────────────────────────────
// SECTION 2 — COMPETENCY COVERAGE METRICS
// ─────────────────────────────────────────────────────────────

function getCompetencyCoverageRatio(state: InterviewState): number {
  const competencies = Object.values(state.competencyCoverage);
  if (competencies.length === 0) return 1;
  const probed = competencies.filter((c) => c.evidenceCount > 0).length;
  return probed / competencies.length;
}

function getStrongCompetencyRatio(state: InterviewState): number {
  const competencies = Object.values(state.competencyCoverage);
  if (competencies.length === 0) return 1;
  // coverage is 0-100; 60+ is "strong evidence"
  const strong = competencies.filter((c) => c.coverage >= 60).length;
  return strong / competencies.length;
}

// ─────────────────────────────────────────────────────────────
// SECTION 3 — TRANSITION DECISION (main entry)
// ─────────────────────────────────────────────────────────────

export function evaluatePhaseTransition(
  state: InterviewState
): PhaseTransitionResult {
  const current = state.phase;
  const next = getNextPhase(current);
  const questionsInPhase = state.phaseQuestionCount;
  const phaseElapsed = getPhaseDurationMs(state);
  const phaseBudget = getPhaseTimeBudget(state, current);
  const timeRemaining = getTimeRemainingMs(state);

  // Hard stop: session out of time → force closing
  if (timeRemaining <= 60 * 1000 && current !== "closing") {
    return {
      previousPhase: current,
      nextPhase: "closing",
      transitioned: true,
      reason: "time_critical",
    };
  }

  // No next phase available (already at closing)
  if (!next) {
    return {
      previousPhase: current,
      nextPhase: current,
      transitioned: false,
      reason: "terminal_phase",
    };
  }

  // Below minimum questions for this phase — stay
  const minForPhase = MIN_QUESTIONS_PER_PHASE[current] ?? 1;
  if (questionsInPhase < minForPhase) {
    return {
      previousPhase: current,
      nextPhase: current,
      transitioned: false,
      reason: "below_min_questions",
    };
  }

  // Hit maximum questions for this phase — must move on
  const maxForPhase = MAX_QUESTIONS_PER_PHASE[current] ?? 5;
  if (questionsInPhase >= maxForPhase) {
    return {
      previousPhase: current,
      nextPhase: next,
      transitioned: true,
      reason: "max_questions_reached",
    };
  }

  // Phase time budget exceeded
  if (phaseElapsed >= phaseBudget) {
    return {
      previousPhase: current,
      nextPhase: next,
      transitioned: true,
      reason: "phase_time_exhausted",
    };
  }

  // Smart phase-specific signals
  return evaluatePhaseSpecificSignals(state, current, next);
}

// ─────────────────────────────────────────────────────────────
// SECTION 4 — PHASE-SPECIFIC SIGNALS
// ─────────────────────────────────────────────────────────────

function evaluatePhaseSpecificSignals(
  state: InterviewState,
  current: InterviewPhase,
  next: InterviewPhase
): PhaseTransitionResult {
  switch (current) {
    case "opening":
      // Move on after 1+ opening questions with decent engagement.
      // engagement is 0-100 in the v3 contract.
      if (
        state.phaseQuestionCount >= 1 &&
        state.candidateProfile.engagement >= 40
      ) {
        return {
          previousPhase: current,
          nextPhase: next,
          transitioned: true,
          reason: "opening_complete",
        };
      }
      break;

    case "motivation":
      // Brief phase: 2 questions usually enough to surface motivation.
      if (state.phaseQuestionCount >= 2) {
        return {
          previousPhase: current,
          nextPhase: next,
          transitioned: true,
          reason: "motivation_explored",
        };
      }
      break;

    case "cv_deep_dive":
      // Move to technical when ≥40% of competencies have been touched.
      if (getCompetencyCoverageRatio(state) >= 0.4) {
        return {
          previousPhase: current,
          nextPhase: next,
          transitioned: true,
          reason: "cv_coverage_met",
        };
      }
      break;

    case "technical":
      // Move to behavioral when ≥50% of competencies have strong evidence.
      if (getStrongCompetencyRatio(state) >= 0.5) {
        return {
          previousPhase: current,
          nextPhase: next,
          transitioned: true,
          reason: "technical_evidence_strong",
        };
      }
      break;

    case "behavioral":
      // Move to pressure when behavioral coverage is solid
      // OR when contradictions have piled up (probe them under pressure).
      if (getStrongCompetencyRatio(state) >= 0.6) {
        return {
          previousPhase: current,
          nextPhase: next,
          transitioned: true,
          reason: "behavioral_coverage_met",
        };
      }
      if (state.contradictions.length >= 2) {
        return {
          previousPhase: current,
          nextPhase: next,
          transitioned: true,
          reason: "contradictions_detected",
        };
      }
      break;

    case "pressure":
      // Move to closing once pressure has been applied a couple of times.
      if (state.metrics.pressureEscalations >= 2) {
        return {
          previousPhase: current,
          nextPhase: next,
          transitioned: true,
          reason: "pressure_complete",
        };
      }
      break;

    case "closing":
      // Terminal phase — never auto-transition further.
      break;
  }

  return {
    previousPhase: current,
    nextPhase: current,
    transitioned: false,
    reason: "criteria_not_met",
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 5 — COMPLETION CHECK
// ─────────────────────────────────────────────────────────────

export function shouldEndSession(state: InterviewState): boolean {
  if (state.isComplete) return true;

  const timeRemaining = getTimeRemainingMs(state);
  if (timeRemaining <= 0) return true;

  // In closing phase + reached max closing questions
  if (
    state.phase === "closing" &&
    state.phaseQuestionCount >= (MAX_QUESTIONS_PER_PHASE.closing ?? 2)
  ) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// SECTION 6 — TELEMETRY (debugging / prompt context)
// ─────────────────────────────────────────────────────────────

export interface PhaseProgressSnapshot {
  current: InterviewPhase;
  questionsInPhase: number;
  maxQuestions: number;
  phaseElapsedMs: number;
  phaseBudgetMs: number;
  sessionTimeRemainingMs: number;
  competencyCoverage: number;     // 0-1 ratio
  strongCompetencyRatio: number;  // 0-1 ratio
}

export function getPhaseProgress(
  state: InterviewState
): PhaseProgressSnapshot {
  return {
    current: state.phase,
    questionsInPhase: state.phaseQuestionCount,
    maxQuestions: MAX_QUESTIONS_PER_PHASE[state.phase] ?? 5,
    phaseElapsedMs: getPhaseDurationMs(state),
    phaseBudgetMs: getPhaseTimeBudget(state, state.phase),
    sessionTimeRemainingMs: getTimeRemainingMs(state),
    competencyCoverage: getCompetencyCoverageRatio(state),
    strongCompetencyRatio: getStrongCompetencyRatio(state),
  };
}

/**
 * Derive an overall progress percentage (0-100) for the UI.
 * Combines time elapsed and phase position.
 */
export function calculateInterviewProgress(state: InterviewState): number {
  const phaseIdx = PHASE_ORDER.indexOf(state.phase);
  const totalPhases = PHASE_ORDER.length;

  // Phase contribution: how many phases completed + progress in current
  const maxForPhase = MAX_QUESTIONS_PER_PHASE[state.phase] ?? 5;
  const phaseProgress = Math.min(
    1,
    state.phaseQuestionCount / Math.max(1, maxForPhase)
  );
  const phaseScore = (phaseIdx + phaseProgress) / totalPhases;

  // Time contribution
  const totalTime = getSessionTimeLimitMs(state);
  const elapsed = getSessionDurationMs(state);
  const timeScore = Math.min(1, elapsed / Math.max(1, totalTime));

  // Weighted blend: phase position matters more than raw time
  const combined = phaseScore * 0.65 + timeScore * 0.35;
  return Math.round(Math.max(0, Math.min(1, combined)) * 100);
}
