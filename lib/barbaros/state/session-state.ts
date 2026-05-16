// lib/barbaros/state/session-state.ts
// The heart of Barbaros: session state creation, updates, and persistence.
//
// CONTRACT CHECK (against types.ts v3):
//   InterviewState fields used:
//     version, config, messages, phase, phaseQuestionCount, phaseStartedAt,
//     pressureMode, competencyCoverage, recentTopics, askedQuestionFingerprints,
//     contradictions, candidateProfile, metrics, scores, interviewProgress,
//     isComplete
//   Message fields used:
//     role, content, timestamp (required), isQuestion (optional)
//   SessionMetrics fields used:
//     startedAt, lastActivityAt, totalQuestions, totalAnswers,
//     averageResponseLength, silenceEvents, contradictionCount,
//     pressureEscalations, averageScore, hesitationCount, vaguenessCount,
//     specificityScore
//   CandidateProfile fields used:
//     strengths, weaknesses, confidenceLevel, ownershipScore,
//     clarity, depth, consistency, engagement, lastUpdatedAt
//
// ARCHITECTURAL RULES:
//   - All operations are immutable (return new state, never mutate).
//   - All time-sensitive operations accept `now` as a parameter
//     for deterministic testing and replay.
//   - This module owns state creation, message appending, phase moves,
//     and serialization. Higher-level analytics live in dedicated modules.

import type {
  InterviewState,
  InterviewConfig,
  Message,
  InterviewPhase,
  CandidateProfile,
  SessionMetrics,
  CompetencyCoverage,
  TopicMemory,
  Contradiction,
  PressureMode,
  NormalizedScore,
} from "../types";
import {
  PHASE_ORDER,
  DEFAULT_PRESSURE_MODE,
  UNIVERSAL_COMPETENCIES,
  SECTOR_COMPETENCIES,
  LIMITS,
} from "../constants";
import { fingerprintQuestion } from "../utils/text";
import { sanitizeConfig, normalizeSector } from "../utils/sanitization";

// Local constant — kept here because it's structurally tied to state shape,
// not a tunable knob.
const STATE_VERSION = 1 as const;

// ─────────────────────────────────────────────────────────────
// SECTION 1 — INITIAL STATE FACTORIES
// ─────────────────────────────────────────────────────────────

function createInitialMetrics(now: number): SessionMetrics {
  return {
    averageScore: 0,
    averageResponseLength: 0,
    hesitationCount: 0,
    vaguenessCount: 0,
    silenceEvents: 0,
    contradictionCount: 0,
    specificityScore: 0,
    totalQuestions: 0,
    totalAnswers: 0,
    pressureEscalations: 0,
    startedAt: now,
    lastActivityAt: now,
  };
}

function createInitialProfile(now: number): CandidateProfile {
  return {
    strengths: [],
    weaknesses: [],
    confidenceLevel: 50,
    ownershipScore: 50,
    clarity: 50,
    depth: 50,
    consistency: 100,
    engagement: 50,
    lastUpdatedAt: now,
  };
}

function buildCompetencyCoverage(
  sector: string,
  now: number
): Record<string, CompetencyCoverage> {
  const coverage: Record<string, CompetencyCoverage> = {};
  const normalizedSector = normalizeSector(sector);
  const sectorComps = SECTOR_COMPETENCIES[normalizedSector] ?? [];
  const allCompetencies = [...UNIVERSAL_COMPETENCIES, ...sectorComps];

  for (const comp of allCompetencies) {
    coverage[comp] = {
      coverage: 0,
      evidenceCount: 0,
      lastUpdated: now,
    };
  }
  return coverage;
}

// ─────────────────────────────────────────────────────────────
// SECTION 2 — STATE CREATION
// ─────────────────────────────────────────────────────────────

export function createInitialState(
  rawConfig: InterviewConfig,
  now: number
): InterviewState {
  const config = sanitizeConfig(rawConfig);

  return {
    version: STATE_VERSION,
    config,
    messages: [],
    phase: "opening",
    phaseQuestionCount: 0,
    phaseStartedAt: now,
    pressureMode: DEFAULT_PRESSURE_MODE,
    competencyCoverage: buildCompetencyCoverage(config.sector, now),
    recentTopics: [],
    askedQuestionFingerprints: [],
    contradictions: [],
    candidateProfile: createInitialProfile(now),
    metrics: createInitialMetrics(now),
    scores: [],
    interviewProgress: 0,
    isComplete: false,
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 3 — MESSAGE OPERATIONS (immutable patches)
// ─────────────────────────────────────────────────────────────

/**
 * Append a message to state.
 *
 * For assistant messages, `phaseQuestionCount` is incremented ONLY when
 * the message is flagged as a question (`isQuestion: true`) OR when
 * the content contains a question mark as a fallback heuristic.
 * This prevents acknowledgments and closing remarks from inflating
 * the phase question counter.
 */
export function appendMessage(
  state: InterviewState,
  message: Message
): InterviewState {
  const messages = [...state.messages, message];
  const metrics = updateMetricsForMessage(state.metrics, message);

  let askedQuestionFingerprints = state.askedQuestionFingerprints;
  let phaseQuestionCount = state.phaseQuestionCount;

  if (message.role === "assistant") {
    const isQuestion = detectIsQuestion(message);

    if (isQuestion) {
      const fp = fingerprintQuestion(message.content);
      if (fp && !askedQuestionFingerprints.includes(fp)) {
        askedQuestionFingerprints = [
          ...askedQuestionFingerprints,
          fp,
        ].slice(-LIMITS.MAX_ASKED_QUESTIONS);
      }
      phaseQuestionCount = phaseQuestionCount + 1;
    }
  }

  return {
    ...state,
    messages,
    metrics,
    askedQuestionFingerprints,
    phaseQuestionCount,
  };
}

function detectIsQuestion(message: Message): boolean {
  // Prefer explicit flag from the engine
  if (typeof message.isQuestion === "boolean") return message.isQuestion;
  // Fallback heuristic: contains a question mark (Latin or Arabic)
  return /[?؟]/.test(message.content);
}

function updateMetricsForMessage(
  metrics: SessionMetrics,
  message: Message
): SessionMetrics {
  const next: SessionMetrics = {
    ...metrics,
    lastActivityAt: message.timestamp,
  };

  if (message.role === "assistant" && detectIsQuestion(message)) {
    next.totalQuestions = metrics.totalQuestions + 1;
  }

  if (message.role === "user") {
    next.totalAnswers = metrics.totalAnswers + 1;
    const wordCount = countWords(message.content);
    const prevAvg = metrics.averageResponseLength;
    const prevAnswers = metrics.totalAnswers;
    next.averageResponseLength =
      prevAnswers === 0
        ? wordCount
        : (prevAvg * prevAnswers + wordCount) / (prevAnswers + 1);
  }

  return next;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

// ─────────────────────────────────────────────────────────────
// SECTION 4 — PHASE OPERATIONS
// ─────────────────────────────────────────────────────────────

export function transitionPhase(
  state: InterviewState,
  nextPhase: InterviewPhase,
  now: number
): InterviewState {
  if (nextPhase === state.phase) return state;

  return {
    ...state,
    phase: nextPhase,
    phaseStartedAt: now,
    phaseQuestionCount: 0,
  };
}

export function getNextPhase(
  current: InterviewPhase
): InterviewPhase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

// ─────────────────────────────────────────────────────────────
// SECTION 5 — TOPIC MEMORY (basic add — richer operations in topic-memory.ts)
// ─────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────
// SECTION 6 — COMPETENCY OPERATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Mark a competency as probed and adjust its coverage score.
 * `coverageDelta` is added to the existing coverage (clamped 0-100).
 */
export function probeCompetency(
  state: InterviewState,
  competency: string,
  now: number,
  coverageDelta: number = 0
): InterviewState {
  const existing = state.competencyCoverage[competency];
  if (!existing) return state;

  const updated: CompetencyCoverage = {
    coverage: Math.max(0, Math.min(100, existing.coverage + coverageDelta)),
    evidenceCount: existing.evidenceCount + 1,
    lastUpdated: now,
  };

  return {
    ...state,
    competencyCoverage: {
      ...state.competencyCoverage,
      [competency]: updated,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 7 — CONTRADICTIONS
// ─────────────────────────────────────────────────────────────

export function recordContradiction(
  state: InterviewState,
  contradiction: Contradiction
): InterviewState {
  const contradictions = [...state.contradictions, contradiction].slice(
    -LIMITS.MAX_CONTRADICTIONS
  );
  return {
    ...state,
    contradictions,
    metrics: {
      ...state.metrics,
      contradictionCount: state.metrics.contradictionCount + 1,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 8 — PROFILE & PRESSURE
// ─────────────────────────────────────────────────────────────

export function updateProfile(
  state: InterviewState,
  patch: Partial<CandidateProfile>,
  now: number
): InterviewState {
  return {
    ...state,
    candidateProfile: {
      ...state.candidateProfile,
      ...patch,
      lastUpdatedAt: now,
    },
  };
}

export function setPressureMode(
  state: InterviewState,
  mode: PressureMode
): InterviewState {
  if (mode === state.pressureMode) return state;
  return {
    ...state,
    pressureMode: mode,
    metrics: {
      ...state.metrics,
      pressureEscalations: state.metrics.pressureEscalations + 1,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 9 — SILENCE, SCORES & PROGRESS
// ─────────────────────────────────────────────────────────────

export function recordSilenceEvent(
  state: InterviewState
): InterviewState {
  return {
    ...state,
    metrics: {
      ...state.metrics,
      silenceEvents: state.metrics.silenceEvents + 1,
    },
  };
}

/**
 * Append a normalized score to the score history and update the
 * running average. The average is maintained incrementally.
 *
 * TODO(V5): Move scores[] out of state into a separate analytics
 * pipeline. See note in types.ts InterviewState.scores.
 */
export function appendScore(
  state: InterviewState,
  score: NormalizedScore
): InterviewState {
  const scores = [...state.scores, score];
  const prevAvg = state.metrics.averageScore;
  const prevCount = state.scores.length;
  const newAverage =
    prevCount === 0
      ? score.overall
      : (prevAvg * prevCount + score.overall) / (prevCount + 1);

  return {
    ...state,
    scores,
    metrics: {
      ...state.metrics,
      averageScore: newAverage,
    },
  };
}

export function setInterviewProgress(
  state: InterviewState,
  progress: number
): InterviewState {
  const clamped = Math.max(0, Math.min(100, progress));
  return { ...state, interviewProgress: clamped };
}

// ─────────────────────────────────────────────────────────────
// SECTION 10 — COMPLETION & SERIALIZATION
// ─────────────────────────────────────────────────────────────

export function markComplete(state: InterviewState): InterviewState {
  return { ...state, isComplete: true };
}

export function serializeState(state: InterviewState): string {
  return JSON.stringify(state);
}

/**
 * Deserialize a persisted state.
 *
 * TODO(V5): Replace `as InterviewState` cast with a proper schema
 * validator (zod or hand-written) to catch malformed payloads,
 * tampered cookies, and version drift defensively.
 *
 * Current safety: only validates `version` field and JSON parsability.
 */
export function deserializeState(json: string): InterviewState | null {
  try {
    const parsed = JSON.parse(json) as InterviewState;
    if (parsed?.version !== STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}
