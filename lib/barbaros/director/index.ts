// lib/barbaros/director/index.ts
// Public surface of the Director (tactical decision layer).
// Consumers (engine.ts) import from here — never from internal files directly.

// ─── Decider ─────────────────────────────────────────────────────────────────

export {
  decideNextMove,
  createInterventionBudget,
  summarizeDecision,
} from './decide-next-move'

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  DirectorIntent,
  InterventionBudget,
  BudgetKey,
  DirectorReason,
  DirectorDecision,
  DirectorContext,
} from './director-types'
