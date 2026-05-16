// lib/barbaros/longitudinal/session-delta.ts
// Computes the delta between two SessionSnapshots.
// Consumed by: candidate-profile.ts, growth-tracker.ts, weakness-tracker.ts
//
// Architectural rules:
// - Pure function — no global state reads
// - `now` injected as parameter — no Date.now() inside
// - polarity-aware behavior delta (positive patterns: more = better)
// - canonicalKey treated as opaque string — no version assumption
// - significantChange considers score + behavior + competency together

import type { SessionSnapshot } from '../artifacts/session-snapshot'

// ─── Polarity Map ─────────────────────────────────────────────────────────────
// Positive patterns: more occurrences = better performance.
// All unlisted patterns default to 'negative' (safe fallback).
// Note: matching is substring-based because canonicalKey is a truncated hash
// (Architectural Debt #5) — exact match is not reliable across versions.

const POSITIVE_PATTERN_MARKERS = new Set([
  'example_usage',
  'self_correction',
  'engagement',
  'depth',
  'structured_response',
  'proactive_clarification',
])

function patternPolarity(canonicalKey: string): 'positive' | 'negative' {
  for (const marker of POSITIVE_PATTERN_MARKERS) {
    if (canonicalKey.includes(marker)) return 'positive'
  }
  return 'negative'
}

// ─── Dimension Weights ────────────────────────────────────────────────────────
// Used for weightedScoreDelta and weighted significantChange.
// Must sum to 1.0 — enforced at module load time.

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

const SCORE_IMPROVED_MIN = 3
const SCORE_DECLINED_MIN = -3

const SIGNIFICANT_WEIGHTED_SCORE    = 6
const SIGNIFICANT_BEHAVIOR_COUNT    = 3
const SIGNIFICANT_COMPETENCY_COUNT  = 2

// ─── Delta Types ──────────────────────────────────────────────────────────────

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
  patternKey:    string
  polarity:      'positive' | 'negative'
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

function behaviorDirection(
  prev:     number,
  curr:     number,
  polarity: 'positive' | 'negative'
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
  let weighted = 0
  for (const d of scoreDimensions) {
    weighted += d.change * d.weight
  }
  return Math.round(weighted * 10) / 10
}

function computeOverallTrend(
  weightedDelta:  number,
  improvedCount:  number,
  declinedCount:  number,
  isFirstSession: boolean
): DeltaDirection {
  if (isFirstSession) return 'new'

  const scoreUp   = weightedDelta >= SCORE_IMPROVED_MIN
  const scoreDown = weightedDelta <= SCORE_DECLINED_MIN
  const behaviorNet = improvedCount - declinedCount

  if (scoreUp   && behaviorNet >= 0) return 'improved'
  if (scoreDown && behaviorNet <= 0) return 'declined'
  return 'stable'
}

function computeSignificantChange(
  weightedDelta:     number,
  behaviorsImproved: BehaviorDelta[],
  behaviorsDeclined: BehaviorDelta[],
  newCompetencies:   string[]
): boolean {
  const scoreSignificant      = Math.abs(weightedDelta) >= SIGNIFICANT_WEIGHTED_SCORE
  const behaviorSignificant   = (behaviorsImproved.length + behaviorsDeclined.length) >= SIGNIFICANT_BEHAVIOR_COUNT
  const competencySignificant = newCompetencies.length >= SIGNIFICANT_COMPETENCY_COUNT

  return [scoreSignificant, behaviorSignificant, competencySignificant].filter(Boolean).length >= 2
}

// ─── Core Function ────────────────────────────────────────────────────────────

export function computeSessionDelta(
  current:  SessionSnapshot,
  previous: SessionSnapshot | null,
  now:      number
): SessionDelta {

  const isFirstSession = previous === null

  // Score deltas
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

  // Behavior deltas
  const currentPatterns  = current.behaviorArtifact?.patterns  ?? []
  const previousPatterns = previous?.behaviorArtifact?.patterns ?? []

  const prevMap = new Map<string, number>()
  for (const p of previousPatterns) prevMap.set(p.canonicalKey, p.occurrences)

  const currMap = new Map<string, number>()
  for (const p of currentPatterns) currMap.set(p.canonicalKey, p.occurrences)

  const allKeys = new Set([...prevMap.keys(), ...currMap.keys()])

  const behaviorsImproved: BehaviorDelta[] = []
  const behaviorsDeclined: BehaviorDelta[] = []
  const behaviorsNew:      BehaviorDelta[] = []
  const behaviorsDropped:  BehaviorDelta[] = []

  for (const key of allKeys) {
    const prev     = prevMap.get(key) ?? 0
    const curr     = currMap.get(key) ?? 0
    const polarity = patternPolarity(key)
    const dir      = isFirstSession ? 'new' : behaviorDirection(prev, curr, polarity)

    const entry: BehaviorDelta = { patternKey: key, polarity, direction: dir, previousCount: prev, currentCount: curr }

    if      (dir === 'improved') behaviorsImproved.push(entry)
    else if (dir === 'declined') behaviorsDeclined.push(entry)
    else if (dir === 'new')      behaviorsNew.push(entry)
    else if (dir === 'dropped')  behaviorsDropped.push(entry)
  }

  // Competency coverage
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

  // Contradictions
  const contradictionsThisSession = current.contradictions?.length  ?? 0
  const contradictionsPrevious    = previous?.contradictions?.length ?? 0
  const contradictionsDelta       = contradictionsThisSession - contradictionsPrevious

  // Phase completion
  const phasesCompleted = current.phaseSummary?.completed ?? []
  const phasesSkipped   = current.phaseSummary?.skipped   ?? []

  // Summary
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
