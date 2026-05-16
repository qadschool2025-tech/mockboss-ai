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

import type { InterviewConfig }        from '../types'
import type { SessionState }           from '../state/session-state'
import type { TrackedWeakness }        from '../longitudinal/weakness-tracker'
import type { TrackedGrowth }          from '../longitudinal/growth-tracker'
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

  // Sort by weight (ascending)
  const sorted = [...allLayers].sort((a, b) => a.weight - b.weight)

  // Separate empty layers
  const skippedLayers: string[] = []
  const activeLayers = sorted.filter(layer => {
    if (layer.content.trim() === '') {
      skippedLayers.push(layer.label)
      return false
    }
    return true
  })

  // Enforce token budget — truncate non-protected layers if over limit
  const { layers: budgetedLayers, truncated } = enforceBudget(
    activeLayers,
    SYSTEM_PROMPT_CHAR_LIMIT
  )

  // Assemble: layers separated by double newline for LLM readability
  const systemPrompt = budgetedLayers
    .map(l => l.content.trim())
    .join('\n\n')

  // Opening message — injected only on first message of session
  const openingMessage = isFirstMessage
    ? buildOpeningMessage(config)
    : null

  return {
    systemPrompt,
    openingMessage,
    layerCount:    budgetedLayers.length,
    charCount:     systemPrompt.length,
    truncated,
    skippedLayers,
  }
}

// ─── Opening Message ──────────────────────────────────────────────────────────

/**
 * buildOpeningMessage
 * Fills the opening template with candidate-specific data.
 * Injected as the assistant's first turn — not part of system prompt.
 */
function buildOpeningMessage(config: InterviewConfig): string {
  return BARBAROS_OPENING_TEMPLATE
    .replace('{candidateName}', config.candidateName)
    .replace('{jobTitle}',      config.jobTitle)
    .replace('{institution}',   config.institution)
}

// ─── Budget Enforcement ───────────────────────────────────────────────────────

/**
 * enforceBudget
 *
 * If total char count exceeds limit:
 * 1. Protected layers are never touched
 * 2. Largest non-protected layer is truncated first
 * 3. Truncation appends '[truncated]' marker for debugging
 *
 * This is a last-resort safeguard — in practice the prompt should stay well
 * under limit. If this fires frequently, session_context or weakness layers
 * need their own internal truncation.
 */
function enforceBudget(
  layers: SystemLayer[],
  limit:  number
): { layers: SystemLayer[]; truncated: boolean } {
  const total = layers.reduce((sum, l) => sum + l.content.length, 0)

  if (total <= limit) {
    return { layers, truncated: false }
  }

  // Log warning — visible in Vercel logs
  console.warn(
    `[prompt-builder] System prompt over budget: ${total} chars > ${limit} limit. Truncating.`
  )

  let remaining = limit
  const result: SystemLayer[] = []
  let truncated = false

  // Protected layers first — guaranteed full
  const protected_  = layers.filter(l => PROTECTED_LAYER_LABELS.has(l.label))
  const unprotected = layers.filter(l => !PROTECTED_LAYER_LABELS.has(l.label))

  for (const l of protected_) {
    result.push(l)
    remaining -= l.content.length
  }

  // Distribute remaining budget across unprotected layers proportionally
  const unprotectedTotal = unprotected.reduce((s, l) => s + l.content.length, 0)

  for (const l of unprotected) {
    if (remaining <= 0) {
      skippedInTruncation(l.label)
      truncated = true
      continue
    }

    if (l.content.length <= remaining) {
      result.push(l)
      remaining -= l.content.length
    } else {
      // Truncate this layer
      const allowedChars = Math.max(remaining - 20, 0)
      result.push({
        ...l,
        content: l.content.slice(0, allowedChars) + '\n[truncated]',
      })
      remaining = 0
      truncated = true
    }
  }

  // Restore original weight order after budget pass
  result.sort((a, b) => a.weight - b.weight)

  return { layers: result, truncated }
}

function skippedInTruncation(label: string): void {
  console.warn(`[prompt-builder] Layer "${label}" skipped due to budget overflow.`)
}

// ─── Debug Helper ─────────────────────────────────────────────────────────────

/**
 * describePrompt
 * Returns a human-readable summary of what was built.
 * Used in development/logging — never injected into LLM.
 */
export function describePrompt(built: BuiltPrompt): string {
  const lines = [
    `Layers: ${built.layerCount}`,
    `Chars:  ${built.charCount} / ${SYSTEM_PROMPT_CHAR_LIMIT}`,
    `Truncated: ${built.truncated}`,
  ]

  if (built.skippedLayers.length > 0) {
    lines.push(`Skipped (empty): ${built.skippedLayers.join(', ')}`)
  }

  if (built.openingMessage) {
    lines.push(`Opening: "${built.openingMessage.slice(0, 60)}..."`)
  }

  return lines.join('\n')
}
