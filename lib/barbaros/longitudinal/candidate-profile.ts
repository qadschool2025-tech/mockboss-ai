
// lib/barbaros/longitudinal/candidate-profile.ts
// CONTRACT: Candidate profile merge APIs. Skeleton only.
// Consumes: SessionSnapshot artifacts → updates CandidateEvolutionProfile
// Rules:
//   - Pure functions only — caller owns state
//   - Never reads raw messages
//   - Never calls LLM directly
//   - 'unknown' PatternCategory handled explicitly
//   - All time ops take `now: number`

import type { SessionSnapshot } from '../artifacts/session-snapshot';
import type { SnapshotDelta } from '../artifacts/session-snapshot';
import type { PatternCategory, TrendDirection } from '../analysis/behavior/behavior-types';
import type {
  CandidateEvolutionProfile,
  CompetencyProgressionRecord,
  LongitudinalPatternRecord,
  LongitudinalStrength,
  LongitudinalWeakness,
  PressureAdaptationProfile,
  ScoreHistoryEntry,
  WeaknessStatus,
} from './longitudinal-types';
import type { ReadinessLevel } from '../scoring/score-aggregator';

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a fresh profile from the first session snapshot.
 * Called when candidateId has no existing profile.
 */
export function createInitialProfile(
  snapshot: SessionSnapshot,
  now: number
): CandidateEvolutionProfile {
  const scoreEntry = buildScoreEntry(snapshot, 1);

  return {
    candidateId:    snapshot.candidateId,
    createdAt:      now,
    lastUpdatedAt:  now,

    sessionCount:   1,
    sessionIds:     [snapshot.sessionId],
    lastSessionAt:  now,

    scoreHistory:   [scoreEntry],
    currentReadiness: snapshot.score.readinessLevel,
    readinessTrend: null,   // need 2+ sessions for trend

    recurringWeaknesses:  [],
    resolvedWeaknesses:   [],
    emergingStrengths:    [],

    confirmedPatterns:    buildInitialPatterns(snapshot),
    competencyProgression: buildInitialCompetencies(snapshot),
    pressureProfile:      buildInitialPressureProfile(),

    confidenceStabilityScore: 0.5,   // neutral until data accumulates

    jobTitle:           snapshot.jobTitle,
    targetInstitution:  snapshot.institution ?? null,
    language:           snapshot.language,
  };
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Merge a new session snapshot into an existing profile.
 * Returns a new profile — never mutates the existing one.
 */
export function mergeSessionIntoProfile(
  profile: CandidateEvolutionProfile,
  snapshot: SessionSnapshot,
  now: number
): CandidateEvolutionProfile {
  const sessionNumber = profile.sessionCount + 1;
  const scoreEntry    = buildScoreEntry(snapshot, sessionNumber);

  const updatedScoreHistory   = [...profile.scoreHistory, scoreEntry];
  const readinessTrend        = computeReadinessTrend(updatedScoreHistory);
  const updatedPatterns       = mergePatterns(profile.confirmedPatterns, snapshot);
  const updatedCompetencies   = mergeCompetencies(profile.competencyProgression, snapshot, sessionNumber);
  const updatedWeaknesses     = mergeWeaknesses(profile.recurringWeaknesses, snapshot, snapshot.sessionId);
  const resolvedWeaknesses    = detectResolvedWeaknesses(updatedWeaknesses, snapshot);
  const activeWeaknesses      = updatedWeaknesses.filter((w) => w.status !== 'resolved');
  const emergingStrengths     = detectEmergingStrengths(profile.emergingStrengths, snapshot, snapshot.sessionId);
  const confidenceStability   = updateConfidenceStability(profile.confidenceStabilityScore, snapshot);
  const pressureProfile       = updatePressureProfile(profile.pressureProfile, snapshot);

  return {
    ...profile,
    lastUpdatedAt:           now,
    sessionCount:            sessionNumber,
    sessionIds:              [...profile.sessionIds, snapshot.sessionId],
    lastSessionAt:           now,
    scoreHistory:            updatedScoreHistory,
    currentReadiness:        snapshot.score.readinessLevel,
    readinessTrend,
    recurringWeaknesses:     activeWeaknesses,
    resolvedWeaknesses:      [...profile.resolvedWeaknesses, ...resolvedWeaknesses],
    emergingStrengths,
    confirmedPatterns:       updatedPatterns,
    competencyProgression:   updatedCompetencies,
    pressureProfile,
    confidenceStabilityScore: confidenceStability,
  };
}

/**
 * Compute delta between last two sessions.
 * Used by session-delta.ts and prompt-builder.
 */
export function computeProfileDelta(
  profile: CandidateEvolutionProfile,
  latestSnapshot: SessionSnapshot
): SnapshotDelta | null {
  if (profile.sessionCount < 2) return null;

  const prev    = profile.scoreHistory[profile.scoreHistory.length - 2];
  const current = profile.scoreHistory[profile.scoreHistory.length - 1];

  if (!prev || !current) return null;

  const prevWeaknessTopics = profile.recurringWeaknesses.map((w) => w.topic);
  const currWeaknessTopics = latestSnapshot.behavior.insights.map((i) => i.topic);

  const newWeaknesses      = currWeaknessTopics.filter((t) => !prevWeaknessTopics.includes(t));
  const resolvedWeaknesses = prevWeaknessTopics.filter((t) => !currWeaknessTopics.includes(t));

  const prevCompetencies = prev.dimensionScores;
  const currCompetencies = current.dimensionScores;

  const improvedCompetencies = Object.entries(currCompetencies)
    .filter(([k, v]) => (prevCompetencies[k] ?? 0) < v)
    .map(([k]) => k);

  const declinedCompetencies = Object.entries(currCompetencies)
    .filter(([k, v]) => (prevCompetencies[k] ?? 0) > v)
    .map(([k]) => k);

  const prevPatternKeys = new Set(profile.confirmedPatterns.map((p) => p.canonicalKey));
  const newPatterns = latestSnapshot.behavior.patterns
    .filter((p) => p.crossPhaseConfirmed && !prevPatternKeys.has(p.canonicalKey))
    .map((p) => p.canonicalKey);

  const decayedPatterns = profile.confirmedPatterns
    .filter((p) => p.decayCount > 0)
    .map((p) => p.canonicalKey);

  return {
    fromSessionId:          prev.sessionId,
    toSessionId:            current.sessionId,
    computedAt:             latestSnapshot.createdAt,
    scoreDelta:             current.finalScore - prev.finalScore,
    readinessChanged:       prev.readinessLevel !== current.readinessLevel,
    newWeaknesses,
    resolvedWeaknesses,
    improvedCompetencies,
    declinedCompetencies,
    newPatterns,
    decayedPatterns,
  };
}

// ─── Score Helpers ────────────────────────────────────────────────────────────

function buildScoreEntry(
  snapshot: SessionSnapshot,
  sessionNumber: number
): ScoreHistoryEntry {
  return {
    sessionId:       snapshot.sessionId,
    sessionNumber,
    finalScore:      snapshot.score.finalScore,
    readinessLevel:  snapshot.score.readinessLevel,
    dimensionScores: snapshot.score.dimensionScores,
    weakestArea:     snapshot.score.weakestArea,
    recordedAt:      snapshot.createdAt,
  };
}

function computeReadinessTrend(
  history: ScoreHistoryEntry[]
): TrendDirection | null {
  if (history.length < 2) return null;

  const first   = history[0].finalScore;
  const last    = history[history.length - 1].finalScore;
  const delta   = last - first;

  if (delta > 5)  return 'expanding';
  if (delta < -5) return 'shrinking';
  return 'stable';
}

// ─── Pattern Helpers ──────────────────────────────────────────────────────────

function buildInitialPatterns(
  snapshot: SessionSnapshot
): LongitudinalPatternRecord[] {
  return snapshot.behavior.patterns
    .filter((p) => p.crossPhaseConfirmed && p.stabilityScore >= 0.6)
    .map((p) => ({
      id:                   `lp_${p.canonicalKey}`,
      canonicalKey:         p.canonicalKey,
      description:          p.description,
      category:             p.patternCategory,
      trendDirection:       p.trendDirection,
      firstSessionId:       snapshot.sessionId,
      lastSessionId:        snapshot.sessionId,
      sessionOccurrences:   1,
      totalOccurrenceCount: p.occurrenceCount,
      stabilityScore:       p.stabilityScore,
      decayCount:           0,
      requiresReview:       p.patternCategory === 'unknown',
    }));
}

function mergePatterns(
  existing: LongitudinalPatternRecord[],
  snapshot: SessionSnapshot
): LongitudinalPatternRecord[] {
  const existingByKey = new Map(existing.map((p) => [p.canonicalKey, p]));

  // Update existing or add new
  for (const pattern of snapshot.behavior.patterns) {
    if (!pattern.crossPhaseConfirmed) continue;

    const key      = pattern.canonicalKey;
    const existing = existingByKey.get(key);

    if (existing) {
      existingByKey.set(key, {
        ...existing,
        lastSessionId:        snapshot.sessionId,
        sessionOccurrences:   existing.sessionOccurrences + 1,
        totalOccurrenceCount: existing.totalOccurrenceCount + pattern.occurrenceCount,
        stabilityScore:       Math.min(1, existing.stabilityScore + 0.1),
        decayCount:           0,   // reset decay on re-occurrence
        trendDirection:       pattern.trendDirection ?? existing.trendDirection,
        requiresReview:       pattern.patternCategory === 'unknown',
      });
    } else {
      existingByKey.set(key, {
        id:                   `lp_${key}`,
        canonicalKey:         key,
        description:          pattern.description,
        category:             pattern.patternCategory,
        trendDirection:       pattern.trendDirection,
        firstSessionId:       snapshot.sessionId,
        lastSessionId:        snapshot.sessionId,
        sessionOccurrences:   1,
        totalOccurrenceCount: pattern.occurrenceCount,
        stabilityScore:       pattern.stabilityScore,
        decayCount:           0,
        requiresReview:       pattern.patternCategory === 'unknown',
      });
    }
  }

  // Increment decay for patterns not seen this session
  const seenKeys = new Set(
    snapshot.behavior.patterns.map((p) => p.canonicalKey)
  );

  return [...existingByKey.values()].map((p) =>
    seenKeys.has(p.canonicalKey)
      ? p
      : { ...p, decayCount: p.decayCount + 1 }
  );
}

// ─── Competency Helpers ───────────────────────────────────────────────────────

function buildInitialCompetencies(
  snapshot: SessionSnapshot
): CompetencyProgressionRecord[] {
  return snapshot.competencies.map((c) => ({
    topic:            c.topic,
    sessions: [{
      sessionId:     snapshot.sessionId,
      sessionNumber: 1,
      coverage:      c.coverage,
      evidenceCount: c.evidenceCount,
      label:         c.label,
    }],
    currentCoverage:  c.coverage,
    trend:            'stable',
    peakCoverage:     c.coverage,
    averageCoverage:  c.coverage,
  }));
}

function mergeCompetencies(
  existing: CompetencyProgressionRecord[],
  snapshot: SessionSnapshot,
  sessionNumber: number
): CompetencyProgressionRecord[] {
  const existingByTopic = new Map(existing.map((c) => [c.topic, c]));

  for (const competency of snapshot.competencies) {
    const prev = existingByTopic.get(competency.topic);

    if (prev) {
      const newSessions = [
        ...prev.sessions,
        {
          sessionId:     snapshot.sessionId,
          sessionNumber,
          coverage:      competency.coverage,
          evidenceCount: competency.evidenceCount,
          label:         competency.label,
        },
      ];
      const avg   = Math.round(
        newSessions.reduce((s, e) => s + e.coverage, 0) / newSessions.length
      );
      const peak  = Math.max(...newSessions.map((e) => e.coverage));
      const trend = computeCoverTrend(prev.currentCoverage, competency.coverage);

      existingByTopic.set(competency.topic, {
        ...prev,
        sessions:        newSessions,
        currentCoverage: competency.coverage,
        trend,
        peakCoverage:    peak,
        averageCoverage: avg,
      });
    } else {
      existingByTopic.set(competency.topic, {
        topic:           competency.topic,
        sessions: [{
          sessionId:     snapshot.sessionId,
          sessionNumber,
          coverage:      competency.coverage,
          evidenceCount: competency.evidenceCount,
          label:         competency.label,
        }],
        currentCoverage:  competency.coverage,
        trend:            'stable',
        peakCoverage:     competency.coverage,
        averageCoverage:  competency.coverage,
      });
    }
  }

  return [...existingByTopic.values()];
}

function computeCoverTrend(prev: number, current: number): TrendDirection {
  const delta = current - prev;
  if (delta > 5)  return 'expanding';
  if (delta < -5) return 'shrinking';
  return 'stable';
}

// ─── Weakness Helpers ─────────────────────────────────────────────────────────

function mergeWeaknesses(
  existing: LongitudinalWeakness[],
  snapshot: SessionSnapshot,
  sessionId: string
): LongitudinalWeakness[] {
  const existingByTopic = new Map(existing.map((w) => [w.topic, w]));

  // Derive weaknesses from low-coverage competencies + behavior insights
  const weakTopics = [
    ...snapshot.competencies
      .filter((c) => c.coverage < 55)
      .map((c) => ({ topic: c.topic, category: 'depth' as PatternCategory })),
    ...snapshot.behavior.insights
      .filter((i) => i.confidenceScore >= 0.6)
      .map((i) => ({ topic: i.topic, category: 'unknown' as PatternCategory })),
  ];

  for (const { topic, category } of weakTopics) {
    const prev = existingByTopic.get(topic);

    if (prev) {
      const consecutive = prev.lastObservedSessionId !== sessionId
        ? prev.consecutiveCount + 1
        : prev.consecutiveCount;

      existingByTopic.set(topic, {
        ...prev,
        lastObservedSessionId: sessionId,
        occurrenceCount:       prev.occurrenceCount + 1,
        consecutiveCount:      consecutive,
        status:                computeWeaknessStatus(prev.occurrenceCount + 1, consecutive),
      });
    } else {
      existingByTopic.set(topic, {
        id:                    `lw_${topic.replace(/\s+/g, '_')}`,
        topic,
        description:           `Recurring weakness in ${topic}`,
        category,
        status:                'emerging',
        firstObservedSessionId: sessionId,
        lastObservedSessionId:  sessionId,
        occurrenceCount:        1,
        consecutiveCount:       1,
        improvementDelta:       0,
        lastScore:              0,
      });
    }
  }

  return [...existingByTopic.values()];
}

function detectResolvedWeaknesses(
  weaknesses: LongitudinalWeakness[],
  snapshot: SessionSnapshot
): LongitudinalWeakness[] {
  const currentWeakTopics = new Set(
    snapshot.competencies
      .filter((c) => c.coverage < 55)
      .map((c) => c.topic)
  );

  return weaknesses
    .filter((w) => w.status === 'recurring' && !currentWeakTopics.has(w.topic))
    .map((w) => ({ ...w, status: 'resolved' as WeaknessStatus }));
}

function computeWeaknessStatus(
  occurrenceCount: number,
  consecutiveCount: number
): WeaknessStatus {
  if (occurrenceCount >= 3 && consecutiveCount >= 2) return 'recurring';
  if (occurrenceCount >= 2) return 'recurring';
  return 'emerging';
}

// ─── Strength Helpers ─────────────────────────────────────────────────────────

function detectEmergingStrengths(
  existing: LongitudinalStrength[],
  snapshot: SessionSnapshot,
  sessionId: string
): LongitudinalStrength[] {
  const existingTopics = new Set(existing.map((s) => s.topic));

  const newStrengths = snapshot.competencies
    .filter((c) => c.coverage >= 80 && !existingTopics.has(c.topic))
    .map((c): LongitudinalStrength => ({
      id:                 `ls_${c.topic.replace(/\s+/g, '_')}`,
      topic:              c.topic,
      description:        `Strong performance in ${c.topic}`,
      category:           'depth',
      confirmedSessionId: sessionId,
      consistencyScore:   0.6,        // starts moderate — earned over time
    }));

  // Update consistency for existing strengths
  const updated = existing.map((s) => {
    const current = snapshot.competencies.find((c) => c.topic === s.topic);
    if (!current) return s;

    const delta = current.coverage >= 80 ? 0.1 : -0.1;
    return {
      ...s,
      consistencyScore: Math.max(0, Math.min(1, s.consistencyScore + delta)),
    };
  });

  return [...updated, ...newStrengths];
}

// ─── Confidence + Pressure Helpers ───────────────────────────────────────────

function updateConfidenceStability(
  current: number,
  snapshot: SessionSnapshot
): number {
  const hasInstability = snapshot.behavior.patterns.some(
    (p) => p.patternCategory === 'confidence' && p.trendDirection === 'shrinking'
  );
  const delta = hasInstability ? -0.1 : 0.05;
  return Math.max(0, Math.min(1, current + delta));
}

function buildInitialPressureProfile(): PressureAdaptationProfile {
  return {
    averageResponseQuality: 50,
    adaptationTrend:        'stable',
    commonReactions:        [],
    breakingPoints:         [],
    resilienceScore:        0.5,
  };
}

function updatePressureProfile(
  existing: PressureAdaptationProfile,
  snapshot: SessionSnapshot
): PressureAdaptationProfile {
  const pressureInsights = snapshot.behavior.insights.filter((i) =>
    i.phase === 'pressure'
  );

  if (pressureInsights.length === 0) return existing;

  const avgConfidence = pressureInsights.reduce(
    (sum, i) => sum + i.confidenceScore, 0
  ) / pressureInsights.length;

  const quality     = Math.round(avgConfidence * 100);
  const delta       = quality - existing.averageResponseQuality;
  const trend: TrendDirection =
    delta > 5 ? 'expanding' : delta < -5 ? 'shrinking' : 'stable';

  const newReactions = pressureInsights
    .flatMap((i) => i.evidence)
    .slice(0, 3);

  return {
    ...existing,
    averageResponseQuality: Math.round(
      (existing.averageResponseQuality + quality) / 2
    ),
    adaptationTrend:  trend,
    commonReactions:  [...new Set([...existing.commonReactions, ...newReactions])].slice(0, 10),
    resilienceScore:  Math.max(0, Math.min(1,
      existing.resilienceScore + (delta > 0 ? 0.05 : -0.05)
    )),
  };
}

// ─── Derived Queries ──────────────────────────────────────────────────────────

/**
 * Top N recurring weaknesses — for prompt context.
 */
export function getTopWeaknesses(
  profile: CandidateEvolutionProfile,
  n = 3
): LongitudinalWeakness[] {
  return profile.recurringWeaknesses
    .filter((w) => w.status === 'recurring')
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, n);
}

/**
 * Is this a returning candidate with meaningful history?
 */
export function hasHistory(profile: CandidateEvolutionProfile): boolean {
  return profile.sessionCount >= 2;
}

/**
 * Compact context slice for prompt-builder.
 * Never exposes full profile to prompt layer.
 */
export function toLongitudinalPromptContext(
  profile: CandidateEvolutionProfile,
  latestScore: number
): import('./longitudinal-types').LongitudinalPromptContext {
  return {
    sessionNumber:      profile.sessionCount,
    previousScore:      profile.scoreHistory.length >= 2
      ? profile.scoreHistory[profile.scoreHistory.length - 2].finalScore
      : null,
    scoreTrend:         profile.readinessTrend,
    topWeaknesses:      getTopWeaknesses(profile).map((w) => ({
      topic:           w.topic,
      status:          w.status,
      occurrenceCount: w.occurrenceCount,
    })),
    recentInsights:     [],   // populated by longitudinal-insights layer (future)
    pressureResilience: profile.pressureProfile.resilienceScore,
    hasLongitudinalHistory: hasHistory(profile),
  };
}
