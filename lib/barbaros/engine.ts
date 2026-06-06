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
//
// DIRECTOR INTEGRATION:
//   After state patches and before prompt assembly, the Director decides the
//   single tactical move for the next turn (decide-next-move.ts) and the prompt
//   builder is instructed to EXECUTE it. The intervention budget is carried on
//   state loosely (mirroring the existing pressure/behavior carry pattern) so it
//   decrements across turns; a typed SessionState field can replace this later.
//
// FIRST-TURN FIX (root cause of black screen / no greeting):
//   On the first message the opening greeting is a STATIC template
//   (BARBAROS_OPENING_TEMPLATE). Previously it was injected as the first
//   `assistant` message and passed to Claude. The Anthropic API REJECTS any
//   conversation whose first message has role 'assistant' (400 error), which
//   threw after 3 retries → route returned { success:false } → blank screen.
//   FIX: on the first turn we return the opening template DIRECTLY as content
//   (with its TTS audio) and DO NOT call Claude at all. Claude takes over from
//   the second turn onward, when the first message is a real 'user' turn.
//
// TYPE-SAFETY FIX:
//   Behavior/pressure fields (contradictionCount, silenceRisk, pressureLevel,
//   behaviorInsights, behaviorPatterns, weakCompetencyTopics,
//   pressureEscalationTriggered) are NOT part of SessionState (see types.ts).
//   They are derived per-turn and kept in engine-local variables.
//   They are NO LONGER written into statePatch (which is Partial<SessionState>).
//   Persisted equivalents that DO exist on state:
//     - contradiction count  → metrics.contradictionCount
//     - contradictions array  → contradictions
//
// END-OF-SESSION HARDENING:
//   buildSessionSnapshot → toScoreSnapshot dereferences
//   scoreBreakdown.dimensions.engagement, but this end path passes an EMPTY
//   scoreBreakdown stub ({}), which threw "Cannot read properties of undefined
//   (reading 'engagement')" and 500'd the session close. The snapshot +
//   longitudinal work is NOT launch-critical, so it is now isolated in a guard:
//   on any failure the session closes gracefully (snapshot=null, trackers
//   unchanged). The proper fix is to feed a REAL score breakdown here — that is
//   the "connect engine data to the report" item, handled separately.

import type { InterviewConfig, Message, CandidateProfile }  from './types'
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
  getUnaddressedContradictions,
}                                            from './state/contradiction-tracker'

import { orchestrateBehavior }               from './analysis/behavior/behavior-orchestrator'
import type { OrchestratorSessionState }     from './analysis/behavior/behavior-orchestrator'
import type { BehaviorContext }              from './analysis/behavior/behavior-types'

import { aggregateScores }                   from './scoring/score-aggregator'
import { normalizeScores }                   from './scoring/score-normalizer'
import type { RawScoreInput }                from './scoring/score-normalizer'
import { buildSessionSnapshot }              from './artifacts/session-snapshot'

import { updateWeaknessTracker }             from './longitudinal/weakness-tracker'
import { updateGrowthTracker }               from './longitudinal/growth-tracker'
import { computeSessionDelta }               from './longitudinal/session-delta'

import { decideNextMove, createInterventionBudget } from './director'
import type { DirectorContext, InterventionBudget }  from './director'

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

// Neutral fallback profile if state has no candidateProfile yet.
const NEUTRAL_CANDIDATE_PROFILE = {
  strengths:       [] as string[],
  weaknesses:      [] as string[],
  confidenceLevel: 50,
  ownershipScore:  50,
  clarity:         50,
  depth:           50,
  consistency:     50,
  engagement:      50,
  lastUpdatedAt:   0,
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

  // ── 1b. FIRST-TURN SHORT-CIRCUIT (black-screen fix) ─────────────────────────
  // On the very first message there is no candidate input yet. The greeting is
  // a static template — we return it DIRECTLY (with audio) and skip Claude
  // entirely. This avoids sending an `assistant`-first message array to the
  // Anthropic API, which would 400 and throw. Claude takes over from turn 2.
  const isFirstMessage = messages.length === 0

  if (isFirstMessage) {
    const built = buildPrompt(
      {
        config,
        state,
        weaknesses:     [],
        growthSignals:  [],
        elapsedMinutes,
        totalMinutes,
        isFirstSession: previousSnapshot === null,
      },
      true
    )

    const openingText = built.openingMessage ?? defaultOpening(config)

    let openingAudio: string | null = null
    try {
      if (openingText.length > 0) {
        openingAudio = await synthesizeSpeech(openingText)
      }
    } catch {
      openingAudio = null
    }

    return {
      content:         openingText,
      audioBase64:     openingAudio,
      score:           null,
      statePatch:      {},          // no state changes on greeting turn
      weaknessPatch:   weaknessState,
      growthPatch:     growthState,
      isEndOfSession:  false,
      phaseChanged:    false,
      snapshot:        null,
      promptCharCount: built.charCount,
      truncated:       built.truncated,
    }
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

  // ── 2b. Engine-local behavior/pressure carry-over ───────────────────────────
  // These fields are NOT persisted on SessionState. We read any prior values
  // from a loosely-typed view of state (for resume support) and default safely.
  const carry = stateWithPhase as unknown as {
    silenceRisk?:                 'low' | 'medium' | 'high'
    pressureLevel?:               number
    pressureEscalationTriggered?: boolean
    behaviorInsights?:            unknown[]
    behaviorPatterns?:            unknown[]
    weakCompetencyTopics?:        string[]
  }

  const priorContradictionCount = stateWithPhase.metrics.contradictionCount ?? 0
  const priorSilenceRisk        = carry.silenceRisk           ?? 'low'
  const priorPressureLevel      = carry.pressureLevel         ?? 0
  const priorWeakTopics         = carry.weakCompetencyTopics  ?? []
  const priorInsights           = carry.behaviorInsights      ?? []
  const priorPatterns           = carry.behaviorPatterns      ?? []

  // Director budget — carried loosely on state; initialized per plan on turn 1.
  const priorBudget: InterventionBudget =
    ((stateWithPhase as any).directorBudget as InterventionBudget | undefined)
    ?? createInterventionBudget(config.plan)

  // ── 3. Behavior pipeline ────────────────────────────────────────────────────

  const behaviorContext = {
    runtime: {
      messages,
      currentPhase:   stateWithPhase.phase,
      elapsedMinutes,
      now,
    },
    historical: {
      contradictionCount:    priorContradictionCount,
      lastSilenceRisk:       priorSilenceRisk,
      weakCompetencyTopics:  priorWeakTopics,
      existingInsights:      priorInsights,
      existingPatterns:      priorPatterns,
    },
    pressure: {
      silenceRisk:                 priorSilenceRisk,
      pressureLevel:               priorPressureLevel,
      pressureEscalationTriggered: carry.pressureEscalationTriggered ?? false,
    },
  } as unknown as BehaviorContext

  // orchestrateBehavior expects an OrchestratorSessionState as 2nd arg
  // (NOT a boolean). Build it from prior engine-local values.
  const orchestratorState: OrchestratorSessionState = {
    validatedSignals: [],
    insights:        (priorInsights as any[]) ?? [],
    patterns:        (priorPatterns as any[]) ?? [],
    pendingTasks:    [],
    lastTier3RunAt:  null,
  }

  // GUARD: the behavior pipeline scans the LAST message. With the first-turn
  // short-circuit above, messages is always non-empty here, but we keep the
  // guard as defense-in-depth.
  let behaviorResult: any = {
    activeRisks: [],
    validatedSignals: [],
    insights: [],
    patterns: [],
    pendingTasks: [],
  }
  if (messages.length > 0) {
    behaviorResult = await orchestrateBehavior(behaviorContext, orchestratorState)
  }

  const activeRisks: Array<{ type: string }> =
    Array.isArray((behaviorResult as any).activeRisks)
      ? (behaviorResult as any).activeRisks
      : []

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

  // statePatch contains ONLY real SessionState fields.
  const statePatch: Partial<SessionState> = {
    phase:              newPhase,
    contradictions:     updatedContradictions,
    recentTopics:       stateAfterCompetency.recentTopics,
    competencyCoverage: stateAfterCompetency.competencyCoverage,
    metrics: {
      ...stateWithPhase.metrics,
      contradictionCount: updatedContradictions.length,
    },
  }

  // ── 5. Score + candidate profile (REVIVED) ──────────────────────────────────
  // Previously this waited for `behaviorResult.scoreSet`, which is NEVER
  // produced — so `score` was always null and `candidateProfile` stayed frozen
  // at its initial 50s. We now build a NormalizedScoreSet directly from the
  // LIVE behavior signals + competency coverage + contradictions (this is what
  // score-normalizer is designed to consume — no LLM RawScore needed), then
  // aggregate it, then derive the candidate profile from the dimensions.
  //
  // EMPTY-SCORE GUARD: normalizeScores starts from baseline floors (e.g. depth
  // 50) and would emit a "score" even with no real evidence. To avoid mistaking
  // those floors for live data, we only compute/apply when at least one CONFIRMED
  // behavior signal (or a confirmed insight) exists. On signal-less turns we
  // leave `score` null and DO NOT touch candidateProfile.
  let score: ReturnType<typeof aggregateScores> | null = null

  const confirmedSignals: any[] = Array.isArray((behaviorResult as any).validatedSignals)
    ? (behaviorResult as any).validatedSignals.filter((s: any) => s?.confirmed)
    : []
  const insightCount: number = Array.isArray((behaviorResult as any).insights)
    ? (behaviorResult as any).insights.length
    : 0
  const hasLiveSignal = confirmedSignals.length > 0 || insightCount > 0

  if (lastUserMsg && hasLiveSignal) {
    try {
      const rawScoreInput = buildRawScoreInput(
        behaviorResult,
        stateAfterCompetency.competencyCoverage,
        updatedContradictions,
        messages,
        elapsedMinutes,
        now
      )
      const scoreSet = normalizeScores(rawScoreInput)
      score = aggregateScores(scoreSet, now)

      // Derive the LIVE candidate profile from the normalized dimensions.
      // Direct matches: clarity, depth, engagement.
      // TODO: confidenceLevel ← credibility is an approximation.
      // credibility = source consistency; confidence = user self-certainty.
      // Replace when a real signal is available.
      // ownershipScore + consistency have NO source in the normalizer yet —
      // left at their existing values (known gap, not guessed).
      const baseProfile: CandidateProfile =
        stateWithPhase.candidateProfile ?? NEUTRAL_CANDIDATE_PROFILE
      statePatch.candidateProfile = {
        ...baseProfile,
        clarity:         scoreSet.dimensions.clarity.score,
        depth:           scoreSet.dimensions.depth.score,
        engagement:      scoreSet.dimensions.engagement.score,
        confidenceLevel: scoreSet.dimensions.credibility.score,
        lastUpdatedAt:   now,
      }

      // TEMP DIAGNOSTIC — remove after Phase 2 verification. Prints the live
      // profile each turn to Vercel function logs. Does not affect any logic
      // or output; read in Vercel → Logs, NOT the browser console.
      console.log('[barbaros:profile]', JSON.stringify({
        turn:             messages.filter(m => m.role === 'user').length,
        confirmedSignals: confirmedSignals.length,
        insightCount,
        depth:            statePatch.candidateProfile?.depth,
        clarity:          statePatch.candidateProfile?.clarity,
        engagement:       statePatch.candidateProfile?.engagement,
        confidenceLevel:  statePatch.candidateProfile?.confidenceLevel,
      }))
    } catch (err) {
      // Scoring is a secondary feature — never let it break the interview.
      score = null
      console.error('[barbaros:profile] scoring failed — skipped this turn:', err)
    }
  } else if (lastUserMsg) {
    // TEMP DIAGNOSTIC — remove after Phase 2 verification. Makes a signal-less
    // turn explicit, so a frozen profile is never ambiguous in the logs.
    console.log('[barbaros:profile] skipped — no confirmed signals this turn', JSON.stringify({
      turn:             messages.filter(m => m.role === 'user').length,
      confirmedSignals: confirmedSignals.length,
      insightCount,
    }))
  }

  // ── 5b. Director — tactical decision (what should Barbaros DO next?) ─────────
  // Reads the decision-relevant slice of the just-patched state and picks ONE
  // move. Pure & budgeted. The decision is handed to the prompt builder, which
  // instructs the LLM to EXECUTE it rather than choose its own direction.

  const missingCompetencies = Object.entries(stateAfterCompetency.competencyCoverage)
    .filter(([, cov]) => (cov as { coverage: number }).coverage < 50)
    .map(([key]) => key)

  const answerSignals = lastUserMsg
    ? quickAnswerSignals(lastUserMsg.content)
    : { vagueness: 'low' as const, hasExamples: true }

  const directorContext: DirectorContext = {
    phase:                     newPhase,
    plan:                      config.plan,
    unaddressedContradictions: getUnaddressedContradictions(updatedContradictions),
    recentTopics:              stateAfterCompetency.recentTopics,
    competencyCoverage:        stateAfterCompetency.competencyCoverage,
    missingCompetencies,
    candidateProfile:
      (((stateWithPhase as any).candidateProfile ?? NEUTRAL_CANDIDATE_PROFILE) as DirectorContext['candidateProfile']),
    lastAnswerVagueness:       answerSignals.vagueness,
    lastAnswerHasExamples:     answerSignals.hasExamples,
    elapsedMinutes,
    totalMinutes,
    budget:                    priorBudget,
    now,
  }

  const directorDecision = decideNextMove(directorContext)

  // Persist the updated budget so the next turn sees decremented counters.
  ;(statePatch as Record<string, unknown>).directorBudget = directorDecision.budgetAfter

  // If we're returning to a contradiction, pre-mark it addressed so the Director
  // does not re-select the same one next turn.
  if (directorDecision.intent === 'RETURN_TO_PREVIOUS' && directorDecision.targetRef) {
    statePatch.contradictions = applyContradictionPatch(updatedContradictions, {
      markAddressed: [directorDecision.targetRef],
    })
  }

  // ── 6. Prompt assembly ──────────────────────────────────────────────────────

  const activeWeaknesses = weaknessState.weaknesses.filter(
    w => w.status === 'active' || w.status === 'improving'
  )
  const confirmedGrowth = growthState.growthSignals.filter(
    g => g.strength !== 'emerging' && g.status === 'active'
  )

  const built = buildPrompt(
    {
      config,
      state:          { ...stateWithPhase, ...statePatch } as SessionState,
      weaknesses:     activeWeaknesses,
      growthSignals:  confirmedGrowth,
      elapsedMinutes,
      totalMinutes,
      isFirstSession: previousSnapshot === null,
      directorDecision,
    },
    false   // not first message — opening already delivered on turn 1
  )

  // ── 7. LLM call ─────────────────────────────────────────────────────────────
  // messages is non-empty and starts with a real 'user' turn, so the Anthropic
  // API accepts it. No opening injection here — it was delivered on turn 1.

  const content = await callClaude({
    systemPrompt: built.systemPrompt,
    messages,
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
    const patternsForDelta = Array.isArray((behaviorResult as any).patterns)
      ? (behaviorResult as any).patterns
      : []
    const miniDelta = buildMiniDelta(patternsForDelta, sessionId, now)
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

  // buildSessionSnapshot takes a single SessionSnapshotInput object.
  // Several nested fields (scoreBreakdown, behaviorResult, contradictionSummary)
  // are not computed on this end path; we pass minimal stubs cast to satisfy
  // the type. The end-of-session snapshot only feeds longitudinal trackers,
  // which are not on the launch-critical path.
  const snapshotInput = {
    sessionId:        (state as any).sessionId ?? 'unknown',
    candidateId:      (state as any).sessionId ?? 'unknown',
    jobTitle:         config.jobTitle,
    institution:      config.institution,
    language:         config.language,
    completedPhases:  [] as any[],
    durationMinutes:  elapsedMinutes,
    totalMessages:    messages.length,
    scoreBreakdown:   {} as any,
    behaviorResult:   { validatedSignals: [], insights: [], patterns: [], activeRisks: [] } as any,
    competencies:     state.competencyCoverage,
    contradictionSummary: { total: 0 } as any,
    phaseSummaries:   [] as any[],
    now,
  } as unknown as Parameters<typeof buildSessionSnapshot>[0]

  // HARDENING: the snapshot stub above passes an EMPTY scoreBreakdown ({}), and
  // buildSessionSnapshot → toScoreSnapshot dereferences
  // scoreBreakdown.dimensions.engagement → throws "reading 'engagement'" and
  // 500's the session close. The snapshot + longitudinal work is NOT
  // launch-critical, so we isolate it: on ANY failure we close the session
  // gracefully (snapshot=null, trackers unchanged). The proper fix is to feed a
  // real score breakdown here — the "connect engine data to the report" item.
  let snapshot: SessionSnapshot | null = null
  let weaknessPatch = weaknessState
  let growthPatch   = growthState
  try {
    snapshot        = buildSessionSnapshot(snapshotInput)
    const delta     = computeSessionDelta(snapshot, previousSnapshot, now)
    const sessionId = (state as any).sessionId ?? 'unknown'
    weaknessPatch   = updateWeaknessTracker(weaknessState, delta, sessionId, now)
    growthPatch     = updateGrowthTracker(growthState,     delta, sessionId, now)
  } catch (err) {
    console.error('[barbaros:endSession] snapshot/longitudinal failed — closing gracefully:', err)
    snapshot      = null
    weaknessPatch = weaknessState
    growthPatch   = growthState
  }

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

// Fallback opening if buildPrompt returns no openingMessage for any reason.
function defaultOpening(config: InterviewConfig): string {
  return `Hello ${config.candidateName}, I'm Barbaros. We're here today for the ${config.jobTitle} position at ${config.institution}. Are you ready to begin?`
}

// Builds the RawScoreInput consumed by normalizeScores from live engine state.
// Pure: same inputs → same output. Extracted from section 5 for readability and
// isolated testability (keeps runEngine an orchestrator, not a calculator).
function buildRawScoreInput(
  behavior:       any,
  competencies:   SessionState['competencyCoverage'],
  contradictions: Array<{ severity: 'minor' | 'moderate' | 'major' }>,
  messages:       Message[],
  elapsedMinutes: number,
  now:            number
): RawScoreInput {
  const majorContradictions    = contradictions.filter(c => c.severity === 'major').length
  const moderateContradictions = contradictions.filter(c => c.severity === 'moderate').length
  const totalUserMessages      = messages.filter(m => m.role === 'user').length

  return {
    behavior,
    competencies,
    contradictionCount: contradictions.length,
    majorContradictions,
    moderateContradictions,
    totalUserMessages,
    elapsedMinutes,
    now,
  }
}

// Lightweight per-answer signals for the Director, derived from the candidate's
// last message. STOPGAP: replace with real BehaviorSignals (vagueness,
// hasExamples) from the behavior pipeline when those are surfaced per turn.
function quickAnswerSignals(
  text: string
): { vagueness: 'low' | 'medium' | 'high'; hasExamples: boolean } {
  const t = text.trim()
  const words = t.split(/\s+/).filter(Boolean).length
  const hasExamples =
    /\b(for example|for instance|e\.g\.|such as|specifically|one time|once|when i|at my|last year|this year|in \d{4})\b/i.test(t) ||
    /\d/.test(t)

  let vagueness: 'low' | 'medium' | 'high' = 'low'
  if (!hasExamples && words < 25) vagueness = 'high'
  else if (!hasExamples && words < 60) vagueness = 'medium'

  return { vagueness, hasExamples }
}

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
