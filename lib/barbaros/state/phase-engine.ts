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
// TIME-AWARENESS GUARD (layer 2):
//   Public `evaluatePhaseTransition` wraps the raw transition logic and refuses
//   to ENTER 'closing' while more than MIN_MS_BEFORE_CLOSING (90s) remains, so
//   Barbaros keeps pressing instead of winding down early. The only sub-90s path
//   into closing is time_critical (≤60s) — below the floor, so never blocked.
//   shouldEndSession is protected transitively (it ends only via the closing
//   phase, which the guard refuses to enter early).
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

// Time-Awareness floor (layer 2): the interview must NOT wind down into the
// 'closing' phase while more than this much time remains. Keeps Barbaros
// pressing on weaknesses / contradictions instead of closing early. The only
// path into closing below this floor is time_critical (≤60s), which is itself
// below 90s, so it is never affected by this guard.
const MIN_MS_BEFORE_CLOSING = 90 * 1000;

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
  const strong = competencies.filter((c) => c.coverage >= 60).length;
  return strong / competencies.length;
}

// ─────────────────────────────────────────────────────────────
// SECTION 3 — TRANSITION DECISION (main entry)
// ─────────────────────────────────────────────────────────────

function evaluatePhaseTransitionRaw(
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

/**
 * Public entry point. Runs the raw transition logic, then applies the
 * Time-Awareness guard (layer 2): refuse to ENTER 'closing' while more than
 * MIN_MS_BEFORE_CLOSING remains — stay in the current phase and keep pressing.
 *
 * The time_critical (≤60s) and time-up paths are below the 90s floor, so they
 * are never blocked here. shouldEndSession is protected transitively, because
 * it can only end the session via the closing phase, which this guard refuses
 * to enter early.
 */
export function evaluatePhaseTransition(
  state: InterviewState
): PhaseTransitionResult {
  const result = evaluatePhaseTransitionRaw(state);

  if (
    result.transitioned &&
    result.nextPhase === "closing" &&
    getTimeRemainingMs(state) > MIN_MS_BEFORE_CLOSING
  ) {
    return {
      previousPhase: state.phase,
      nextPhase: state.phase,
      transitioned: false,
      reason: "closing_deferred_time_remaining",
    };
  }

  return result;
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

  if (
    state.phase === "closing" &&
    state.phaseQuestionCount >= (MAX_QUESTIONS_PER_PHASE.closing ?? 2)
  ) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// SECTION 6 — TELEMETRY
// ─────────────────────────────────────────────────────────────

export interface PhaseProgressSnapshot {
  current: InterviewPhase;
  questionsInPhase: number;
  maxQuestions: number;
  phaseElapsedMs: number;
  phaseBudgetMs: number;
  sessionTimeRemainingMs: number;
  competencyCoverage: number;
  strongCompetencyRatio: number;
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

export function calculateInterviewProgress(state: InterviewState): number {
  const phaseIdx = PHASE_ORDER.indexOf(state.phase);
  const totalPhases = PHASE_ORDER.length;

  const maxForPhase = MAX_QUESTIONS_PER_PHASE[state.phase] ?? 5;
  const phaseProgress = Math.min(
    1,
    state.phaseQuestionCount / Math.max(1, maxForPhase)
  );
  const phaseScore = (phaseIdx + phaseProgress) / totalPhases;

  const totalTime = getSessionTimeLimitMs(state);
  const elapsed = getSessionDurationMs(state);
  const timeScore = Math.min(1, elapsed / Math.max(1, totalTime));

  const combined = phaseScore * 0.65 + timeScore * 0.35;
  return Math.round(Math.max(0, Math.min(1, combined)) * 100);
}

// ─────────────────────────────────────────────────────────────
// SECTION 7 — ALIASES (for engine.ts compatibility)
// ─────────────────────────────────────────────────────────────

/**
 * advancePhase — legacy alias. NO LONGER USED by engine.ts (which now calls
 * evaluatePhaseTransition with the real state). Kept for backward compatibility
 * with any other importer; do NOT use for live decisions — it fabricates a stub
 * state (per-phase count from messageCount, faked phaseStartedAt, hardcoded plan)
 * which races the phase to 'closing'. Prefer evaluatePhaseTransition(realState).
 */
export function advancePhase(
  currentPhase: InterviewPhase,
  messageCount: number,
  elapsedMinutes: number
): { phase: InterviewPhase; changed: boolean } {
  const stubState = {
    phase: currentPhase,
    phaseQuestionCount: Math.floor(messageCount / 2),
    phaseStartedAt: Date.now() - elapsedMinutes * 60 * 1000,
    competencyCoverage: {},
    contradictions: [],
    isComplete: false,
    metrics: {
      startedAt: Date.now() - elapsedMinutes * 60 * 1000,
      pressureEscalations: 0,
    },
    candidateProfile: { engagement: 50 },
    config: { plan: "go" },
  } as unknown as InterviewState;

  const result = evaluatePhaseTransition(stubState);

  return {
    phase: result.nextPhase,
    changed: result.transitioned,
  };
}

/**
 * isSessionComplete — alias used by engine.ts
 */
export function isSessionComplete(state: InterviewState): boolean {
  return shouldEndSession(state);
}
