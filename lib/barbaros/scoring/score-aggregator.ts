// lib/barbaros/scoring/score-aggregator.ts
// CONTRACT: Final score aggregation. Single rounding point for the entire system.
// Consumes: NormalizedScoreSet (float weighted values)
// Produces: FinalScoreBreakdown (integers, labels, report-ready)
//
// Rules:
//   - ALL rounding happens here and ONLY here
//   - NormalizedScoreSet weighted values are floats (no early rounding)
//   - Penalty applied AFTER weighted sum
//   - Final score: 0-100 integer
//   - No LLM. No state. Pure math.

import type { NormalizedScoreSet, NormalizedDimension, ScoreLabel } from './score-normalizer';
import { clamp, toScoreLabel, getWeakestDimension, getDimensionsBelow, hasMeaningfulPenalty } from './score-normalizer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DimensionResult {
  score: number;          // 0-100 integer (rounded here)
  weighted: number;       // float * weight, rounded here
  weight: number;
  label: ScoreLabel;
  contribution: number;   // % contribution to final score (display only)
}

export interface FinalScoreBreakdown {
  // Core score
  finalScore: number;             // 0-100 integer — THE number

  // Dimension breakdown
  dimensions: {
    engagement:         DimensionResult;
    clarity:            DimensionResult;
    credibility:        DimensionResult;
    depth:              DimensionResult;
    competencyCoverage: DimensionResult;
  };

  // Penalty
  penalty: {
    score: number;        // 0-100 integer
    applied: number;      // actual points deducted from final
    meaningful: boolean;  // >= 10 points
  };

  // Summary
  overallLabel:    ScoreLabel;
  weakestArea:     string;
  areasToImprove:  string[];   // dimensions below 55

  // Interview readiness (derived from finalScore)
  readinessLevel:  ReadinessLevel;
  readinessLabel:  string;

  // Metadata
  aggregatedAt: number;
}

export type ReadinessLevel =
  | 'not_ready'        // 0-39
  | 'developing'       // 40-54
  | 'approaching'      // 55-69
  | 'ready'            // 70-84
  | 'highly_ready';    // 85-100

// ─── Main Aggregator ──────────────────────────────────────────────────────────

export function aggregateScores(
  scoreSet: NormalizedScoreSet,
  now: number
): FinalScoreBreakdown {
  const { dimensions, penaltyTotal, rawWeightedSum } = scoreSet;

  // ── Step 1: Aggregate weighted floats (NO rounding yet) ───────────────────
  const weightedSum =
    dimensions.engagement.weighted +
    dimensions.clarity.weighted +
    dimensions.credibility.weighted +
    dimensions.depth.weighted +
    dimensions.competencyCoverage.weighted;

  // ── Step 2: Apply penalty (float precision preserved) ────────────────────
  const penaltyApplied = clamp(penaltyTotal * dimensions.contradictions.weight, 0, 30);
  const scoreBeforeRound = clamp(weightedSum - penaltyApplied, 0, 100);

  // ── Step 3: Single rounding point ─────────────────────────────────────────
  const finalScore = Math.round(scoreBeforeRound);

  // ── Step 4: Build dimension results (round each weighted here) ───────────
  const dimensionResults = buildDimensionResults(dimensions, finalScore);

  // ── Step 5: Penalty summary ───────────────────────────────────────────────
  const penalty = {
    score:       Math.round(penaltyTotal),
    applied:     Math.round(penaltyApplied),
    meaningful:  hasMeaningfulPenalty(scoreSet),
  };

  // ── Step 6: Derived summary fields ───────────────────────────────────────
  const weakest        = getWeakestDimension(scoreSet);
  const areasToImprove = getDimensionsBelow(scoreSet, 55);
  const overallLabel   = toScoreLabel(finalScore);
  const readinessLevel = toReadinessLevel(finalScore);
  const readinessLabel = toReadinessLabel(readinessLevel);

  return {
    finalScore,
    dimensions: dimensionResults,
    penalty,
    overallLabel,
    weakestArea:    weakest.name,
    areasToImprove,
    readinessLevel,
    readinessLabel,
    aggregatedAt:   now,
  };
}

// ─── Dimension Result Builder ─────────────────────────────────────────────────

function buildDimensionResults(
  dimensions: NormalizedScoreSet['dimensions'],
  finalScore: number
): FinalScoreBreakdown['dimensions'] {
  // Total weighted (float) for contribution calculation
  const totalWeighted =
    dimensions.engagement.weighted +
    dimensions.clarity.weighted +
    dimensions.credibility.weighted +
    dimensions.depth.weighted +
    dimensions.competencyCoverage.weighted;

  function build(dim: NormalizedDimension): DimensionResult {
    const roundedWeighted = Math.round(dim.weighted);
    const contribution = totalWeighted > 0
      ? Math.round((dim.weighted / totalWeighted) * 100)
      : 0;

    return {
      score:        Math.round(dim.score),
      weighted:     roundedWeighted,
      weight:       dim.weight,
      label:        dim.label,
      contribution,
    };
  }

  return {
    engagement:         build(dimensions.engagement),
    clarity:            build(dimensions.clarity),
    credibility:        build(dimensions.credibility),
    depth:              build(dimensions.depth),
    competencyCoverage: build(dimensions.competencyCoverage),
  };
}

// ─── Readiness Level ──────────────────────────────────────────────────────────

function toReadinessLevel(score: number): ReadinessLevel {
  if (score >= 85) return 'highly_ready';
  if (score >= 70) return 'ready';
  if (score >= 55) return 'approaching';
  if (score >= 40) return 'developing';
  return 'not_ready';
}

function toReadinessLabel(level: ReadinessLevel): string {
  const labels: Record<ReadinessLevel, string> = {
    highly_ready: 'Highly Interview Ready',
    ready:        'Interview Ready',
    approaching:  'Approaching Readiness',
    developing:   'Still Developing',
    not_ready:    'Not Yet Ready',
  };
  return labels[level];
}

// ─── Derived Queries (used by artifacts + report layers) ─────────────────────

/**
 * Top performing dimension — for positive reinforcement in report.
 */
export function getStrongestDimension(
  breakdown: FinalScoreBreakdown
): { name: string; score: number } {
  const entries = Object.entries(breakdown.dimensions) as [
    string,
    DimensionResult
  ][];

  return entries.reduce(
    (best, [name, dim]) =>
      dim.score > best.score ? { name, score: dim.score } : best,
    { name: entries[0][0], score: entries[0][1].score }
  );
}

/**
 * Score delta from "ready" threshold (70).
 * Positive = above ready. Negative = below ready.
 */
export function scoreGapToReady(breakdown: FinalScoreBreakdown): number {
  return breakdown.finalScore - 70;
}

/**
 * True if candidate improved meaningfully from a previous score.
 */
export function showedImprovement(
  current: FinalScoreBreakdown,
  previous: FinalScoreBreakdown,
  threshold = 5
): boolean {
  return current.finalScore - previous.finalScore >= threshold;
}

/**
 * Compact score summary for longitudinal snapshot.
 * Avoids sending full breakdown to longitudinal layer.
 */
export function toScoreSnapshot(breakdown: FinalScoreBreakdown): ScoreSnapshot {
  return {
    finalScore:      breakdown.finalScore,
    overallLabel:    breakdown.overallLabel,
    readinessLevel:  breakdown.readinessLevel,
    weakestArea:     breakdown.weakestArea,
    dimensionScores: {
      engagement:         breakdown.dimensions.engagement.score,
      clarity:            breakdown.dimensions.clarity.score,
      credibility:        breakdown.dimensions.credibility.score,
      depth:              breakdown.dimensions.depth.score,
      competencyCoverage: breakdown.dimensions.competencyCoverage.score,
    },
    aggregatedAt: breakdown.aggregatedAt,
  };
}

/**
 * Compact type for longitudinal layer consumption.
 * Does NOT include full breakdown — only what longitudinal needs.
 */
export interface ScoreSnapshot {
  finalScore:      number;
  overallLabel:    ScoreLabel;
  readinessLevel:  ReadinessLevel;
  weakestArea:     string;
  dimensionScores: Record<string, number>;
  aggregatedAt:    number;
}
