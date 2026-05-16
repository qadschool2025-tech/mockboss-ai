
// lib/barbaros/longitudinal/weakness-tracker.ts
// Tracks candidate weaknesses across sessions.
// Consumed by: candidate-profile.ts, growth-tracker.ts, prompt-builder.ts (pressure logic)
//
// Architectural rules:
// - Pure functions — no global state
// - `now` injected as parameter
// - Reads SessionDelta — never raw SessionSnapshot
// - Weakness persistence: a weakness survives until it shows 'improved' in N sessions
// - Weakness severity escalates if it appears in consecutive sessions

import type { SessionDelta, BehaviorDelta, DeltaDirection } from './session-delta'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeaknessSource =
  | 'behavior'       // from BehaviorDelta (negative pattern, recurring)
  | 'score'          // from ScoreDelta (dimension below threshold)
  | 'competency'     // from competenciesStillMissing
  | 'contradiction'  // from contradictionsDelta

export type WeaknessSeverity = 'mild' | 'moderate' | 'severe'

export type WeaknessStatus =
  | 'active'      // still present
  | 'improving'   // showed improvement but not resolved
  | 'resolved'    // improved in RESOLVE_THRESHOLD consecutive sessions
  | 'stale'       // not seen for STALE_THRESHOLD sessions (may be gone)

export interface TrackedWeakness {
  id: string
  canonicalType: string          // semantic identifier — stable across sessions
  label: string                  // human-readable label for report
  source: WeaknessSource
  severity: WeaknessSeverity
  status: WeaknessStatus

  firstSeenSessionId: string
  lastSeenSessionId:  string
  sessionCount:       number     // how many sessions this appeared in
  consecutiveCount:   number     // current consecutive-session streak
  improvementCount:   number     // how many sessions showed improvement
  missedCount:        number     // sessions since last seen (for stale detection)

  firstSeenAt: number
  lastSeenAt:  number
}

export interface WeaknessTrackerState {
  weaknesses: TrackedWeakness[]
  lastUpdatedAt: number
  totalSessionsTracked: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCORE_WEAKNESS_THRESHOLD  = 55    // dimension score below this = weakness
const SEVERITY_SEVERE_THRESHOLD =  3    // consecutive sessions → severe
const SEVERITY_MODERATE_THRESHOLD = 2  // consecutive sessions → moderate
const RESOLVE_THRESHOLD         =  2   // consecutive improvements → resolved
const STALE_THRESHOLD           =  3   // sessions without appearance → stale

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeid(prefix: string, type: string): string {
  return `${prefix}_${type}_${Math.random().toString(36).slice(2, 8)}`
}

function computeSeverity(consecutiveCount: number): WeaknessSeverity {
  if (consecutiveCount >= SEVERITY_SEVERE_THRESHOLD)   return 'severe'
  if (consecutiveCount >= SEVERITY_MODERATE_THRESHOLD) return 'moderate'
  return 'mild'
}

function computeStatus(
  direction:        DeltaDirection,
  improvementCount: number,
  missedCount:      number
): WeaknessStatus {
  if (missedCount >= STALE_THRESHOLD)            return 'stale'
  if (improvementCount >= RESOLVE_THRESHOLD)     return 'resolved'
  if (direction === 'improved')                  return 'improving'
  return 'active'
}

// ─── Weakness Extraction from Delta ──────────────────────────────────────────

interface RawWeakness {
  canonicalType: string
  label:         string
  source:        WeaknessSource
  direction:     DeltaDirection
}

function extractFromBehaviors(delta: SessionDelta): RawWeakness[] {
  const results: RawWeakness[] = []

  // Declined negative patterns = weakness surfacing/worsening
  for (const b of delta.behaviorsDeclined) {
    if (b.polarity === 'negative') {
      results.push({
        canonicalType: b.canonicalType,
        label:         b.canonicalType.replace(/_/g, ' '),
        source:        'behavior',
        direction:     'declined',
      })
    }
  }

  // New negative patterns = weakness appearing for first time
  for (const b of delta.behaviorsNew) {
    if (b.polarity === 'negative') {
      results.push({
        canonicalType: b.canonicalType,
        label:         b.canonicalType.replace(/_/g, ' '),
        source:        'behavior',
        direction:     'new',
      })
    }
  }

  // Improved negative patterns = weakness getting better
  for (const b of delta.behaviorsImproved) {
    if (b.polarity === 'negative') {
      results.push({
        canonicalType: b.canonicalType,
        label:         b.canonicalType.replace(/_/g, ' '),
        source:        'behavior',
        direction:     'improved',
      })
    }
  }

  return results
}

function extractFromScores(delta: SessionDelta): RawWeakness[] {
  return delta.scoreDimensions
    .filter(d => d.current < SCORE_WEAKNESS_THRESHOLD)
    .map(d => ({
      canonicalType: `score_${d.dimension}`,
      label:         d.dimension.replace(/_/g, ' '),
      source:        'score' as WeaknessSource,
      direction:     d.direction,
    }))
}

function extractFromCompetencies(delta: SessionDelta): RawWeakness[] {
  return delta.competenciesStillMissing.map(c => ({
    canonicalType: `competency_${c}`,
    label:         c.replace(/_/g, ' '),
    source:        'competency' as WeaknessSource,
    direction:     'stable' as DeltaDirection,
  }))
}

function extractFromContradictions(delta: SessionDelta): RawWeakness[] {
  if (delta.contradictionsThisSession === 0) return []
  // Only flag as weakness if contradictions increased or persisting
  if (delta.contradictionsDelta <= 0 && delta.contradictionsThisSession < 2) return []
  return [{
    canonicalType: 'contradiction_pattern',
    label:         'contradiction pattern',
    source:        'contradiction',
    direction:     delta.contradictionsDelta > 0 ? 'declined' : 'stable',
  }]
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * updateWeaknessTracker
 *
 * Takes existing state + new SessionDelta → returns updated state.
 * Never mutates input.
 *
 * @param state     - current weakness tracker state (empty for first session)
 * @param delta     - computed delta for the session just completed
 * @param sessionId - ID of the session just completed
 * @param now       - injected timestamp
 */
export function updateWeaknessTracker(
  state:     WeaknessTrackerState,
  delta:     SessionDelta,
  sessionId: string,
  now:       number
): WeaknessTrackerState {

  // Extract all raw weaknesses from this session's delta
  const rawWeaknesses: RawWeakness[] = [
    ...extractFromBehaviors(delta),
    ...extractFromScores(delta),
    ...extractFromCompetencies(delta),
    ...extractFromContradictions(delta),
  ]

  // Build lookup: canonicalType → RawWeakness for this session
  const sessionMap = new Map<string, RawWeakness>()
  for (const rw of rawWeaknesses) {
    // If same type appears multiple times, keep 'declined' > 'new' > others
    const existing = sessionMap.get(rw.canonicalType)
    if (!existing || rw.direction === 'declined') {
      sessionMap.set(rw.canonicalType, rw)
    }
  }

  // Update existing weaknesses
  const updatedWeaknesses: TrackedWeakness[] = state.weaknesses.map(w => {
    const match = sessionMap.get(w.canonicalType)

    if (!match) {
      // Not seen this session — increment missedCount
      const missedCount = w.missedCount + 1
      return {
        ...w,
        missedCount,
        status: missedCount >= STALE_THRESHOLD ? 'stale' : w.status,
      }
    }

    // Seen this session — update
    sessionMap.delete(w.canonicalType)  // mark as handled

    const isImprovement = match.direction === 'improved'
    const improvementCount = isImprovement ? w.improvementCount + 1 : 0
    const consecutiveCount = isImprovement ? 0 : w.consecutiveCount + 1

    return {
      ...w,
      lastSeenSessionId: sessionId,
      lastSeenAt:        now,
      sessionCount:      w.sessionCount + 1,
      consecutiveCount,
      improvementCount,
      missedCount:       0,
      severity:          computeSeverity(consecutiveCount),
      status:            computeStatus(match.direction, improvementCount, 0),
    }
  })

  // Add new weaknesses (those not already tracked)
  const newWeaknesses: TrackedWeakness[] = []
  for (const [, rw] of sessionMap) {
    if (rw.direction === 'improved' || rw.direction === 'dropped') continue  // ignore resolved-on-first-appearance

    newWeaknesses.push({
      id:                 makeid('wk', rw.source),
      canonicalType:      rw.canonicalType,
      label:              rw.label,
      source:             rw.source,
      severity:           'mild',
      status:             'active',
      firstSeenSessionId: sessionId,
      lastSeenSessionId:  sessionId,
      sessionCount:       1,
      consecutiveCount:   1,
      improvementCount:   0,
      missedCount:        0,
      firstSeenAt:        now,
      lastSeenAt:         now,
    })
  }

  // Filter out weaknesses that have been resolved and stale for too long
  const finalWeaknesses = [
    ...updatedWeaknesses.filter(w => w.status !== 'resolved' || w.missedCount < STALE_THRESHOLD),
    ...newWeaknesses,
  ]

  return {
    weaknesses:           finalWeaknesses,
    lastUpdatedAt:        now,
    totalSessionsTracked: state.totalSessionsTracked + 1,
  }
}

/**
 * createEmptyWeaknessTrackerState
 * Initial state for a new candidate profile.
 */
export function createEmptyWeaknessTrackerState(now: number): WeaknessTrackerState {
  return {
    weaknesses:           [],
    lastUpdatedAt:        now,
    totalSessionsTracked: 0,
  }
}

/**
 * getActiveWeaknesses
 * Returns only weaknesses that are currently active or improving.
 * Used by prompt-builder for pressure logic.
 */
export function getActiveWeaknesses(state: WeaknessTrackerState): TrackedWeakness[] {
  return state.weaknesses.filter(w => w.status === 'active' || w.status === 'improving')
}

/**
 * getSevereWeaknesses
 * Returns severe weaknesses — used by report page for highlighting.
 */
export function getSevereWeaknesses(state: WeaknessTrackerState): TrackedWeakness[] {
  return state.weaknesses.filter(w => w.severity === 'severe' && w.status !== 'stale')
}

/**
 * getPersistentWeaknesses
 * Returns weaknesses seen in 2+ sessions — used by longitudinal coach layer.
 */
export function getPersistentWeaknesses(state: WeaknessTrackerState): TrackedWeakness[] {
  return state.weaknesses.filter(w => w.sessionCount >= 2 && w.status !== 'stale')
}
