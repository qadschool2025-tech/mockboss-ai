// lib/barbaros/longitudinal/session-delta.ts
// Computes the delta between two SessionSnapshots.
// Consumed by: candidate-profile.ts, growth-tracker.ts, weakness-tracker.ts
//
// Architectural rules:
// - Pure function — no global state reads
// - `now` injected as parameter — no Date.now() inside
// - polarity read from pattern.polarity (set by tier3-insights) — never guessed here
// - canonicalKey treated as opaque — matched as-is, never parsed
// - canonicalType used for semantic grouping in downstream consumers
// - significantChange requires 2-of-3 dimensions to cross threshold

import type { SessionSnapshot } from '../artifacts/session-snapshot'
import type { PatternPolarity } from '../analysis/behavior/behavior-types'

// ─── Dimension Weights ────────────────────────────────────────────────────────
// Must sum to 1.0 — enforced at module load.

const DIMENSION_WEIGHTS: Record<string, number> = {
  technical_depth:  0.30,
  communication:    0.20,
  problem_solving:  0.20,
  behavioral:       0.15,
  culture_fit:      0.15,
}

const WEIGHT_SUM = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0)
if (Math.abs(WEIGHT_SUM - 1.0) > 0.001) {
  throw new Error(`[session-delta] DIMENSION_WEIGHTS sum ${WEIGHT_SUM.toFixed(3)} !== 1.0`)
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const SCORE_IMPROVED_MIN            =  3
const SCORE_DECLINED_MIN            = -3
const SIGNIFICANT_WEIGHTED_SCORE    =  6
const SIGNIFICANT_BEHAVIOR_COUNT    =  3
const SIGNIFICANT_COMPETENCY_COUNT  =  2

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeltaDirection = 'improved' | 'declined' | 'stable' | 'new' | 'dropped'

export interface ScoreDelta {
  dimension:  string
  previous:   number
  current:    number
  change:     number
  direction:  DeltaDirection
  weight:     number
}

export interface BehaviorDelta {
  canonicalKey:  string
  canonicalType: string           // semantic type — survives key changes
  polarity:      PatternPolarity  // from pattern — never guessed
  direction:     DeltaDirection
  previousCount: number
  currentCount:  number
}

export interface SessionDelta {
  sessionId:         string
  previousSessionId: string | null
  computedAt:        number

  overallScoreDelta:  number
  weightedScoreDelta: number
  scoreDimensions:    ScoreDelta[]

  behaviorsImproved: BehaviorDelta[]
  behaviorsDeclined: BehaviorDelta[]
  behaviorsNew:      BehaviorDelta[]
  behaviorsDropped:  BehaviorDelta[]

  newCompetenciesCovered:   string[]
  competenciesStillMissing: string[]

  contradictionsThisSession: number
  contradictionsDelta:       number

  phasesCompleted: string[]
  phasesSkipped:   string[]

  overallTrend:      DeltaDirection
  significantChange: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreDirection(change: number): DeltaDirection {
  if (change >= SCORE_IMPROVED_MIN) return 'improved'
  if (change <= SCORE_DECLINED_MIN) return 'declined'
  return 'stable'
}

/**
 * Polarity-aware behavior direction.
 * Reads polarity from the pattern itself — tier3-insights is the single source of truth.
 * positive: more occurrences = improved (e.g. example_usage, self_correction)
 * negative: fewer occurrences = improved (e.g. topic_avoidance, hedging_spike)
 */
function behaviorDirection(
  prev:     number,
  curr:     number,
  polarity: PatternPolarity
): DeltaDirection {
  if (prev === 0 && curr > 0) return 'new'
  if (prev > 0  && curr === 0) return 'dropped'

  if (polarity === 'positive') {
    if (curr > prev) return 'improved'
    if (curr < prev) return 'declined'
  } else {
    if (curr < prev) return 'improved'
    if (curr > prev) return 'declined'
  }
  return 'stable'
}

function computeWeightedDelta(scoreDimensions: ScoreDelta[]): number {
  const raw = scoreDimensions.reduce((sum, d) => sum + d.change * d.weight, 0)
  return Math.round(raw * 10) / 10   // rounding once — only here
}

function computeOverallTrend(
  weightedDelta:  number,
  improvedCount:  number,
  declinedCount:  number,
  isFirstSession: boolean
): DeltaDirection {
  if (isFirstSession) return 'new'
  const behaviorNet = improvedCount - declinedCount
  if (weightedDelta >= SCORE_IMPROVED_MIN && behaviorNet >= 0) return 'improved'
  if (weightedDelta <= SCORE_DECLINED_MIN && behaviorNet <= 0) return 'declined'
  return 'stable'
}

function computeSignificantChange(
  weightedDelta:     number,
  behaviorsImproved: BehaviorDelta[],
  behaviorsDeclined: BehaviorDelta[],
  newCompetencies:   string[]
): boolean {
  const flags = [
    Math.abs(weightedDelta) >= SIGNIFICANT_WEIGHTED_SCORE,
    (behaviorsImproved.length + behaviorsDeclined.length) >= SIGNIFICANT_BEHAVIOR_COUNT,
    newCompetencies.length >= SIGNIFICANT_COMPETENCY_COUNT,
  ]
  return flags.filter(Boolean).length >= 2
}

// ─── Core Function ────────────────────────────────────────────────────────────

export function computeSessionDelta(
  current:  SessionSnapshot,
  previous: SessionSnapshot | null,
  now:      number
): SessionDelta {

  const isFirstSession = previous === null

  // ── Score deltas ────────────────────────────────────────────────────────────

  const currentOverall    = current.finalScore?.overall  ?? 0
  const previousOverall   = previous?.finalScore?.overall ?? 0
  const overallScoreDelta = currentOverall - previousOverall

  const scoreDimensions: ScoreDelta[] = []

  if (current.finalScore) {
    const currDims = current.finalScore.dimensions as Record<string, number>
    const prevDims = (previous?.finalScore?.dimensions ?? {}) as Record<string, number>

    for (const [dimension, currVal] of Object.entries(currDims)) {
      const prevVal = prevDims[dimension] ?? 0
      const change  = currVal - prevVal
      scoreDimensions.push({
        dimension,
        previous:  prevVal,
        current:   currVal,
        change,
        direction: isFirstSession ? 'new' : scoreDirection(change),
        weight:    DIMENSION_WEIGHTS[dimension] ?? 0,
      })
    }
  }

  const weightedScoreDelta = isFirstSession ? 0 : computeWeightedDelta(scoreDimensions)

  // ── Behavior deltas ─────────────────────────────────────────────────────────
  // Pattern identity: canonicalKey (opaque match) + canonicalType (semantic label)
  // polarity: read directly from pattern — never inferred here

  const currentPatterns  = current.behaviorArtifact?.patterns  ?? []
  const previousPatterns = previous?.behaviorArtifact?.patterns ?? []

  // Map: canonicalKey → { occurrences, canonicalType, polarity }
  interface PatternMeta { count: number; canonicalType: string; polarity: PatternPolarity }

  const prevMap = new Map<string, PatternMeta>()
  for (const p of previousPatterns) {
    prevMap.set(p.canonicalKey, {
      count:         p.occurrences ?? p.occurrenceCount,
      canonicalType: p.canonicalType,
      polarity:      p.polarity,
    })
  }

  const currMap = new Map<string, PatternMeta>()
  for (const p of currentPatterns) {
    currMap.set(p.canonicalKey, {
      count:         p.occurrences ?? p.occurrenceCount,
      canonicalType: p.canonicalType,
      polarity:      p.polarity,
    })
  }

  const allKeys = new Set([...prevMap.keys(), ...currMap.keys()])

  const behaviorsImproved: BehaviorDelta[] = []
  const behaviorsDeclined: BehaviorDelta[] = []
  const behaviorsNew:      BehaviorDelta[] = []
  const behaviorsDropped:  BehaviorDelta[] = []

  for (const key of allKeys) {
    const prev     = prevMap.get(key)
    const curr     = currMap.get(key)

    // Resolve meta: prefer current, fall back to previous (for dropped patterns)
    const meta     = curr ?? prev!
    const prevCount = prev?.count ?? 0
    const currCount = curr?.count ?? 0

    const dir = isFirstSession
      ? 'new'
      : behaviorDirection(prevCount, currCount, meta.polarity)

    const entry: BehaviorDelta = {
      canonicalKey:  key,
      canonicalType: meta.canonicalType,
      polarity:      meta.polarity,
      direction:     dir,
      previousCount: prevCount,
      currentCount:  currCount,
    }

    if      (dir === 'improved') behaviorsImproved.push(entry)
    else if (dir === 'declined') behaviorsDeclined.push(entry)
    else if (dir === 'new')      behaviorsNew.push(entry)
    else if (dir === 'dropped')  behaviorsDropped.push(entry)
  }

  // ── Competency coverage ─────────────────────────────────────────────────────

  const currentCovered  = new Set(current.competencyCoverage?.covered  ?? [])
  const previousCovered = new Set(previous?.competencyCoverage?.covered ?? [])
  const allRequired     = new Set([
    ...(current.competencyCoverage?.required  ?? []),
    ...(previous?.competencyCoverage?.required ?? []),
  ])

  const newCompetenciesCovered: string[] = []
  for (const c of currentCovered) {
    if (!previousCovered.has(c)) newCompetenciesCovered.push(c)
  }

  const competenciesStillMissing: string[] = []
  for (const c of allRequired) {
    if (!currentCovered.has(c)) competenciesStillMissing.push(c)
  }

  // ── Contradictions ──────────────────────────────────────────────────────────

  const contradictionsThisSession = current.contradictions?.length  ?? 0
  const contradictionsPrevious    = previous?.contradictions?.length ?? 0
  const contradictionsDelta       = contradictionsThisSession - contradictionsPrevious

  // ── Phase completion ────────────────────────────────────────────────────────

  const phasesCompleted = current.phaseSummary?.completed ?? []
  const phasesSkipped   = current.phaseSummary?.skipped   ?? []

  // ── Summary ─────────────────────────────────────────────────────────────────

  const overallTrend = computeOverallTrend(
    weightedScoreDelta,
    behaviorsImproved.length,
    behaviorsDeclined.length,
    isFirstSession
  )

  const significantChange = computeSignificantChange(
    weightedScoreDelta,
    behaviorsImproved,
    behaviorsDeclined,
    newCompetenciesCovered
  )

  return {
    sessionId:         current.sessionId,
    previousSessionId: previous?.sessionId ?? null,
    computedAt:        now,

    overallScoreDelta,
    weightedScoreDelta,
    scoreDimensions,

    behaviorsImproved,
    behaviorsDeclined,
    behaviorsNew,
    behaviorsDropped,

    newCompetenciesCovered,
    competenciesStillMissing,

    contradictionsThisSession,
    contradictionsDelta,

    phasesCompleted,
    phasesSkipped,

    overallTrend,
    significantChange,
  }
}
