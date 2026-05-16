// lib/barbaros/scoring/score-normalizer.ts
// CONTRACT: Pure normalization layer. Converts raw signals into 0-100 scores.
// No LLM. No state. No decisions. Only math.
//
// Responsibilities:
//   - Normalize raw inputs (0-1 floats, counts, enums) → 0-100 integers
//   - Apply dimension weights
//   - Clamp, floor, ceil safely
//   - Produce NormalizedScoreSet consumed by score-aggregator
//
// Rules:
//   - All functions are pure (same input → same output)
//   - Weights are centralized in WEIGHTS object
//   - No score ever exceeds 100 or goes below 0

import type {
  BehaviorOrchestrationResult,
  SessionBehaviorPattern,
  ValidatedSignal,
} from '../analysis/behavior/behavior-types';
import type { CompetencyCoverage } from '../types';

// ─── Weight Configuration (change here only) ─────────────────────────────────

export const WEIGHTS = {
  // Behavioral dimensions
  engagement:        0.20,
  clarity:           0.15,
  credibility:       0.20,
  depth:             0.15,

  // Competency dimensions
  competencyCoverage: 0.20,

  // Penalty dimensions
  contradictions:    0.10,   // subtracted from total
} as const;

// Verify weights sum to 1.0 (compile-time safety via type, runtime check below)
const WEIGHT_SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(WEIGHT_SUM - 1.0) > 0.001) {
  throw new Error(`WEIGHTS must sum to 1.0, got ${WEIGHT_SUM}`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawScoreInput {
  // From behavior layer
  behavior: BehaviorOrchestrationResult;

  // From competency-tracker
  competencies: Record<string, CompetencyCoverage>;

  // From contradiction-tracker
  contradictionCount: number;
  majorContradictions: number;
  moderateContradictions: number;

  // Session metadata
  totalUserMessages: number;
  elapsedMinutes: number;

  now: number;
}

export interface NormalizedDimension {
  raw: number;          // pre-normalization value (for debugging)
  score: number;        // 0-100
  weight: number;       // applied weight
  weighted: number;     // score * weight (0-100)
  label: ScoreLabel;
}

export type ScoreLabel = 'excellent' | 'good' | 'fair' | 'weak' | 'poor';

export interface NormalizedScoreSet {
  dimensions: {
    engagement:         NormalizedDimension;
    clarity:            NormalizedDimension;
    credibility:        NormalizedDimension;
    depth:              NormalizedDimension;
    competencyCoverage: NormalizedDimension;
    contradictions:     NormalizedDimension;  // penalty
  };
  penaltyTotal:   number;   // 0-100, subtracted from weighted sum
  rawWeightedSum: number;   // before penalty
  normalizedAt:   number;
}

// ─── Main Normalizer ──────────────────────────────────────────────────────────

export function normalizeScores(input: RawScoreInput): NormalizedScoreSet {
  const { behavior, competencies, contradictionCount,
          majorContradictions, moderateContradictions,
          totalUserMessages, now } = input;

  // ── Engagement ───────────────────────────────────────────────────────────────
  const engagementRaw = computeEngagementRaw(behavior, totalUserMessages);
  const engagement    = buildDimension(engagementRaw, WEIGHTS.engagement);

  // ── Clarity ──────────────────────────────────────────────────────────────────
  const clarityRaw = computeClarityRaw(behavior);
  const clarity    = buildDimension(clarityRaw, WEIGHTS.clarity);

  // ── Credibility ──────────────────────────────────────────────────────────────
  const credibilityRaw = computeCredibilityRaw(behavior, contradictionCount);
  const credibility    = buildDimension(credibilityRaw, WEIGHTS.credibility);

  // ── Depth ─────────────────────────────────────────────────────────────────────
  const depthRaw = computeDepthRaw(behavior);
  const depth    = buildDimension(depthRaw, WEIGHTS.depth);

  // ── Competency Coverage ───────────────────────────────────────────────────────
  const competencyCoverageRaw = computeCompetencyCoverageRaw(competencies);
  const competencyCoverage    = buildDimension(competencyCoverageRaw, WEIGHTS.competencyCoverage);

  // ── Contradiction Penalty ─────────────────────────────────────────────────────
  const contradictionsRaw = computeContradictionPenaltyRaw(
    majorContradictions,
    moderateContradictions
  );
  const contradictions = buildDimension(contradictionsRaw, WEIGHTS.contradictions);

  const rawWeightedSum = clamp(
    engagement.weighted +
    clarity.weighted +
    credibility.weighted +
    depth.weighted +
    competencyCoverage.weighted,
    0, 100
  );

  const penaltyTotal = contradictions.weighted;

  return {
    dimensions: {
      engagement,
      clarity,
      credibility,
      depth,
      competencyCoverage,
      contradictions,
    },
    penaltyTotal,
    rawWeightedSum,
    normalizedAt: now,
  };
}

// ─── Raw Score Computers ──────────────────────────────────────────────────────

function computeEngagementRaw(
  behavior: BehaviorOrchestrationResult,
  totalUserMessages: number
): number {
  let score = 50;

  // Positive signals
  const validated = behavior.validatedSignals.filter((s) => s.confirmed);
  const positiveTypes = new Set(['example_usage', 'self_correction', 'response_expanding']);
  const positiveCount = validated.filter((s) => positiveTypes.has(s.signalType)).length;
  score += Math.min(positiveCount * 8, 30);

  // Negative signals
  const negativeTypes = new Set(['response_shrinking', 'engagement_drop', 'hedging_spike']);
  const negativeCount = validated.filter((s) => negativeTypes.has(s.signalType)).length;
  score -= Math.min(negativeCount * 10, 30);

  // Active silence risk penalty
  const silenceRisk = behavior.activeRisks.find((r) => r.type === 'silence_risk');
  if (silenceRisk?.severity === 'high')   score -= 15;
  if (silenceRisk?.severity === 'medium') score -= 8;

  // Dropout risk penalty
  const dropoutRisk = behavior.activeRisks.find((r) => r.type === 'dropout_risk');
  if (dropoutRisk) score -= 20;

  return clamp(score, 0, 100);
}

function computeClarityRaw(behavior: BehaviorOrchestrationResult): number {
  let score = 60;

  const validated = behavior.validatedSignals.filter((s) => s.confirmed);

  // Vague quantification — major clarity issue
  const vagueCount = validated.filter(
    (s) => s.signalType === 'vague_quantification'
  ).length;
  score -= Math.min(vagueCount * 12, 36);

  // Hedging — moderate clarity issue
  const hedgeCount = validated.filter(
    (s) => s.signalType === 'hedging_spike'
  ).length;
  score -= Math.min(hedgeCount * 8, 24);

  // Self-correction = positive clarity signal
  const selfCorrectionCount = validated.filter(
    (s) => s.signalType === 'self_correction'
  ).length;
  score += Math.min(selfCorrectionCount * 6, 18);

  return clamp(score, 0, 100);
}

function computeCredibilityRaw(
  behavior: BehaviorOrchestrationResult,
  contradictionCount: number
): number {
  let score = 70;

  // Contradiction penalty
  score -= Math.min(contradictionCount * 12, 48);

  // Overconfidence risk
  const overconfidenceRisk = behavior.activeRisks.find(
    (r) => r.type === 'overconfidence_risk' || r.type === 'credibility_risk'
  );
  if (overconfidenceRisk?.severity === 'high')   score -= 20;
  if (overconfidenceRisk?.severity === 'medium') score -= 10;

  // Inconsistent framing signals
  const inconsistentCount = behavior.validatedSignals.filter(
    (s) => s.confirmed && s.signalType === 'inconsistent_framing'
  ).length;
  score -= Math.min(inconsistentCount * 8, 24);

  // Deflection penalty
  const evasionRisk = behavior.activeRisks.find((r) => r.type === 'evasion_risk');
  if (evasionRisk?.severity === 'high')   score -= 15;
  if (evasionRisk?.severity === 'medium') score -= 8;

  return clamp(score, 0, 100);
}

function computeDepthRaw(behavior: BehaviorOrchestrationResult): number {
  let score = 50;

  const validated = behavior.validatedSignals.filter((s) => s.confirmed);

  // Examples = strong depth signal
  const exampleCount = validated.filter(
    (s) => s.signalType === 'example_usage'
  ).length;
  score += Math.min(exampleCount * 12, 36);

  // Confirmed insights = depth demonstrated
  score += Math.min(behavior.insights.length * 5, 20);

  // Deflection = depth avoided
  const deflectionCount = validated.filter(
    (s) => s.signalType === 'possible_deflection'
  ).length;
  score -= Math.min(deflectionCount * 10, 30);

  // Topic avoidance
  const avoidanceCount = validated.filter(
    (s) => s.signalType === 'topic_avoidance'
  ).length;
  score -= Math.min(avoidanceCount * 8, 24);

  return clamp(score, 0, 100);
}

function computeCompetencyCoverageRaw(
  competencies: Record<string, CompetencyCoverage>
): number {
  const entries = Object.values(competencies);
  if (entries.length === 0) return 0;

  const total = entries.reduce((sum, c) => sum + c.coverage, 0);
  return clamp(Math.round(total / entries.length), 0, 100);
}

function computeContradictionPenaltyRaw(
  majorContradictions: number,
  moderateContradictions: number
): number {
  // Major = 20 points penalty each, moderate = 10
  const penalty = (majorContradictions * 20) + (moderateContradictions * 10);
  return clamp(penalty, 0, 100);
}

// ─── Dimension Builder ────────────────────────────────────────────────────────

function buildDimension(rawScore: number, weight: number): NormalizedDimension {
  const score    = clamp(Math.round(rawScore), 0, 100);
  const weighted = clamp(Math.round(score * weight), 0, 100);

  return {
    raw: rawScore,
    score,
    weight,
    weighted,
    label: toScoreLabel(score),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function toScoreLabel(score: number): ScoreLabel {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 55) return 'fair';
  if (score >= 40) return 'weak';
  return 'poor';
}

// ─── Derived Queries (used by score-aggregator) ───────────────────────────────

/**
 * Weakest dimension — for targeted feedback in report.
 */
export function getWeakestDimension(
  scoreSet: NormalizedScoreSet
): { name: string; score: number } {
  const dims = Object.entries(scoreSet.dimensions) as [
    string,
    NormalizedDimension
  ][];

  // Exclude penalty dimension from "weakest" — it's already a deduction
  const nonPenalty = dims.filter(([name]) => name !== 'contradictions');

  return nonPenalty.reduce(
    (weakest, [name, dim]) =>
      dim.score < weakest.score ? { name, score: dim.score } : weakest,
    { name: nonPenalty[0][0], score: nonPenalty[0][1].score }
  );
}

/**
 * Dimensions below threshold — for coaching summary.
 */
export function getDimensionsBelow(
  scoreSet: NormalizedScoreSet,
  threshold: number
): string[] {
  return (
    Object.entries(scoreSet.dimensions) as [string, NormalizedDimension][]
  )
    .filter(([name, dim]) => name !== 'contradictions' && dim.score < threshold)
    .map(([name]) => name);
}

/**
 * True if penalty is significant enough to flag in report.
 */
export function hasMeaningfulPenalty(scoreSet: NormalizedScoreSet): boolean {
  return scoreSet.penaltyTotal >= 10;
}
