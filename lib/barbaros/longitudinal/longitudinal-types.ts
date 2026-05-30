// lib/barbaros/longitudinal/longitudinal-types.ts
// CONTRACT: Longitudinal intelligence types. Skeleton only.
// Purpose: Fix data contracts NOW to prevent architecture drift later.
//
// CONSUMES: SessionSnapshot artifacts only — never raw messages
// OWNED BY: longitudinal/ layer exclusively
//
// SKELETON RULES:
//   - Interfaces and types only
//   - No heavy logic (merge/update APIs in separate files)
//   - 'unknown' PatternCategory handled explicitly
//   - Session memory ≠ Longitudinal memory (hard boundary)
//
// TYPE FIX:
//   - ReadinessLevel imported from score-aggregator (its owner)
//   - ScoreLabel imported from score-normalizer (its owner — NOT score-aggregator)
//
// FUTURE:
//   - Populated by: candidate-profile.ts, session-delta.ts
//   - Consumed by: prompt-builder.ts, report layer, AI Coach Mode
//   - Storage: external DB (not in-memory) — outside V4 scope

import type { PatternCategory, TrendDirection } from '../analysis/behavior/behavior-types';
import type { ReadinessLevel } from '../scoring/score-aggregator';
import type { ScoreLabel } from '../scoring/score-normalizer';

// ─── Core Identity ────────────────────────────────────────────────────────────

/**
 * CandidateEvolutionProfile — master longitudinal record.
 * Built by merging SessionSnapshots over time.
 * Never contains raw messages or session-internal state.
 */
export interface CandidateEvolutionProfile {
  candidateId: string;
  createdAt: number;
  lastUpdatedAt: number;

  // Session history (compact references only)
  sessionCount: number;
  sessionIds: string[];
  lastSessionAt: number;

  // Score evolution
  scoreHistory: ScoreHistoryEntry[];
  currentReadiness: ReadinessLevel;
  readinessTrend: TrendDirection | null;

  // Behavior evolution
  recurringWeaknesses: LongitudinalWeakness[];
  resolvedWeaknesses: LongitudinalWeakness[];
  emergingStrengths: LongitudinalStrength[];

  // Pattern evolution
  confirmedPatterns: LongitudinalPatternRecord[];

  // Competency progression
  competencyProgression: CompetencyProgressionRecord[];

  // Pressure profile
  pressureProfile: PressureAdaptationProfile;

  // Confidence stability (cross-session)
  confidenceStabilityScore: number;   // 0-1, higher = more stable

  // Metadata
  jobTitle: string;
  targetInstitution: string | null;
  language: string;
}

// ─── Score History ────────────────────────────────────────────────────────────

export interface ScoreHistoryEntry {
  sessionId: string;
  sessionNumber: number;       // 1-based
  finalScore: number;          // 0-100
  readinessLevel: ReadinessLevel;
  dimensionScores: Record<string, number>;
  weakestArea: string;
  recordedAt: number;
}

export interface ScoreTrend {
  direction: TrendDirection;
  deltaFromFirst: number;      // current - first session score
  deltaFromLast: number;       // current - previous session score
  averageScore: number;
  peakScore: number;
  lowestScore: number;
  sessionCount: number;
}

// ─── Weakness Tracking ────────────────────────────────────────────────────────

export type WeaknessStatus =
  | 'recurring'     // seen in 2+ sessions
  | 'emerging'      // seen in last session only
  | 'resolving'     // was recurring, improving
  | 'resolved';     // not seen in last 2 sessions

export interface LongitudinalWeakness {
  id: string;
  topic: string;
  description: string;
  category: PatternCategory;    // 'unknown' handled explicitly below
  status: WeaknessStatus;

  firstObservedSessionId: string;
  lastObservedSessionId: string;
  occurrenceCount: number;      // sessions in which this appeared
  consecutiveCount: number;     // consecutive sessions

  improvementDelta: number;     // positive = improving, negative = worsening
  lastScore: number;            // 0-100, dimension score when last seen

  // 'unknown' category guard
  // analytics must check: if (weakness.category === 'unknown') handle separately
}

// ─── Strength Tracking ────────────────────────────────────────────────────────

export interface LongitudinalStrength {
  id: string;
  topic: string;
  description: string;
  category: PatternCategory;
  confirmedSessionId: string;   // sessionId when confirmed
  consistencyScore: number;     // 0-1, how consistently demonstrated
}

// ─── Pattern Records ──────────────────────────────────────────────────────────

/**
 * LongitudinalPatternRecord — cross-session pattern tracking.
 * Promoted from SessionBehaviorPattern when crossPhaseConfirmed + stable.
 * 'unknown' category patterns are stored but flagged for review.
 */
export interface LongitudinalPatternRecord {
  id: string;
  canonicalKey: string;         // matches SessionBehaviorPattern.canonicalKey
  description: string;
  category: PatternCategory;
  trendDirection: TrendDirection | null;

  // Cross-session tracking
  firstSessionId: string;
  lastSessionId: string;
  sessionOccurrences: number;
  totalOccurrenceCount: number;

  stabilityScore: number;       // 0-1, higher = more consistent
  decayCount: number;           // sessions without occurrence

  // Category guard
  requiresReview: boolean;      // true when category === 'unknown'
}

// ─── Competency Progression ───────────────────────────────────────────────────

export interface CompetencyProgressionRecord {
  topic: string;
  sessions: Array<{
    sessionId: string;
    sessionNumber: number;
    coverage: number;           // 0-100
    evidenceCount: number;
    label: ScoreLabel;
  }>;
  currentCoverage: number;
  trend: TrendDirection;
  peakCoverage: number;
  averageCoverage: number;
}

// ─── Pressure Adaptation ─────────────────────────────────────────────────────

/**
 * How candidate responds to pressure across sessions.
 * Built from pressure phase behavior signals.
 */
export interface PressureAdaptationProfile {
  averageResponseQuality: number;   // 0-100 under pressure
  adaptationTrend: TrendDirection;  // improving/stable/shrinking
  commonReactions: string[];        // recurring behaviors under pressure
  breakingPoints: string[];         // topics that consistently cause breakdown
  resilienceScore: number;          // 0-1
}

// ─── Session Delta ────────────────────────────────────────────────────────────

/**
 * SessionDelta — what changed between two sessions.
 * Produced by session-delta.ts.
 * Consumed by prompt-builder for adaptive interview context.
 */
export interface SessionDelta {
  fromSessionId: string;
  toSessionId: string;
  computedAt: number;

  scoreDelta: number;               // positive = improved
  readinessChanged: boolean;
  newWeaknesses: string[];          // topics newly appearing
  resolvedWeaknesses: string[];     // topics no longer weak
  improvedCompetencies: string[];
  declinedCompetencies: string[];
  newPatterns: string[];            // canonicalKeys newly confirmed
  decayedPatterns: string[];        // canonicalKeys that weakened
}

// ─── Longitudinal Insight ─────────────────────────────────────────────────────

/**
 * LongitudinalInsight — cross-session interpretation.
 * Generated by AI Coach layer (future).
 * NOT generated by tier3 — different scope entirely.
 */
export interface LongitudinalInsight {
  id: string;
  type: LongitudinalInsightType;
  description: string;
  evidence: string[];             // sessionIds + observations
  generatedAt: number;
  confidence: number;             // 0-1
  actionable: boolean;            // can candidate act on this?
  suggestedFocus: string | null;  // coaching recommendation
}

export type LongitudinalInsightType =
  | 'persistent_weakness'         // same weakness across 3+ sessions
  | 'breakthrough'                // major score jump
  | 'plateau'                     // no improvement after 3+ sessions
  | 'regression'                  // previously strong area now weak
  | 'consistent_strength'         // strong across all sessions
  | 'pressure_sensitivity'        // consistently weak under pressure
  | 'confidence_instability';     // confidence varies wildly across sessions

// ─── Prompt Context Slice ─────────────────────────────────────────────────────

/**
 * LongitudinalPromptContext — what prompt-builder receives from longitudinal.
 * Compact slice only — no full profile.
 * Prevents prompt-builder from becoming coupled to full CandidateEvolutionProfile.
 */
export interface LongitudinalPromptContext {
  sessionNumber: number;
  previousScore: number | null;     // null = first session
  scoreTrend: TrendDirection | null;
  topWeaknesses: Array<{
    topic: string;
    status: WeaknessStatus;
    occurrenceCount: number;
  }>;
  recentInsights: LongitudinalInsight[];
  pressureResilience: number;       // 0-1
  hasLongitudinalHistory: boolean;
}
