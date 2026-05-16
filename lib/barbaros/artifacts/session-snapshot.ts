// lib/barbaros/artifacts/session-snapshot.ts
// CONTRACT: Canonical session artifact. Version 3.
// Changes from v2:
//   - deriveEngagementTrend uses trendDirection enum — zero text matching
//   - Fully clean: no LLM text dependency anywhere

import type { InterviewPhase } from '../types';
import type {
  BehaviorInsight,
  BehaviorOrchestrationResult,
  SessionBehaviorPattern,
} from '../analysis/behavior/behavior-types';
import type {
  FinalScoreBreakdown,
  ReadinessLevel,
  ScoreSnapshot,
} from '../scoring/score-aggregator';
import type { ScoreLabel } from '../scoring/score-normalizer';
import type { ContradictionSummary } from '../state/contradiction-tracker';
import { toScoreSnapshot } from '../scoring/score-aggregator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompetencySummary {
  topic: string;
  coverage: number;
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
  confirmedSignalTypes: string[];
  insights: BehaviorInsight[];
  patterns: SessionBehaviorPattern[];
  responsesTrend: 'expanding' | 'stable' | 'shrinking';
  peakRisks: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    phase: InterviewPhase;
  }>;
  // wordCountAverage: number — TODO when engine.ts passes wordCounts[] explicitly
}

export interface SessionSnapshot {
  sessionId: string;
  candidateId: string;
  createdAt: number;
  jobTitle: string;
  institution: string;
  language: string;
  durationMinutes: number;
  totalMessages: number;
  completedPhases: InterviewPhase[];
  score: ScoreSnapshot;
  behavior: BehaviorArtifact;
  competencies: CompetencySummary[];
  contradictions: ContradictionSummary;
  phases: PhaseSummary[];
  longitudinalReady: boolean;
  promotablePatterns: string[];
}

export interface SessionSnapshotInput {
  sessionId: string;
  candidateId: string;
  jobTitle: string;
  institution: string;
  language: string;
  completedPhases: InterviewPhase[];
  durationMinutes: number;
  totalMessages: number;
  scoreBreakdown: FinalScoreBreakdown;
  behaviorResult: BehaviorOrchestrationResult;
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

  const score          = toScoreSnapshot(scoreBreakdown);
  const behavior       = buildBehaviorArtifact(behaviorResult);
  const competencyList = buildCompetencySummaries(competencies);

  const promotablePatterns = behaviorResult.patterns
    .filter((p) => p.crossPhaseConfirmed && p.stabilityScore >= 0.6)
    .map((p) => p.id);

  const longitudinalReady =
    promotablePatterns.length > 0 || score.finalScore >= 40;

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

  // v3: trendDirection enum — zero text matching
  const engagementPattern = result.patterns.find(
    (p) => p.patternCategory === 'engagement'
  );
  const responsesTrend: BehaviorArtifact['responsesTrend'] =
    engagementPattern?.trendDirection ?? 'stable';

  // Peak risks: highest severity per type
  const riskMap = new Map<string, BehaviorArtifact['peakRisks'][0]>();
  const severityWeight = { low: 1, medium: 2, high: 3 } as const;

  for (const risk of result.activeRisks) {
    const existing = riskMap.get(risk.type);
    if (
      !existing ||
      severityWeight[risk.severity] > severityWeight[existing.severity]
    ) {
      riskMap.set(risk.type, {
        type:     risk.type,
        severity: risk.severity,
        phase:    risk.phase,
      });
    }
  }

  return {
    confirmedSignalTypes,
    insights:      result.insights,
    patterns:      result.patterns,
    responsesTrend,
    peakRisks:     [...riskMap.values()],
  };
}

function buildCompetencySummaries(
  competencies: Record<string, import('../types').CompetencyCoverage>
): CompetencySummary[] {
  return Object.entries(competencies).map(([topic, coverage]) => ({
    topic,
    coverage:      coverage.coverage,
    evidenceCount: coverage.evidenceCount,
    label:         coverageToLabel(coverage.coverage),
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

// ─── Derived Queries ──────────────────────────────────────────────────────────

export function isLongitudinalReady(snapshot: SessionSnapshot): boolean {
  return snapshot.longitudinalReady;
}

export function getStrongestCompetency(
  snapshot: SessionSnapshot
): CompetencySummary | null {
  if (snapshot.competencies.length === 0) return null;
  return snapshot.competencies.reduce((best, c) =>
    c.coverage > best.coverage ? c : best
  );
}

export function getWeakestCompetency(
  snapshot: SessionSnapshot
): CompetencySummary | null {
  if (snapshot.competencies.length === 0) return null;
  return snapshot.competencies.reduce((weakest, c) =>
    c.coverage < weakest.coverage ? c : weakest
  );
}

export interface SnapshotDelta {
  sessionId:        string;
  finalScore:       number;
  readinessLevel:   ReadinessLevel;
  weakestArea:      string;
  topInsightTopics: string[];
  patternCount:     number;
  contradictions:   number;
  createdAt:        number;
}

export function toSnapshotDelta(snapshot: SessionSnapshot): SnapshotDelta {
  return {
    sessionId:        snapshot.sessionId,
    finalScore:       snapshot.score.finalScore,
    readinessLevel:   snapshot.score.readinessLevel,
    weakestArea:      snapshot.score.weakestArea,
    topInsightTopics: snapshot.behavior.insights.slice(0, 3).map((i) => i.topic),
    patternCount:     snapshot.behavior.patterns.length,
    contradictions:   snapshot.contradictions.total,
    createdAt:        snapshot.createdAt,
  };
}
