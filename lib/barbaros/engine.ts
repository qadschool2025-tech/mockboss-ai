// lib/barbaros/engine.ts
// Barbaros V4 — Main Orchestrator.
// Consumed by: app/api/interview/route.ts (single import point)
//
// FIXES APPLIED:
// - updateTopicMemory          → recordTopicsFromText       (topic-memory.ts)
// - updateCompetencyTracker    → matchCompetenciesInText
//                                + applyEvidenceDelta       (competency-tracker.ts)
// - updateContradictionTracker → detectContradictions
//                                + applyContradictionPatch  (contradiction-tracker.ts)
// - computeAggregateScore      → aggregateScores            (score-aggregator.ts)

import type { InterviewConfig, Message }  from './types'
import type { SessionState }              from './state/session-state'
import type { WeaknessTrackerState }      from './longitudinal/weakness-tracker'
import type { GrowthTrackerState }        from './longitudinal/growth-tracker'
import type { SessionSnapshot }           from './artifacts/session-snapshot'
import type { SessionDelta }              from './longitudinal/session-delta'

import { advancePhase, isSessionComplete }   from './state/phase-engine'
import { recordTopicsFromText }              from './state/topic-memory'
import {
  matchCompetenciesInText,
  applyEvidenceDelta,
}                                            from './state/competency-tracker'
import {
  detectContradictions,
  applyContradictionPatch,
}                                            from './state/contradiction-tracker'

import { orchestrateBehavior }               from './analysis/behavior/behavior-orchestrator'
import type { BehaviorContext }              from './analysis/behavior/behavior-types'

import { aggregateScores }                   from './scoring/score-aggregator'
import { buildSessionSnapshot }              from './artifacts/session-snapshot'

import { updateWeaknessTracker }             from './longitudinal/weakness-tracker'
import { updateGrowthTracker }               from './longitudinal/growth-tracker'
import { computeSessionDelta }               from './longitudinal/session-delta'

import { buildPrompt }                       from './prompt/prompt-builder'
import { BARBAROS_CLOSING_TEMPLATE }         from './prompt/personality'
import { callClaude }                        from './llm/claude-client'
import { synthesizeSpeech }                  from './llm/tts'

// ─── Engine Input / Output ────────────────────────────────────────────────────

export interface EngineInput {
  config:           InterviewConfig
  messages:         Message[]
  state:            SessionState
  weaknessState:    WeaknessTrackerState
  growthState:      GrowthTrackerState
  previousSnapshot: SessionSnapshot | null
  sessionStartTime: number
  now:              number
}

export interface EngineOutput {
  content:         string
  audioBase64:     string | null
  score:           ReturnType<typeof aggregateScores> | null
  statePatch:      Partial<SessionState>
  weaknessPatch:   WeaknessTrackerState
  growthPatch:     GrowthTrackerState
  isEndOfSession:  boolean
  phaseChanged:    boolean
  snapshot:        SessionSnapshot | null
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

// ─── Score Tag Helper ─────────────────────────────────────────────────────────

function stripScoreTag(content: string): string {
  return content.replace(/<score>[\s\S]*?<\/score>/g, '').trim()
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
    return buildEndOfSessionOutput(input, elapsedMinutes, totalMinutes, now)
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

  const behaviorContext: BehaviorContext = {
    runtime: {
      messages,
      currentPhase:   stateWithPhase.phase,
      elapsedMinutes,
      now,
    },
    historical: {
      contradictionCount:    stateWithPhase.contradictionCount    ?? 0,
      lastSilenceRisk:       stateWithPhase.silenceRisk           ?? 'low',
      weakCompetencyTopics:  stateWithPhase.weakCompetencyTopics  ?? [],
      existingInsights:      stateWithPhase.behaviorInsights       ?? [],
      existingPatterns:      stateWithPhase.behaviorPatterns       ?? [],
    },
    pressure: {
      silenceRisk:                 stateWithPhase.silenceRisk                 ?? 'low',
      pressureLevel:               stateWithPhase.pressureLevel               ?? 0,
      pressureEscalationTriggered: stateWithPhase.pressureEscalationTriggered ?? false,
    },
  }

  const behaviorResult = await orchestrateBehavior(behaviorContext, phaseChanged)

  // ── 4. State patches ────────────────────────────────────────────────────────

  // Topic memory — record topics from the last user message
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const updatedTopics = lastUserMsg
    ? recordTopicsFromText(stateWithPhase, lastUserMsg.content, now)
    : stateWithPhase

  // Competency tracker — match and apply evidence from last user message
  let stateAfterCompetency = updatedTopics
  if (lastUserMsg) {
    const matchedCompetencies = matchCompetenciesInText(stateWithPhase, lastUserMsg.content)
    for (const competency of matchedCompetencies) {
      stateAfterCompetency = applyEvidenceDelta(
        stateAfterCompetency,
        competency,
        lastUserMsg.content,
        now
      )
    }
  }

  // Contradiction tracker — detect new contradictions from full message history
  const contradictionPatch = detectContradictions(
    {
      messages,
      currentPhase: stateWithPhase.phase,
      now,
    },
    stateWithPhase.contradictions ?? []
  )
  const updatedContradictions = applyContradictionPatch(
    stateWithPhase.contradictions ?? [],
    contradictionPatch
  )

  const statePatch: Partial<SessionState> = {
    phase:              newPhase,
    pressureLevel:      behaviorResult.activeRisks.length > 0
                          ? Math.min(10, (stateWithPhase.pressureLevel ?? 0) + 1)
                          : Math.max(0,  (stateWithPhase.pressureLevel ?? 0) - 1),
    silenceRisk:        deriveSilenceRisk(behaviorResult.activeRisks),
    contradictionCount: updatedContradictions.length,
    contradictions:     updatedContradictions,
    recentTopics:       stateAfterCompetency.recentTopics,
    competencyCoverage: stateAfterCompetency.competencyCoverage,
    behaviorInsights:   behaviorResult.insights,
    behaviorPatterns:   behaviorResult.patterns,
    pressureEscalationTriggered: behaviorResult.activeRisks.some(
      r => r.type === 'silence_risk' || r.type === 'dropout_risk'
    ),
    weakCompetencyTopics: Object.entries(stateAfterCompetency.competencyCoverage)
      .filter(([, v]) => v.coverage < 40 && v.evidenceCount > 0)
      .map(([name]) => name),
  }

  // ── 5. Score ────────────────────────────────────────────────────────────────

  // aggregateScores requires a NormalizedScoreSet — build a minimal one
  // from behavior signals if no full scoring pipeline is available
  let score: ReturnType<typeof aggregateScores> | null = null
  try {
    if (lastUserMsg && (behaviorResult as any).scoreSet) {
      score = aggregateScores((behaviorResult as any).scoreSet, now)
    }
  } catch {
    score = null
  }

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

  const messagesForLLM: Message[] = built.openingMessage
    ? [{ role: 'assistant', content: built.openingMessage, timestamp: now }, ...messages]
    : messages

  const content = await callClaude({
    systemPrompt: built.systemPrompt,
    messages:     messagesForLLM,
  })

  // ── 8. TTS ──────────────────────────────────────────────────────────────────

  let audioBase64: string | null = null
  try {
    const speechText = stripScoreTag(content)
    if (speechText.length > 0) {
      audioBase64 = await synthesizeSpeech(speechText)
    }
  } catch {
    audioBase64 = null
  }

  // ── 9. Longitudinal updates ─────────────────────────────────────────────────

  const sessionId   = (stateWithPhase as any).sessionId ?? 'unknown'
  let weaknessPatch = weaknessState
  let growthPatch   = growthState

  if (previousSnapshot !== null && score !== null) {
    const miniDelta = buildMiniDelta(
      Array.isArray(behaviorResult.patterns) ? behaviorResult.patterns : [],
      sessionId,
      now
    )
    weaknessPatch = updateWeaknessTracker(weaknessState, miniDelta, sessionId, now)
    growthPatch   = updateGrowthTracker(growthState,     miniDelta, sessionId, now)
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

  const closingContent = BARBAROS_CLOSING_TEMPLATE
    .replace('{candidateName}', config.candidateName)

  let audioBase64: string | null = null
  try {
    audioBase64 = await synthesizeSpeech(closingContent)
  } catch {
    audioBase64 = null
  }

  const snapshot = buildSessionSnapshot(state, config, messages, now)

  const delta         = computeSessionDelta(snapshot, previousSnapshot, now)
  const sessionId     = (state as any).sessionId ?? 'unknown'
  const weaknessPatch = updateWeaknessTracker(weaknessState, delta, sessionId, now)
  const growthPatch   = updateGrowthTracker(growthState,     delta, sessionId, now)

  return {
    content:         closingContent,
    audioBase64,
    score:           null,
    statePatch:      { phase: 'closing' } as Partial<SessionState>,
    weaknessPatch,
    growthPatch,
    isEndOfSession:  true,
    phaseChanged:    false,
    snapshot,
    promptCharCount: 0,
    truncated:       false,
  }
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

function buildMiniDelta(
  patterns:  Array<{ canonicalKey: string; canonicalType: string; polarity: 'positive' | 'negative'; occurrences: number }>,
  sessionId: string,
  now:       number
): SessionDelta {
  return {
    sessionId,
    previousSessionId:        null,
    computedAt:               now,
    overallScoreDelta:        0,
    weightedScoreDelta:       0,
    scoreDimensions:          [],
    behaviorsImproved: patterns
      .filter(p => p.polarity === 'positive' && p.occurrences > 1)
      .map(p => ({
        canonicalKey:  p.canonicalKey,
        canonicalType: p.canonicalType,
        polarity:      'positive' as const,
        direction:     'improved' as const,
        previousCount: p.occurrences - 1,
        currentCount:  p.occurrences,
      })),
    behaviorsDeclined: patterns
      .filter(p => p.polarity === 'negative' && p.occurrences > 1)
      .map(p => ({
        canonicalKey:  p.canonicalKey,
        canonicalType: p.canonicalType,
        polarity:      'negative' as const,
        direction:     'declined' as const,
        previousCount: p.occurrences - 1,
        currentCount:  p.occurrences,
      })),
    behaviorsNew: patterns
      .filter(p => p.occurrences === 1)
      .map(p => ({
        canonicalKey:  p.canonicalKey,
        canonicalType: p.canonicalType,
        polarity:      p.polarity,
        direction:     'new' as const,
        previousCount: 0,
        currentCount:  1,
      })),
    behaviorsDropped:         [],
    newCompetenciesCovered:   [],
    competenciesStillMissing: [],
    contradictionsThisSession: 0,
    contradictionsDelta:       0,
    phasesCompleted:           [],
    phasesSkipped:             [],
    overallTrend:              'stable',
    significantChange:         false,
  }
}
