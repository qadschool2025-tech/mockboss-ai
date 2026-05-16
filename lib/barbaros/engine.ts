// lib/barbaros/engine.ts
// Barbaros V4 — Main Orchestrator.
// Consumed by: app/api/interview/route.ts (single import point)
//
// Architectural rules (Decision #14):
// - Orchestrator only — zero business logic lives here
// - All computation delegated to specialist modules
// - State immutable — engine receives state, returns patch, never mutates
// - phaseChanged computed here and passed explicitly to behavior pipeline
// - `now` injected once at entry — propagated to all sub-calls
// - No direct LLM calls — delegated to claude-client.ts via prompt-builder output

import type { InterviewConfig, Message }  from './types'
import type { SessionState }              from './state/session-state'
import type { WeaknessTrackerState }      from './longitudinal/weakness-tracker'
import type { GrowthTrackerState }        from './longitudinal/growth-tracker'
import type { SessionSnapshot }           from './artifacts/session-snapshot'

import { advancePhase, isSessionComplete } from './state/phase-engine'
import { updateTopicMemory }               from './state/topic-memory'
import { updateCompetencyTracker }         from './state/competency-tracker'
import { updateContradictionTracker }      from './state/contradiction-tracker'

import { orchestrateBehavior }            from './analysis/behavior/behavior-orchestrator'
import type { BehaviorContext }           from './analysis/behavior/behavior-types'

import { computeAggregateScore }          from './scoring/score-aggregator'
import { buildSessionSnapshot }           from './artifacts/session-snapshot'

import { updateWeaknessTracker }          from './longitudinal/weakness-tracker'
import { updateGrowthTracker }            from './longitudinal/growth-tracker'
import { computeSessionDelta }            from './longitudinal/session-delta'

import { buildPrompt }                    from './prompt/prompt-builder'
import { callClaude }                     from './llm/claude-client'
import { synthesizeSpeech }               from './llm/tts'

// ─── Engine Input / Output ────────────────────────────────────────────────────

export interface EngineInput {
  config:          InterviewConfig
  messages:        Message[]
  state:           SessionState
  weaknessState:   WeaknessTrackerState
  growthState:     GrowthTrackerState
  previousSnapshot: SessionSnapshot | null   // null on first session ever
  sessionStartTime: number
  now:             number                     // injected — never Date.now() inside engine
}

export interface EngineOutput {
  // LLM response
  content:       string
  audioBase64:   string | null

  // Score for this turn
  score:         ReturnType<typeof computeAggregateScore> | null

  // Updated state patches (immutable — caller merges)
  statePatch:          Partial<SessionState>
  weaknessPatch:       WeaknessTrackerState
  growthPatch:         GrowthTrackerState

  // Session lifecycle
  isEndOfSession:  boolean
  phaseChanged:    boolean

  // Snapshot (built after session ends — null during active session)
  snapshot:        SessionSnapshot | null

  // Diagnostics
  promptCharCount: number
  truncated:       boolean
}

// ─── Time Limits ──────────────────────────────────────────────────────────────

const TIME_LIMITS: Record<string, number> = {
  free:   15 * 60,
  go:     15 * 60,
  pro:    30 * 60,
  expert: 45 * 60,
}

// ─── Main Engine Function ─────────────────────────────────────────────────────

export async function runEngine(input: EngineInput): Promise<EngineOutput> {
  const {
    config,
    messages,
    state,
    weaknessState,
    growthState,
    previousSnapshot,
    sessionStartTime,
    now,
  } = input

  const elapsedSeconds = (now - sessionStartTime) / 1000
  const totalSeconds   = TIME_LIMITS[config.plan] ?? TIME_LIMITS.free
  const elapsedMinutes = elapsedSeconds / 60
  const totalMinutes   = totalSeconds   / 60

  // ── 1. Session end check ────────────────────────────────────────────────────

  if (elapsedSeconds >= totalSeconds || isSessionComplete(state)) {
    return buildEndOfSessionOutput(
      input,
      elapsedMinutes,
      totalMinutes,
      now
    )
  }

  // ── 2. Phase advancement ────────────────────────────────────────────────────

  const { phase: newPhase, changed: phaseChanged } = advancePhase(
    state.phase,
    messages.length,
    elapsedMinutes
  )

  const stateWithPhase: SessionState = phaseChanged
    ? { ...state, phase: newPhase }
    : state

  // ── 3. Behavior pipeline ────────────────────────────────────────────────────
  // phaseChanged passed explicitly — engine does not track it internally (Decision #15)

  const behaviorContext: BehaviorContext = {
    runtime: {
      messages,
      currentPhase:   stateWithPhase.phase,
      elapsedMinutes,
      now,
    },
    historical: {
      contradictionCount:    stateWithPhase.contradictionCount,
      lastSilenceRisk:       stateWithPhase.silenceRisk,
      weakCompetencyTopics:  stateWithPhase.weakCompetencyTopics ?? [],
      existingInsights:      stateWithPhase.behaviorInsights     ?? [],
      existingPatterns:      stateWithPhase.behaviorPatterns     ?? [],
    },
    pressure: {
      silenceRisk:                 stateWithPhase.silenceRisk,
      pressureLevel:               stateWithPhase.pressureLevel,
      pressureEscalationTriggered: stateWithPhase.pressureEscalationTriggered ?? false,
    },
  }

  const behaviorResult = await orchestrateBehavior(
    behaviorContext,
    phaseChanged
  )

  // ── 4. State updates (patches — no mutation) ────────────────────────────────

  const updatedTopics       = updateTopicMemory(stateWithPhase.topicMemory, messages, now)
  const updatedCompetencies = updateCompetencyTracker(stateWithPhase.competencyTracker, behaviorResult, config)
  const updatedContradictions = updateContradictionTracker(
    stateWithPhase.contradictionCount,
    behaviorResult.validatedSignals
  )

  const statePatch: Partial<SessionState> = {
    phase:                   newPhase,
    pressureLevel:           behaviorResult.activeRisks.length > 0
                               ? Math.min(10, stateWithPhase.pressureLevel + 1)
                               : Math.max(0, stateWithPhase.pressureLevel - 1),
    silenceRisk:             deriveSilenceRisk(behaviorResult.activeRisks),
    contradictionCount:      updatedContradictions,
    topicMemory:             updatedTopics,
    competencyTracker:       updatedCompetencies,
    behaviorInsights:        behaviorResult.insights,
    behaviorPatterns:        behaviorResult.patterns,
    pressureEscalationTriggered: behaviorResult.activeRisks.some(
      r => r.type === 'silence_risk' || r.type === 'dropout_risk'
    ),
    weakCompetencyTopics:    updatedCompetencies.weakTopics ?? [],
  }

  // ── 5. Score ────────────────────────────────────────────────────────────────

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
  const score = lastUserMessage
    ? computeAggregateScore(lastUserMessage.content, behaviorResult, stateWithPhase)
    : null

  // ── 6. Prompt assembly ──────────────────────────────────────────────────────

  const activeWeaknesses = weaknessState.weaknesses.filter(
    w => w.status === 'active' || w.status === 'improving'
  )
  const confirmedGrowth = growthState.growthSignals.filter(
    g => g.strength !== 'emerging' && g.status === 'active'
  )

  const isFirstMessage = messages.length === 0

  const built = buildPrompt(
    {
      config,
      state:          { ...stateWithPhase, ...statePatch } as SessionState,
      weaknesses:     activeWeaknesses,
      growthSignals:  confirmedGrowth,
      elapsedMinutes,
      totalMinutes,
      isFirstSession: previousSnapshot === null,
    },
    isFirstMessage
  )

  // ── 7. LLM call ─────────────────────────────────────────────────────────────

  // If there's an opening message, inject it as the assistant's first turn
  const messagesForLLM: Message[] = built.openingMessage
    ? [{ role: 'assistant', content: built.openingMessage }]
    : messages

  const content = await callClaude({
    systemPrompt: built.systemPrompt,
    messages:     messagesForLLM,
  })

  // ── 8. TTS ──────────────────────────────────────────────────────────────────

  let audioBase64: string | null = null
  try {
    audioBase64 = await synthesizeSpeech(content)
  } catch {
    // TTS failure is non-fatal — interview continues without audio
    audioBase64 = null
  }

  // ── 9. Longitudinal updates ─────────────────────────────────────────────────
  // Only update if we have a previous session to delta against
  // First-session longitudinal state stays empty until session ends

  const sessionId        = stateWithPhase.sessionId
  let weaknessPatch      = weaknessState
  let growthPatch        = growthState

  // Lightweight per-turn longitudinal update (full delta computed at session end)
  // This keeps trackers warm without requiring a full snapshot
  if (previousSnapshot !== null && score !== null) {
    const miniDelta = buildMiniDelta(score, behaviorResult.patterns, sessionId, now)
    weaknessPatch = updateWeaknessTracker(weaknessState, miniDelta, sessionId, now)
    growthPatch   = updateGrowthTracker(growthState,   miniDelta, sessionId, now)
  }

  return {
    content,
    audioBase64,
    score,
    statePatch,
    weaknessPatch,
    growthPatch,
    isEndOfSession:  false,
    phaseChanged,
    snapshot:        null,
    promptCharCount: built.charCount,
    truncated:       built.truncated,
  }
}

// ─── End of Session ───────────────────────────────────────────────────────────

async function buildEndOfSessionOutput(
  input:          EngineInput,
  elapsedMinutes: number,
  totalMinutes:   number,
  now:            number
): Promise<EngineOutput> {
  const { config, state, weaknessState, growthState, previousSnapshot, messages } = input

  // Build closing message
  const closingContent = buildClosingMessage(config.candidateName)

  // TTS for closing
  let audioBase64: string | null = null
  try {
    audioBase64 = await synthesizeSpeech(closingContent)
  } catch {
    audioBase64 = null
  }

  // Build full session snapshot
  const snapshot = buildSessionSnapshot(state, config, messages, now)

  // Full delta + longitudinal updates at session end
  const delta        = computeSessionDelta(snapshot, previousSnapshot, now)
  const weaknessPatch = updateWeaknessTracker(weaknessState, delta, state.sessionId, now)
  const growthPatch   = updateGrowthTracker(growthState,   delta, state.sessionId, now)

  return {
    content:        closingContent,
    audioBase64,
    score:          null,
    statePatch:     { phase: 'closing' },
    weaknessPatch,
    growthPatch,
    isEndOfSession: true,
    phaseChanged:   false,
    snapshot,
    promptCharCount: 0,
    truncated:       false,
  }
}

function buildClosingMessage(candidateName: string): string {
  return `That concludes our interview, ${candidateName}. Thank you for your time today. You'll receive a full assessment shortly — I'd encourage you to review it carefully.`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveSilenceRisk(
  activeRisks: Array<{ type: string }>
): 'low' | 'medium' | 'high' {
  const hasSilence = activeRisks.some(r => r.type === 'silence_risk')
  const hasDropout = activeRisks.some(r => r.type === 'dropout_risk')
  if (hasSilence && hasDropout) return 'high'
  if (hasSilence || hasDropout) return 'medium'
  return 'low'
}

/**
 * buildMiniDelta
 * Lightweight delta for per-turn longitudinal updates.
 * Full delta is computed at session end — this keeps trackers warm mid-session.
 * Returns a minimal SessionDelta with only the fields relevant to per-turn tracking.
 */
function buildMiniDelta(
  score:          ReturnType<typeof computeAggregateScore>,
  patterns:       Array<{ canonicalKey: string; canonicalType: string; polarity: 'positive' | 'negative'; occurrences: number; occurrenceCount: number }>,
  sessionId:      string,
  now:            number
): import('./longitudinal/session-delta').SessionDelta {
  return {
    sessionId,
    previousSessionId:         null,
    computedAt:                now,
    overallScoreDelta:         0,
    weightedScoreDelta:        0,
    scoreDimensions:           [],
    behaviorsImproved:         [],
    behaviorsDeclined:         patterns
      .filter(p => p.polarity === 'negative' && p.occurrences > 1)
      .map(p => ({
        canonicalKey:  p.canonicalKey,
        canonicalType: p.canonicalType,
        polarity:      'negative' as const,
        direction:     'declined' as const,
        previousCount: p.occurrences - 1,
        currentCount:  p.occurrences,
      })),
    behaviorsNew:              patterns
      .filter(p => p.occurrences === 1)
      .map(p => ({
        canonicalKey:  p.canonicalKey,
        canonicalType: p.canonicalType,
        polarity:      p.polarity,
        direction:     'new' as const,
        previousCount: 0,
        currentCount:  1,
      })),
    behaviorsDropped:          [],
    newCompetenciesCovered:    [],
    competenciesStillMissing:  [],
    contradictionsThisSession: 0,
    contradictionsDelta:       0,
    phasesCompleted:           [],
    phasesSkipped:             [],
    overallTrend:              'stable',
    significantChange:         false,
  }
}
