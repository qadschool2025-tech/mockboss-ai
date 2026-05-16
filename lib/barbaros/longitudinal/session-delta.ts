
// lib/barbaros/longitudinal/session-delta.ts
// Computes the delta between two SessionSnapshots.
// Consumed by: candidate-profile.ts (merge), growth-tracker.ts, weakness-tracker.ts
// Rule: accepts explicit parameters — never reads global state.

import type { SessionSnapshot } from '../artifacts/session-snapshot'

// ─── Delta Types ────────────────────────────────────────────────────────────

export type DeltaDirection = 'improved' | 'declined' | 'stable' | 'new' | 'dropped'

export interface ScoreDelta {
  dimension: string
  previous: number
  current: number
  change: number          // current - previous (positive = improved)
  direction: DeltaDirection
}

export interface BehaviorDelta {
  patternKey: string
  direction: DeltaDirection
  previousCount: number
  currentCount: number
}

export interface SessionDelta {
  sessionId: string
  previousSessionId: string | null
  computedAt: number      // timestamp — injected, never Date.now() inside

  // Score movement
  overallScoreDelta: number
  scoreDimensions: ScoreDelta[]

  // Behavior shifts
  behaviorsImproved: BehaviorDelta[]
  behaviorsDeclined: BehaviorDelta[]
  behaviorsNew: BehaviorDelta[]
  behaviorsDropped: BehaviorDelta[]

  // Competency coverage
  newCompetenciesCovered: string[]
  competenciesStillMissing: string[]

  // Contradiction trend
  contradictionsThisSession: number
  contradictionsDelta: number   // vs previous session (negative = fewer = better)

  // Phase completion
  phasesCompleted: string[]
  phasesSkipped: string[]

  // Summary flags
  overallTrend: DeltaDirection
  significantChange: boolean    // true if |overallScoreDelta| >= SIGNIFICANT_THRESHOLD
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SIGNIFICANT_THRESHOLD = 8   // points
const IMPROVED_MIN_CHANGE   = 3   // minimum change to count as 'improved'
const DECLINED_MIN_CHANGE   = -3  // maximum change to count as 'declined'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreDirection(change: number): DeltaDirection {
  if (change >= IMPROVED_MIN_CHANGE)  return 'improved'
  if (change <= DECLINED_MIN_CHANGE)  return 'declined'
  return 'stable'
}

function behaviorDirection(prev: number, curr: number): DeltaDirection {
  if (prev === 0 && curr > 0) return 'new'
  if (prev > 0 && curr === 0) return 'dropped'
  if (curr < prev)            return 'improved'   // fewer negative signals = better
  if (curr > prev)            return 'declined'
  return 'stable'
}

function overallTrend(scoreDelta: number, behaviorImprovedCount: number, behaviorDeclinedCount: number): DeltaDirection {
  if (scoreDelta >= IMPROVED_MIN_CHANGE && behaviorImprovedCount >= behaviorDeclinedCount) return 'improved'
  if (scoreDelta <= DECLINED_MIN_CHANGE && behaviorDeclinedCount > behaviorImprovedCount)  return 'declined'
  return 'stable'
}

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * computeSessionDelta
 *
 * @param current  - the just-completed session snapshot
 * @param previous - the last session snapshot (null if first session ever)
 * @param now      - injected timestamp (never Date.now() inside this fn)
 */
export function computeSessionDelta(
  current: SessionSnapshot,
  previous: SessionSnapshot | null,
  now: number
): SessionDelta {

  const sessionId         = current.sessionId
  const previousSessionId = previous?.sessionId ?? null

  // ── Score deltas ──────────────────────────────────────────────────────────

  const currentOverall  = current.finalScore?.overall ?? 0
  const previousOverall = previous?.finalScore?.overall ?? 0
  const overallScoreDelta = currentOverall - previousOverall

  const scoreDimensions: ScoreDelta[] = []

  if (current.finalScore) {
    const dims = current.finalScore.dimensions
    const prevDims = previous?.finalScore?.dimensions ?? {}

    for (const [dimension, currVal] of Object.entries(dims)) {
      const prevVal = (prevDims as Record<string, number>)[dimension] ?? 0
      const change  = currVal - prevVal
      scoreDimensions.push({
        dimension,
        previous: prevVal,
        current:  currVal,
        change,
        direction: previous ? scoreDirection(change) : 'new'
      })
    }
  }

  // ── Behavior deltas ───────────────────────────────────────────────────────

  const currentPatterns  = current.behaviorArtifact?.patterns  ?? []
  const previousPatterns = previous?.behaviorArtifact?.patterns ?? []

  const prevPatternMap = new Map<string, number>()
  for (const p of previousPatterns) {
    prevPatternMap.set(p.canonicalKey, p.occurrences)
  }

  const currPatternMap = new Map<string, number>()
  for (const p of currentPatterns) {
    currPatternMap.set(p.canonicalKey, p.occurrences)
  }

  const allKeys = new Set([...prevPatternMap.keys(), ...currPatternMap.keys()])

  const behaviorsImproved: BehaviorDelta[] = []
  const behaviorsDeclined: BehaviorDelta[] = []
  const behaviorsNew:      BehaviorDelta[] = []
  const behaviorsDropped:  BehaviorDelta[] = []

  for (const key of allKeys) {
    const prev = prevPatternMap.get(key) ?? 0
    const curr = currPatternMap.get(key) ?? 0
    const dir  = behaviorDirection(prev, curr)

    const entry: BehaviorDelta = {
      patternKey:    key,
      direction:     dir,
      previousCount: prev,
      currentCount:  curr
    }

    if (dir === 'improved') behaviorsImproved.push(entry)
    if (dir === 'declined') behaviorsDeclined.push(entry)
    if (dir === 'new')      behaviorsNew.push(entry)
    if (dir === 'dropped')  behaviorsDropped.push(entry)
  }

  // ── Competency coverage ───────────────────────────────────────────────────

  const currentCovered  = new Set(current.competencyCoverage?.covered  ?? [])
  const previousCovered = new Set(previous?.competencyCoverage?.covered ?? [])
  const allRequired     = new Set([
    ...(current.competencyCoverage?.required  ?? []),
    ...(previous?.competencyCoverage?.required ?? [])
  ])

  const newCompetenciesCovered: string[] = []
  for (const c of currentCovered) {
    if (!previousCovered.has(c)) newCompetenciesCovered.push(c)
  }

  const competenciesStillMissing: string[] = []
  for (const c of allRequired) {
    if (!currentCovered.has(c)) competenciesStillMissing.push(c)
  }

  // ── Contradictions ────────────────────────────────────────────────────────

  const contradictionsThisSession = current.contradictions?.length ?? 0
  const contradictionsPrevious    = previous?.contradictions?.length ?? 0
  const contradictionsDelta       = contradictionsThisSession - contradictionsPrevious

  // ── Phase completion ──────────────────────────────────────────────────────

  const phasesCompleted = current.phaseSummary?.completed ?? []
  const phasesSkipped   = current.phaseSummary?.skipped   ?? []

  // ── Summary ───────────────────────────────────────────────────────────────

  const trend = previous
    ? overallTrend(overallScoreDelta, behaviorsImproved.length, behaviorsDeclined.length)
    : 'new'

  const significantChange = Math.abs(overallScoreDelta) >= SIGNIFICANT_THRESHOLD

  return {
    sessionId,
    previousSessionId,
    computedAt: now,

    overallScoreDelta,
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

    overallTrend: trend,
    significantChange
  }
}
