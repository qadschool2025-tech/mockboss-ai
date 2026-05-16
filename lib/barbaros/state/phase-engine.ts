
// lib/barbaros/state/phase-engine.ts
// Decides when to transition between interview phases

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
  return Math.max(0, getSessionTimeLimitMs(state) - getSessionDurationMs(state));
}

function getPhaseTimeBudget(
  state: InterviewState,
  phase: InterviewPhase
): number {
  const totalMs = getSessionTimeLimitMs(state);
  const totalPhases = PHASE_ORDER.length;
  // Weight phases — opening short, exploration & probing longer, closing short
  const weights: Record<InterviewPhase, number> = {
    opening: 0.10,
    exploration: 0.30,
    probing: 0.30,
    challenge: 0.20,
    closing: 0.10,
  };
  const weight = weights[phase] ?? 1 / totalPhases;
  return totalMs * weight;
}

// ─────────────────────────────────────────────────────────────
// SECTION 2 — COMPETENCY COVERAGE
// ─────────────────────────────────────────────────────────────

function getCompetencyCoverageRatio(state: InterviewState): number {
  const competencies = Object.values(state.competencyCoverage);
  if (competencies.length === 0) return 1;
  const probed = competencies.filter((c) => c.timesProbed > 0).length;
  return probed / competencies.length;
}

function getStrongCompetencyRatio(state: InterviewState): number {
  const competencies = Object.values(state.competencyCoverage);
  if (competencies.length === 0) return 1;
  const strong = competencies.filter((c) => c.evidenceStrength >= 0.6).length;
  return strong / competencies.length;
}

// ─────────────────────────────────────────────────────────────
// SECTION 3 — TRANSITION DECISION
// ─────────────────────────────────────────────────────────────

export function evaluatePhaseTransition(
  state: InterviewState
): PhaseTransitionResult {
  const current = state.currentPhase;
  const next = getNextPhase(current);
  const questionsInPhase = state.phaseQuestionCount;
  const phaseElapsed = getPhaseDurationMs(state);
  const phaseBudget = getPhaseTimeBudget(state, current);
  const timeRemaining = getTimeRemainingMs(state);

  // Hard stop: session out of time → force closing
  if (timeRemaining <= 60 * 1000 && current !== "closing") {
    return {
      shouldTransition: true,
      nextPhase: "closing",
      reason: "time_critical",
    };
  }

  // No next phase available (already at closing)
  if (!next) {
    return {
      shouldTransition: false,
      nextPhase: null,
      reason: "terminal_phase",
    };
  }

  // Below minimum questions for this phase — stay
  const minForPhase = MIN_QUESTIONS_PER_PHASE[current] ?? 1;
  if (questionsInPhase < minForPhase) {
    return {
      shouldTransition: false,
      nextPhase: null,
      reason: "below_min_questions",
    };
  }

  // Hit maximum questions for this phase — must move on
  const maxForPhase = MAX_QUESTIONS_PER_PHASE[current] ?? 5;
  if (questionsInPhase >= maxForPhase) {
    return {
      shouldTransition: true,
      nextPhase: next,
      reason: "max_questions_reached",
    };
  }

  // Phase time budget exceeded
  if (phaseElapsed >= phaseBudget) {
    return {
      shouldTransition: true,
      nextPhase: next,
      reason: "phase_time_exhausted",
    };
  }

  // Smart transitions based on phase-specific signals
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
      // After 1-2 opening questions with decent engagement, move to exploration
      if (
        state.phaseQuestionCount >= 1 &&
        state.candidateProfile.engagement >= 0.4
      ) {
        return {
          shouldTransition: true,
          nextPhase: next,
          reason: "opening_complete",
        };
      }
      break;

    case "exploration":
      // Move to probing when at least half competencies have been touched
      if (getCompetencyCoverageRatio(state) >= 0.5) {
        return {
          shouldTransition: true,
          nextPhase: next,
          reason: "exploration_coverage_met",
        };
      }
      break;

    case "probing":
      // Move to challenge when strong evidence on most competencies
      // OR contradictions emerged (challenge them now)
      if (getStrongCompetencyRatio(state) >= 0.5) {
        return {
          shouldTransition: true,
          nextPhase: next,
          reason: "probing_evidence_strong",
        };
      }
      if (state.contradictions.length >= 2) {
        return {
          shouldTransition: true,
          nextPhase: next,
          reason: "contradictions_detected",
        };
      }
      break;

    case "challenge":
      // Move to closing when contradictions addressed or pressure exhausted
      if (state.metrics.pressureEscalations >= 2) {
        return {
          shouldTransition: true,
          nextPhase: next,
          reason: "challenge_complete",
        };
      }
      break;

    case "closing":
      // Terminal phase — never auto-transition further
      break;
  }

  return {
    shouldTransition: false,
    nextPhase: null,
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
    state.currentPhase === "closing" &&
    state.phaseQuestionCount >= (MAX_QUESTIONS_PER_PHASE.closing ?? 2)
  ) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// SECTION 6 — TELEMETRY HELPERS (for debugging / prompt context)
// ─────────────────────────────────────────────────────────────

export function getPhaseProgress(state: InterviewState): {
  current: InterviewPhase;
  questionsInPhase: number;
  maxQuestions: number;
  phaseElapsedMs: number;
  phaseBudgetMs: number;
  sessionTimeRemainingMs: number;
  competencyCoverage: number;
  strongCompetencyRatio: number;
} {
  return {
    current: state.currentPhase,
    questionsInPhase: state.phaseQuestionCount,
    maxQuestions: MAX_QUESTIONS_PER_PHASE[state.currentPhase] ?? 5,
    phaseElapsedMs: getPhaseDurationMs(state),
    phaseBudgetMs: getPhaseTimeBudget(state, state.currentPhase),
    sessionTimeRemainingMs: getTimeRemainingMs(state),
    competencyCoverage: getCompetencyCoverageRatio(state),
    strongCompetencyRatio: getStrongCompetencyRatio(state),
  };
}
