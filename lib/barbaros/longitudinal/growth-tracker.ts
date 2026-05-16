
// lib/barbaros/longitudinal/growth-tracker.ts
// Tracks candidate growth signals across sessions.
// Consumed by: candidate-profile.ts, prompt-builder.ts (encouragement logic), report page
//
// Architectural rules:
// - Pure functions — no global state
// - `now` injected as parameter — no Date.now() inside
// - Reads SessionDelta only — never raw snapshots or messages
// - Growth is evidence-based: requires consistent signal across sessions
// - Mirrors weakness-tracker structure for symmetry — easier to reason about together

import type { SessionDelta, BehaviorDelta, ScoreDelta } from './session-delta'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GrowthSource =
  | 'behavior'     // positive pattern improving, or negative pattern resolved
  | 'score'        // dimension score rising above threshold
  | 'competency'   // new competency covered
  | 'consistency'  // fewer contradictions over time

export type GrowthStrength = 'emerging' | 'confirmed' | 'sustained'

export type GrowthStatus =
  | 'active'     // growth is ongoing
  | 'plateaued'  // improvement stopped but maintained
  | 'regressed'  // growth reversed (weakness re-emerged)
  | 'stale'      // not seen for STALE_THRESHOLD sessions

export interface TrackedGrowth {
  id:            string
  canonicalType: string       // semantic identifier — mirrors weakness-tracker pattern
  label:         string       // human-readable for report
  source:        GrowthSource
  strength:      GrowthStrength
  status:        GrowthStatus

  firstSeenSessionId: string
  lastSeenSessionId:  string
  sessionCount:       number  // sessions showing this growth signal
  consecutiveCount:   number  // current consecutive streak
  regressionCount:    number  // how many times it regressed after improving
  missedCount:        number  // sessions since last seen

  firstSeenAt: number
  lastSeenAt:  number
}

export interface GrowthTrackerState {
  growthSignals:        TrackedGrowth[]
  lastUpdatedAt:        number
  totalSessionsTracked: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCORE_GROWTH_THRESHOLD      = 65   // dimension score above this = strength
const SCORE_GROWTH_MIN_CHANGE     = 4    // minimum improvement to count as growth signal
const CONFIRMED_THRESHOLD         = 2    // consecutive sessions → confirmed
const SUSTAINED_THRESHOLD         = 4    // consecutive sessions → sustained
const STALE_THRESHOLD             = 3    // sessions without appearance → stale
const CONTRADICTION_GROWTH_MIN    = -2   // contradictionsDelta this low = growth signal

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStrength(consecutiveCount: number): GrowthStrength {
  if (consecutiveCount >= SUSTAINED_THRESHOLD)  return 'sustained'
  if (consecutiveCount >= CONFIRMED_THRESHOLD)  return 'confirmed'
  return 'emerging'
}

function computeStatus(
  isGrowingThisSession: boolean,
  isRegression:         boolean,
  missedCount:          number
): GrowthStatus {
  if (missedCount >= STALE_THRESHOLD) return 'stale'
  if (isRegression)                   return 'regressed'
  if (!isGrowingThisSession)          return 'plateaued'
  return 'active'
}

// ─── Growth Extraction from Delta ────────────────────────────────────────────

interface RawGrowth {
  canonicalType: string
  label:         string
  source:        GrowthSource
  isRegression:  boolean   // true = this was growth that reversed
}

function extractFromBehaviors(delta: SessionDelta): RawGrowth[] {
  const results: RawGrowth[] = []

  // Improved negative patterns = growth (fewer bad signals)
  for (const b of delta.behaviorsImproved) {
    if (b.polarity === 'negative') {
      results.push({
        canonicalType: b.canonicalType,
        label:         b.canonicalType.replace(/_/g, ' '),
        source:        'behavior',
        isRegression:  false,
      })
    }
  }

  // Improved positive patterns = growth (more good signals)
  for (const b of delta.behaviorsImproved) {
    if (b.polarity === 'positive') {
      results.push({
        canonicalType: b.canonicalType,
        label:         b.canonicalType.replace(/_/g, ' '),
        source:        'behavior',
        isRegression:  false,
      })
    }
  }

  // Dropped negative patterns = growth (bad pattern gone)
  for (const b of delta.behaviorsDropped) {
    if (b.polarity === 'negative') {
      results.push({
        canonicalType: b.canonicalType,
        label:         b.canonicalType.replace(/_/g, ' '),
        source:        'behavior',
        isRegression:  false,
      })
    }
  }

  // Declined positive patterns = regression
  for (const b of delta.behaviorsDeclined) {
    if (b.polarity === 'positive') {
      results.push({
        canonicalType: b.canonicalType,
        label:         b.canonicalType.replace(/_/g, ' '),
        source:        'behavior',
        isRegression:  true,
      })
    }
  }

  return results
}

function extractFromScores(delta: SessionDelta): RawGrowth[] {
  return delta.scoreDimensions
    .filter(d =>
      d.current >= SCORE_GROWTH_THRESHOLD &&
      d.change  >= SCORE_GROWTH_MIN_CHANGE
    )
    .map(d => ({
      canonicalType: `score_growth_${d.dimension}`,
      label:         `${d.dimension.replace(/_/g, ' ')} improvement`,
      source:        'score' as GrowthSource,
      isRegression:  false,
    }))
}

function extractFromCompetencies(delta: SessionDelta): RawGrowth[] {
  return delta.newCompetenciesCovered.map(c => ({
    canonicalType: `competency_growth_${c}`,
    label:         `${c.replace(/_/g, ' ')} covered`,
    source:        'competency' as GrowthSource,
    isRegression:  false,
  }))
}

function extractFromConsistency(delta: SessionDelta): RawGrowth[] {
  if (delta.contradictionsDelta > CONTRADICTION_GROWTH_MIN) return []
  if (delta.contradictionsThisSession > 2) return []  // still too many — not growth yet

  return [{
    canonicalType: 'consistency_improvement',
    label:         'fewer contradictions',
    source:        'consistency',
    isRegression:  false,
  }]
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * updateGrowthTracker
 *
 * Takes existing state + new SessionDelta → returns updated state.
 * Never mutates input.
 *
 * @param state     - current growth tracker state
 * @param delta     - computed delta for the session just completed
 * @param sessionId - ID of the session just completed
 * @param now       - injected timestamp
 */
export function updateGrowthTracker(
  state:     GrowthTrackerState,
  delta:     SessionDelta,
  sessionId: string,
  now:       number
): GrowthTrackerState {

  const rawGrowthSignals: RawGrowth[] = [
    ...extractFromBehaviors(delta),
    ...extractFromScores(delta),
    ...extractFromCompetencies(delta),
    ...extractFromConsistency(delta),
  ]

  // Deduplicate: canonicalType → RawGrowth
  // If same type appears as both growth and regression, regression wins (conservative)
  const sessionMap = new Map<string, RawGrowth>()
  for (const rg of rawGrowthSignals) {
    const existing = sessionMap.get(rg.canonicalType)
    if (!existing || rg.isRegression) {
      sessionMap.set(rg.canonicalType, rg)
    }
  }

  // Update existing growth signals
  const updatedSignals: TrackedGrowth[] = state.growthSignals.map(g => {
    const match = sessionMap.get(g.canonicalType)

    if (!match) {
      // Not seen this session
      const missedCount = g.missedCount + 1
      return {
        ...g,
        missedCount,
        status: missedCount >= STALE_THRESHOLD ? 'stale' : g.status,
      }
    }

    // Seen this session — mark handled
    sessionMap.delete(g.canonicalType)

    const isRegression    = match.isRegression
    const consecutiveCount = isRegression ? 0 : g.consecutiveCount + 1
    const regressionCount  = isRegression ? g.regressionCount + 1 : g.regressionCount

    return {
      ...g,
      lastSeenSessionId: sessionId,
      lastSeenAt:        now,
      sessionCount:      g.sessionCount + 1,
      consecutiveCount,
      regressionCount,
      missedCount:       0,
      strength:          computeStrength(consecutiveCount),
      status:            computeStatus(!isRegression, isRegression, 0),
    }
  })

  // Add new growth signals
  const newSignals: TrackedGrowth[] = []
  for (const [, rg] of sessionMap) {
    if (rg.isRegression) continue  // regression on first appearance — nothing to track yet

    newSignals.push({
      id:                 `gr_${rg.source}_${rg.canonicalType.slice(0, 20)}_${now}`,
      canonicalType:      rg.canonicalType,
      label:              rg.label,
      source:             rg.source,
      strength:           'emerging',
      status:             'active',
      firstSeenSessionId: sessionId,
      lastSeenSessionId:  sessionId,
      sessionCount:       1,
      consecutiveCount:   1,
      regressionCount:    0,
      missedCount:        0,
      firstSeenAt:        now,
      lastSeenAt:         now,
    })
  }

  // Remove stale resolved signals that haven't appeared in a long time
  const finalSignals = [
    ...updatedSignals.filter(g => !(g.status === 'stale' && g.missedCount >= STALE_THRESHOLD * 2)),
    ...newSignals,
  ]

  return {
    growthSignals:        finalSignals,
    lastUpdatedAt:        now,
    totalSessionsTracked: state.totalSessionsTracked + 1,
  }
}

/**
 * createEmptyGrowthTrackerState
 */
export function createEmptyGrowthTrackerState(now: number): GrowthTrackerState {
  return {
    growthSignals:        [],
    lastUpdatedAt:        now,
    totalSessionsTracked: 0,
  }
}

/**
 * getActiveGrowthSignals
 * Used by prompt-builder for positive reinforcement logic.
 */
export function getActiveGrowthSignals(state: GrowthTrackerState): TrackedGrowth[] {
  return state.growthSignals.filter(g => g.status === 'active')
}

/**
 * getSustainedGrowth
 * Used by report page — highlights consistent long-term improvement.
 */
export function getSustainedGrowth(state: GrowthTrackerState): TrackedGrowth[] {
  return state.growthSignals.filter(
    g => g.strength === 'sustained' && g.status !== 'stale' && g.status !== 'regressed'
  )
}

/**
 * getConfirmedGrowth
 * Used by candidate-profile for longitudinal summary.
 */
export function getConfirmedGrowth(state: GrowthTrackerState): TrackedGrowth[] {
  return state.growthSignals.filter(
    g => (g.strength === 'confirmed' || g.strength === 'sustained') && g.status === 'active'
  )
}

/**
 * hasRegressedAreas
 * Used by prompt-builder to decide whether to apply pressure or encouragement.
 */
export function hasRegressedAreas(state: GrowthTrackerState): boolean {
  return state.growthSignals.some(g => g.status === 'regressed')
}

/**
 * getGrowthSummary
 * Returns counts by strength — used by report page header.
 */
export function getGrowthSummary(state: GrowthTrackerState): {
  emerging:  number
  confirmed: number
  sustained: number
  regressed: number
} {
  const active = state.growthSignals.filter(g => g.status !== 'stale')
  return {
    emerging:  active.filter(g => g.strength === 'emerging'  && g.status === 'active').length,
    confirmed: active.filter(g => g.strength === 'confirmed' && g.status === 'active').length,
    sustained: active.filter(g => g.strength === 'sustained' && g.status === 'active').length,
    regressed: active.filter(g => g.status === 'regressed').length,
  }
}
