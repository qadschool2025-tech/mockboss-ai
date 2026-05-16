
// lib/barbaros/state/session-state.ts
// The heart of Barbaros: session state creation, updates, and persistence

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
  BehaviorSignals,
  NormalizedScore,
} from "../types";
import {
  STATE_VERSION,
  PHASE_ORDER,
  DEFAULT_PRESSURE_MODE,
  UNIVERSAL_COMPETENCIES,
  SECTOR_COMPETENCIES,
  LIMITS,
} from "../constants";
import { fingerprintQuestion } from "../utils/text";
import { sanitizeConfig, normalizeSector } from "../utils/sanitization";

// ─────────────────────────────────────────────────────────────
// SECTION 1 — INITIAL STATE FACTORIES
// ─────────────────────────────────────────────────────────────

function createInitialMetrics(): SessionMetrics {
  return {
    totalQuestions: 0,
    totalUserTurns: 0,
    averageResponseLength: 0,
    silenceEvents: 0,
    contradictionCount: 0,
    pressureEscalations: 0,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

function createInitialProfile(): CandidateProfile {
  return {
    confidence: 0.5,
    clarity: 0.5,
    depth: 0.5,
    ownershipScore: 0.5,
    consistency: 1.0,
    engagement: 0.5,
    lastUpdatedAt: Date.now(),
  };
}

function buildCompetencyCoverage(
  sector: string
): Record<string, CompetencyCoverage> {
  const coverage: Record<string, CompetencyCoverage> = {};
  const normalizedSector = normalizeSector(sector);
  const sectorComps = SECTOR_COMPETENCIES[normalizedSector] ?? [];
  const allCompetencies = [
    ...UNIVERSAL_COMPETENCIES,
    ...sectorComps,
  ];

  for (const comp of allCompetencies) {
    coverage[comp] = {
      competency: comp,
      timesProbed: 0,
      evidenceStrength: 0,
      lastProbedAt: null,
    };
  }
  return coverage;
}

// ─────────────────────────────────────────────────────────────
// SECTION 2 — STATE CREATION
// ─────────────────────────────────────────────────────────────

export function createInitialState(
  rawConfig: InterviewConfig
): InterviewState {
  const config = sanitizeConfig(rawConfig);
  const now = Date.now();

  return {
    version: STATE_VERSION,
    config,
    messages: [],
    currentPhase: "opening",
    phaseStartedAt: now,
    phaseQuestionCount: 0,
    pressureMode: DEFAULT_PRESSURE_MODE,
    askedQuestionFingerprints: [],
    recentTopics: [],
    competencyCoverage: buildCompetencyCoverage(config.sector),
    contradictions: [],
    candidateProfile: createInitialProfile(),
    metrics: createInitialMetrics(),
    scores: [],
    isComplete: false,
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 3 — MESSAGE OPERATIONS (immutable patches)
// ─────────────────────────────────────────────────────────────

export function appendMessage(
  state: InterviewState,
  message: Message
): InterviewState {
  const messages = [...state.messages, message];
  const metrics = updateMetricsForMessage(state.metrics, message);

  let askedQuestionFingerprints = state.askedQuestionFingerprints;
  let phaseQuestionCount = state.phaseQuestionCount;

  if (message.role === "assistant") {
    const fp = fingerprintQuestion(message.content);
    if (fp && !askedQuestionFingerprints.includes(fp)) {
      askedQuestionFingerprints = [
        ...askedQuestionFingerprints,
        fp,
      ].slice(-LIMITS.MAX_ASKED_QUESTIONS);
    }
    phaseQuestionCount = phaseQuestionCount + 1;
  }

  return {
    ...state,
    messages,
    metrics,
    askedQuestionFingerprints,
    phaseQuestionCount,
  };
}

function updateMetricsForMessage(
  metrics: SessionMetrics,
  message: Message
): SessionMetrics {
  const now = Date.now();
  const next: SessionMetrics = {
    ...metrics,
    lastActivityAt: now,
  };

  if (message.role === "assistant") {
    next.totalQuestions = metrics.totalQuestions + 1;
  }

  if (message.role === "user") {
    next.totalUserTurns = metrics.totalUserTurns + 1;
    const wordCount = message.content.trim().split(/\s+/).length;
    const prevAvg = metrics.averageResponseLength;
    const prevTurns = metrics.totalUserTurns;
    next.averageResponseLength =
      prevTurns === 0
        ? wordCount
        : (prevAvg * prevTurns + wordCount) / (prevTurns + 1);
  }

  return next;
}

// ─────────────────────────────────────────────────────────────
// SECTION 4 — PHASE OPERATIONS
// ─────────────────────────────────────────────────────────────

export function transitionPhase(
  state: InterviewState,
  nextPhase: InterviewPhase
): InterviewState {
  if (nextPhase === state.currentPhase) return state;

  return {
    ...state,
    currentPhase: nextPhase,
    phaseStartedAt: Date.now(),
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
// SECTION 5 — TOPIC MEMORY
// ─────────────────────────────────────────────────────────────

export function recordTopic(
  state: InterviewState,
  topic: string,
  revisitAllowed: boolean = false
): InterviewState {
  const normalized = topic.trim().toLowerCase();
  if (!normalized) return state;

  const existing = state.recentTopics.find(
    (t) => t.topic.toLowerCase() === normalized
  );

  let recentTopics: TopicMemory[];
  if (existing) {
    recentTopics = state.recentTopics.map((t) =>
      t.topic.toLowerCase() === normalized
        ? { ...t, timesVisited: t.timesVisited + 1, lastVisitedAt: Date.now() }
        : t
    );
  } else {
    const newEntry: TopicMemory = {
      topic,
      timesVisited: 1,
      lastVisitedAt: Date.now(),
      revisitAllowed,
    };
    recentTopics = [...state.recentTopics, newEntry].slice(
      -LIMITS.MAX_TOPIC_MEMORY
    );
  }

  return { ...state, recentTopics };
}

// ─────────────────────────────────────────────────────────────
// SECTION 6 — COMPETENCY OPERATIONS
// ─────────────────────────────────────────────────────────────

export function probeCompetency(
  state: InterviewState,
  competency: string,
  evidenceDelta: number = 0
): InterviewState {
  const existing = state.competencyCoverage[competency];
  if (!existing) return state;

  const updated: CompetencyCoverage = {
    ...existing,
    timesProbed: existing.timesProbed + 1,
    evidenceStrength: Math.max(
      0,
      Math.min(1, existing.evidenceStrength + evidenceDelta)
    ),
    lastProbedAt: Date.now(),
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
  patch: Partial<CandidateProfile>
): InterviewState {
  return {
    ...state,
    candidateProfile: {
      ...state.candidateProfile,
      ...patch,
      lastUpdatedAt: Date.now(),
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
// SECTION 9 — SILENCE & SCORES
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

export function appendScore(
  state: InterviewState,
  score: NormalizedScore
): InterviewState {
  return { ...state, scores: [...state.scores, score] };
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

export function deserializeState(json: string): InterviewState | null {
  try {
    const parsed = JSON.parse(json) as InterviewState;
    if (parsed.version !== STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}
