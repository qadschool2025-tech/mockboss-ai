// lib/barbaros/prompt/prompt-builder.ts
// Assembles the final system prompt from ordered layers.
// Consumed by: engine.ts (passes result to claude-client.ts)
//
// Rules:
// - Orchestrator only — zero business logic
// - Skips empty layers (content === '')
// - Sorts by weight before assembly
// - Token budget enforced: logs warning if over limit, truncates gracefully
// - Opening message built separately — injected as first user turn, not system prompt
//
// DIRECTOR INTEGRATION:
// - Accepts an OPTIONAL `directorDecision`. When present, a protected
//   "director" directive layer is injected instructing the LLM to EXECUTE the
//   chosen tactical move rather than pick its own. The intent→instruction
//   mapping below is the Language Layer (presentation of an already-made
//   decision — not decision-making). It can later move to system-layers.ts.
//
// CLOSING WINDOW (layer 3 — graceful wind-down):
// - The Director now signals the close with two dedicated, session-level intents
//   (not CLOSE_TOPIC, which the LLM reads as "switch topic" → a new question):
//     FINAL_QUESTION   → one last consolidating question; do NOT open a new topic.
//     INVITE_QUESTIONS → no new evaluation question; invite the candidate's own
//                        final question and prepare to close (≤75s / closing phase).
//   The actual farewell + report handoff is owned by the engine
//   (buildEndOfSessionOutput) and page.tsx.

import type { InterviewConfig }        from '../types'
import type { SessionState }           from '../state/session-state'
import type { TrackedWeakness }        from '../longitudinal/weakness-tracker'
import type { TrackedGrowth }          from '../longitudinal/growth-tracker'
import type { DirectorDecision, DirectorIntent } from '../director'
import {
  buildIdentityLayer,
  buildResponseStyleLayer,
  buildSessionContextLayer,
  buildLanguageLayer,
  buildStructureLayer,
  buildPressureLayer,
  buildWeaknessLayer,
  buildGrowthLayer,
  buildScoringLayer,
  buildTimeLayer,
  type SystemLayer,
} from './system-layers'
import { BARBAROS_OPENING_TEMPLATE } from './personality'

// ─── Constants ────────────────────────────────────────────────────────────────

// Approximate token budget for system prompt.
// claude-sonnet context is large, but we want the system prompt lean.
// 1 token ≈ 4 chars — 3000 tokens ≈ 12000 chars
const SYSTEM_PROMPT_CHAR_LIMIT = 12_000

// Layers that must never be truncated even if over budget
const PROTECTED_LAYER_LABELS = new Set([
  'identity',
  'response_style',
  'language',
  'scoring',
  'director',
])

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface PromptBuilderInput {
  config:         InterviewConfig
  state:          SessionState
  weaknesses:     TrackedWeakness[]   // active weaknesses from weakness-tracker
  growthSignals:  TrackedGrowth[]     // confirmed growth from growth-tracker
  elapsedMinutes: number
  totalMinutes:   number
  isFirstSession: boolean
  directorDecision?: DirectorDecision // optional — when present, the Director directs the next move
}

export interface BuiltPrompt {
  systemPrompt:   string
  openingMessage: string | null   // null if not first message
  layerCount:     number
  charCount:      number
  truncated:      boolean
  skippedLayers:  string[]        // labels of empty/skipped layers (for debugging)
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

/**
 * buildPrompt
 *
 * Assembles all layers into a final system prompt.
 * Pure function — no side effects, no LLM calls.
 *
 * @param input - all context needed to build the prompt
 * @param isFirstMessage - true only on the very first message of the session
 */
export function buildPrompt(
  input:          PromptBuilderInput,
  isFirstMessage: boolean
): BuiltPrompt {
  const {
    config,
    state,
    weaknesses,
    growthSignals,
    elapsedMinutes,
    totalMinutes,
    isFirstSession,
    directorDecision,
  } = input

  // Build all layers
  const allLayers: SystemLayer[] = [
    buildIdentityLayer(),
    buildResponseStyleLayer(),
    buildSessionContextLayer(config),
    buildLanguageLayer(config.language),
    buildStructureLayer(state.phase),
    buildPressureLayer(state),
    buildWeaknessLayer(weaknesses, isFirstSession),
    buildGrowthLayer(growthSignals, isFirstSession),
    buildScoringLayer(),
    buildTimeLayer(elapsedMinutes, totalMinutes),
  ]

  // Director directive — only when a decision is supplied (never on first turn).
  if (directorDecision) {
    allLayers.push(buildDirectorLayer(directorDecision))
  }

  // Sort by weight (ascending)
  const sorted = [...allLayers].sort((a, b) => a.weight - b.weight)

  // Separate empty layers
  const skippedLayers: string[] = []
  const activeLayers = sorted.filter(layer => {
    if (layer.content.
