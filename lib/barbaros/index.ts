// lib/barbaros/index.ts
// Public API for Barbaros V4.
// Single import point for app/api/interview/route.ts
//
// Rule: route.ts imports ONLY from here — never from internal modules directly.
// This file is the contract boundary between the engine and the app layer.

// ─── Engine (primary entry point) ────────────────────────────────────────────

export { runEngine }                    from './engine'
export type { EngineInput, EngineOutput } from './engine'

// ─── Config & Types (needed by route.ts to construct EngineInput) ─────────────

export type {
  InterviewConfig,
  Message,
  InterviewPhase,
} from './types'

// ─── Session State (route.ts manages state between turns) ────────────────────

export {
  createInitialSessionState,
} from './state/session-state'
export type { SessionState } from './state/session-state'

// ─── Longitudinal State (route.ts manages across sessions) ───────────────────

export {
  createEmptyWeaknessTrackerState,
  getActiveWeaknesses,
  getSevereWeaknesses,
} from './longitudinal/weakness-tracker'
export type { WeaknessTrackerState } from './longitudinal/weakness-tracker'

export {
  createEmptyGrowthTrackerState,
  getActiveGrowthSignals,
  getSustainedGrowth,
  getGrowthSummary,
} from './longitudinal/growth-tracker'
export type { GrowthTrackerState } from './longitudinal/growth-tracker'

// ─── Snapshot (route.ts stores snapshot at session end) ──────────────────────

export type { SessionSnapshot } from './artifacts/session-snapshot'

// ─── Report helpers (consumed by app/report/page.tsx) ────────────────────────

export {
  getPersistentWeaknesses,
} from './longitudinal/weakness-tracker'

export {
  getConfirmedGrowth,
  hasRegressedAreas,
} from './longitudinal/growth-tracker'
