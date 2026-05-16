
// lib/barbaros/artifacts/session-snapshot.ts
// CONTRACT: Canonical session artifact. Single source of truth for what happened.
// Produced at: end of session (or on-demand for longitudinal promotion)
// Consumed by: longitudinal/, report layer, analytics
//
// Rules:
//   - Never reads raw messages — consumes layer outputs only
//   - longitudinal/ NEVER bypasses this to read session internals
//   - ScoreSnapshot not FinalScoreBreakdown (no coupling to scoring internals)
//   - ContradictionSummary not raw Contradiction[] (no coupling to state internals)
//   - All time ops take `now: number`
//
// Data flow:
//   behavior/     → BehaviorArtifact
//   scoring/      → ScoreSnapshot
//   state/        → CompetencySummary + ContradictionSummary + PhaseSummary
//   longitudinal/ ← SessionSnapshot (this file's output)

import type { InterviewPhase } from '../types';
import type {
  BehaviorInsight,
  BehaviorOrchestrationResult,
  ReadinessLevel,
  ScoreLabel,
  ScoreSnapshot,
  SessionBehaviorPattern,
} from '../scoring/score-aggregator';
import type { FinalScoreBreakdown } from '../scoring/score-aggregator';
import type { NormalizedScoreSet } from '../scoring/score-normalizer';
import type { ContradictionSummary } from '../state/contradiction-tracker';
import { toScoreSnapshot } from '../scoring/score-aggregator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompetencySummary {
  topic: string;
  coverage: number;       // 0-100
  evidenceCount: number;
  label: ScoreLabel;
}

export interface PhaseSummary {
  phase: InterviewPhase;
  durationMinutes: number;
  messageCount: number;
  dominantSignalTypes: string[];
}

export interface BehaviorArtifact {
  // Confirmed signals only — no noise
  confirmedSignalTypes: string[];
  insights: BehaviorInsight[];
  patterns: SessionBehaviorPattern[];

  // Engagement summary
  averageResponseLength: number;
  responsesTrend: 'expanding' | 'stable' | 'shrinking';

  // Risk summary
  peakRisks: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    phase: InterviewPhase;
  }>;
}

export interface SessionSnapshot {
  // Identity
  sessionId: string;
  candidateId: string;
  createdAt: number;

  // Session metadata
  jobTitle: string;
  institution: string;
  language: string;
  durationMinutes: number;
  totalMessages: number;
  completedPhases: InterviewPhase[];

  // Score (compact — no internal breakdown)
  score: ScoreSnapshot;

  // Behavior (curated — no raw signals)
  behavior: BehaviorArtifact;

  // Competency (summary per topic)
  competencies: CompetencySummary[];

  // Contradictions (summary — no raw Contradiction[])
  contradictions: ContradictionSummary;

  // Phase breakdown
  phases: PhaseSummary[];

  // Longitudinal promotion flags
  longitudinalReady: boolean;       // true = patterns ready for cross-session tracking
  promotablePatterns: string[];     // pattern IDs ready for LongitudinalBehaviorPattern
}

// ─── Snapshot Input ───────────────────────────────────────────────────────────

export interface SessionSnapshotInput {
  // Identity
  sessionId: string;
  candidateId: string;
  jobTitle: string;
  institution: string;
  language: string;

  // From engine.ts
  completedPhases: InterviewPhase[];
  durationMinutes: number;
  totalMessages: number;

  // From scoring layer
  scoreBreakdown: FinalScoreBreakdown;

  // From behavior layer
  behaviorResult: BehaviorOrchestrationResult;

  // From state layer
  competencies: Record<string, import('../types').CompetencyCoverage>;
  contradictionSummary: ContradictionSummary;
  phaseSummaries: PhaseSummary[];

  now: number;
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

export function buildSessionSnapshot(
  input: SessionSnapshotInput
): SessionSnapshot {
  const {
    sessionId, candidateId, jobTitle, institution, language,
    completedPhases, durationMinutes, totalMessages,
    scoreBreakdown, behaviorResult, competencies,
    contradictionSummary, phaseSummaries, now,
  } = input;

  const score       = toScoreSnapshot(scoreBreakdown);
  const behavior    = buildBehaviorArtifact(behaviorResult);
  const competencyList = buildCompetencySummaries(competencies);

  const promotablePatterns = behaviorResult.patterns
    .filter((p) => p.crossPhaseConfirmed && p.stabilityScore >= 0.6)
    .map((p) => p.id);

  const longitudinalReady =
    promotablePatterns.length > 0 ||
    score.finalScore >= 40;   // any meaningful session is longitudinal-worthy

  return {
    sessionId,
    candidateId,
    createdAt: now,

    jobTitle,
    institution,
    language,
    durationMinutes,
    totalMessages,
    completedPhases,

    score,
    behavior,
    competencies: competencyList,
    contradictions: contradictionSummary,
    phases: phaseSummaries,

    longitudinalReady,
    promotablePatterns,
  };
}

// ─── Sub-builders ─────────────────────────────────────────────────────────────

function buildBehaviorArtifact(
  result: BehaviorOrchestrationResult
): BehaviorArtifact {
  const confirmedSignalTypes = [
    ...new Set(
      result.validatedSignals
        .filter((s) => s.confirmed)
        .map((s) => s.signalType)
    ),
  ];

  // Peak risks: highest severity per risk type
  const riskMap = new Map<string, BehaviorArtifact['peakRisks'][0]>();
  for (const risk of result.activeRisks) {
    const existing = riskMap.get(risk.type);
    const severityWeight = { low: 1, medium: 2, high: 3 } as const;
    if (
      !existing ||
      severityWeight[risk.severity] > severityWeight[existing.severity]
    ) {
      riskMap.set(risk.type, {
        type: risk.type,
        severity: risk.severity,
        phase: risk.phase,
      });
    }
  }

  // Response trend from patterns
  const shrinkingPattern = result.patterns.find((p) =>
    p.description.toLowerCase().includes('shrink') ||
    p.description.toLowerCase().includes('declining')
  );
  const expandingPattern = result.patterns.find((p) =>
    p.description.toLowerCase().includes('expand') ||
    p.description.toLowerCase().includes('growing')
  );
  const responsesTrend: BehaviorArtifact['responsesTrend'] =
    shrinkingPattern ? 'shrinking' :
    expandingPattern ? 'expanding' : 'stable';

  // Average response length from validated signals (approximated)
  const avgLength = result.validatedSignals.length > 0
    ? Math.round(
        result.validatedSignals.reduce((sum, s) => sum + s.messageIndex, 0) /
        result.validatedSignals.length
      )
    : 0;

  return {
    confirmedSignalTypes,
    insights: result.insights,
    patterns: result.patterns,
    averageResponseLength: avgLength,
    responsesTrend,
    peakRisks: [...riskMap.values()],
  };
}

function buildCompetencySummaries(
  competencies: Record<string, import('../types').CompetencyCoverage>
): CompetencySummary[] {
  return Object.entries(competencies).map(([topic, coverage]) => ({
    topic,
    coverage: coverage.coverage,
    evidenceCount: coverage.evidenceCount,
    label: coverageToLabel(coverage.coverage),
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coverageToLabel(coverage: number): ScoreLabel {
  if (coverage >= 85) return 'excellent';
  if (coverage >= 70) return 'good';
  if (coverage >= 55) return 'fair';
  if (coverage >= 40) return 'weak';
  return 'poor';
}

// ─── Derived Queries (used by longitudinal + report) ─────────────────────────

/**
 * Is this session ready for longitudinal promotion?
 */
export function isLongitudinalReady(snapshot: SessionSnapshot): boolean {
  return snapshot.longitudinalReady;
}

/**
 * Strongest competency topic — for positive report highlights.
 */
export function getStrongestCompetency(
  snapshot: SessionSnapshot
): CompetencySummary | null {
  if (snapshot.competencies.length === 0) return null;
  return snapshot.competencies.reduce((best, c) =>
    c.coverage > best.coverage ? c : best
  );
}

/**
 * Weakest competency topic — for coaching focus.
 */
export function getWeakestCompetency(
  snapshot: SessionSnapshot
): CompetencySummary | null {
  if (snapshot.competencies.length === 0) return null;
  return snapshot.competencies.reduce((weakest, c) =>
    c.coverage < weakest.coverage ? c : weakest
  );
}

/**
 * Compact summary for longitudinal delta computation.
 * Prevents longitudinal from reading full snapshot internals.
 */
export interface SnapshotDelta {
  sessionId:       string;
  finalScore:      number;
  readinessLevel:  ReadinessLevel;
  weakestArea:     string;
  topInsightTopics: string[];
  patternCount:    number;
  contradictions:  number;
  createdAt:       number;
}

export function toSnapshotDelta(snapshot: SessionSnapshot): SnapshotDelta {
  return {
    sessionId:        snapshot.sessionId,
    finalScore:       snapshot.score.finalScore,
    readinessLevel:   snapshot.score.readinessLevel,
    weakestArea:      snapshot.score.weakestArea,
    topInsightTopics: snapshot.behavior.insights
                        .slice(0, 3)
                        .map((i) => i.topic),
    patternCount:     snapshot.behavior.patterns.length,
    contradictions:   snapshot.contradictions.total,
    createdAt:        snapshot.createdAt,
  };
}
