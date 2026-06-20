// lib/barbaros/engine.ts
// Barbaros V4, Main Orchestrator.
// Consumed by: app/api/interview/route.ts, single import point.

import type {
  InterviewConfig,
  Message,
  CandidateProfile,
  SessionPauseReason,
  SourceConsistencyIssue,
  PendingSourceConsistency,
} from './types'
import type { SessionState } from './state/session-state'
import type { WeaknessTrackerState } from './longitudinal/weakness-tracker'
import type { GrowthTrackerState } from './longitudinal/growth-tracker'
import type { SessionSnapshot } from './artifacts/session-snapshot'
import type { SessionDelta } from './longitudinal/session-delta'

import { evaluatePhaseTransition, isSessionComplete } from './state/phase-engine'
import { recordTopicsFromText } from './state/topic-memory'
import {
  matchCompetenciesInText,
  applyEvidenceDelta,
} from './state/competency-tracker'
import {
  detectContradictions,
  detectContradictionsSemantic,
  applyContradictionPatch,
  getUnaddressedContradictions,
} from './state/contradiction-tracker'
import type { SemanticModelCall } from './state/contradiction-tracker'
import { detectSourceConsistencyIssues } from './state/source-consistency'
import {
  assessmentExclusion,
  buildSourceConsistencyContextMessages,
  buildVerificationQuestion,
  decideSourceConsistencyGate,
  MAX_SOURCE_CONSISTENCY_PROMPTS,
  selectNextSourceConsistencyIssue,
  shouldConductBlockVerification,
} from './state/source-consistency-probe'
import { isReadinessAffirmation } from './state/readiness'

import { orchestrateBehavior } from './analysis/behavior/behavior-orchestrator'
import type { OrchestratorSessionState } from './analysis/behavior/behavior-orchestrator'
import type { BehaviorContext } from './analysis/behavior/behavior-types'

import { aggregateScores } from './scoring/score-aggregator'
import { normalizeScores } from './scoring/score-normalizer'
import type { RawScoreInput } from './scoring/score-normalizer'
import {
  resolveCoveredAreas,
  type EssentialAxis,
} from './scoring/coverage-resolver'
import { buildSessionSnapshot } from './artifacts/session-snapshot'

import { updateWeaknessTracker } from './longitudinal/weakness-tracker'
import { updateGrowthTracker } from './longitudinal/growth-tracker'
import { computeSessionDelta } from './longitudinal/session-delta'

import { decideNextMove, createInterventionBudget } from './director'
import type { DirectorContext, InterventionBudget } from './director'

import { resolvePanelForConfig } from './panel/panel-roles'
import type { PanelRoleId } from './panel/panel-roles'
import {
  createPanelTurnState,
  evaluatePanelHandover,
} from './panel/panel-rotation'
import type { PanelTurnState } from './panel/panel-rotation'

import { buildPrompt } from './prompt/prompt-builder'
import {
  BARBAROS_CONDUCT_RULES,
  buildClosingMessage,
} from './prompt/personality'
import {
  buildConductResponse,
  buildResumeResponse,
  decideConduct,
  getCurrentAssessmentQuestion,
  normalizeConductState,
  parseConductSignal,
  stripConductTag,
} from './policy/conduct-policy'
import type { ConductDecision } from './policy/conduct-policy'
import { callClaude } from './llm/claude-client'
import { synthesizeSpeech } from './llm/tts'

// Engine Input / Output

export interface EngineInput {
  config:           InterviewConfig
  messages:         Message[]
  state:            SessionState
  weaknessState:    WeaknessTrackerState
  growthState:      GrowthTrackerState
  previousSnapshot: SessionSnapshot | null
  sessionStartTime: number
  now:              number
  controlAction?:   'resume'
}

export interface EngineOutput {
  content:          string
  audioBase64:      string | null
  score:            ReturnType<typeof aggregateScores> | null
  statePatch:       Partial<SessionState>
  weaknessPatch:    WeaknessTrackerState
  growthPatch:      GrowthTrackerState
  isEndOfSession:   boolean
  phaseChanged:     boolean
  snapshot:         SessionSnapshot | null
  promptCharCount:  number
  truncated:        boolean
  coveredAreas:     EssentialAxis[]
  activeRoleId?:    PanelRoleId | null
  activeRoleTitle?: string | null
  sessionPaused:    boolean
  pauseReason:      SessionPauseReason
  responseKind:     'opening' | 'interview' | 'redirect' | 'warning' | 'pause' | 'resume' | 'closing'
  excludeLastUserMessageFromAssessment: boolean
  excludeResponseFromAssessment: boolean
  remainingSeconds: number
}

// Time Limits

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

// Score Tag Helper

function stripScoreTag(content: string): string {
  return content
    .replace(/<score>[\s\S]*?<\/score>/g, '')
    .replace(/<score>[\s\S]*$/g, '')
    .replace(/<\/score>/g, '')
    .trim()
}

function clearResolvedConductTurn(
  state: SessionState['conductState']
): SessionState['conductState'] {
  return {
    ...normalizeConductState(state),
    pendingQuestion: null,
    lastViolationFingerprint: undefined,
    lastViolationAction: undefined,
    lastViolationSignal: undefined,
  }
}

// Main Engine Function

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
    controlAction,
  } = input

  const elapsedSeconds = (now - sessionStartTime) / 1000
  const totalSeconds   = TIME_LIMITS[config.plan] ?? TIME_LIMITS.free
  const elapsedMinutes = elapsedSeconds / 60
  const totalMinutes   = totalSeconds / 60
  const remainingSeconds = Math.max(0, Math.ceil(totalSeconds - elapsedSeconds))
  const assessmentMessages = messages.filter(
    message => message.assessmentEligible !== false
  )
  const stateWithConfig: SessionState = { ...state, config }

  // 1. Session end check

  if (elapsedSeconds >= totalSeconds || isSessionComplete(stateWithConfig)) {
    return buildEndOfSessionOutput(
      { ...input, messages: assessmentMessages },
      elapsedMinutes,
      totalMinutes,
      now
    )
  }

  // 1a. Control actions never enter the transcript, scoring, or evidence flow.

  if (controlAction === 'resume') {
    return buildResumeOutput(
      input,
      remainingSeconds,
      now
    )
  }

  // A paused session accepts only a control action. Any accidental user payload
  // is ignored and explicitly excluded from assessment.
  if (state.sessionPaused === true) {
    return buildPausedOutput(input, remainingSeconds)
  }

  // 1b. First-turn short-circuit

  const isFirstMessage = assessmentMessages.length === 0

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
      content:          openingText,
      audioBase64:      openingAudio,
      score:            null,
      statePatch:       {},
      weaknessPatch:    weaknessState,
      growthPatch:      growthState,
      isEndOfSession:   false,
      phaseChanged:     false,
      snapshot:         null,
      promptCharCount:  built.charCount,
      truncated:        built.truncated,
      coveredAreas:     [],
      activeRoleId:     null,
      activeRoleTitle:  null,
      sessionPaused:    false,
      pauseReason:      null,
      responseKind:     'opening',
      excludeLastUserMessageFromAssessment: false,
      excludeResponseFromAssessment: false,
      remainingSeconds,
    }
  }

  // 2. Phase advancement

  const stateForPhase: SessionState = { ...state, config }
  const transition = evaluatePhaseTransition(stateForPhase)
  const newPhase = transition.nextPhase
  const phaseChanged = transition.transitioned

  const stateWithPhase: SessionState = { ...state, config, phase: newPhase }

  // 2b. Engine-local behavior/pressure carry-over

  const carry = stateWithPhase as unknown as {
    silenceRisk?:                 'low' | 'medium' | 'high'
    pressureLevel?:               number
    pressureEscalationTriggered?: boolean
    behaviorInsights?:            unknown[]
    behaviorPatterns?:            unknown[]
    weakCompetencyTopics?:        string[]
  }

  const priorContradictionCount = stateWithPhase.metrics.contradictionCount ?? 0
  const priorSilenceRisk = carry.silenceRisk ?? 'low'
  const priorPressureLevel = carry.pressureLevel ?? 0
  const priorWeakTopics = carry.weakCompetencyTopics ?? []
  const priorInsights = carry.behaviorInsights ?? []
  const priorPatterns = carry.behaviorPatterns ?? []

  const priorBudget: InterventionBudget =
    ((stateWithPhase as any).directorBudget as InterventionBudget | undefined)
    ?? createInterventionBudget(config.plan)

  const lastUserMsg = [...assessmentMessages].reverse().find(m => m.role === 'user')

  // 2c. Opening readiness transition. On the candidate's first turn, a bare
  // readiness confirmation ("نعم مستعد", "yes", "ready") answers the opening
  // "are you ready?" prompt — it is not a real interview answer. Treat it as a
  // deterministic transition: advance to the first real question (do NOT re-ask
  // readiness, do NOT run the source-consistency gate yet, do NOT redirect on
  // conduct) and never score the confirmation.
  const isReadinessTransition =
    newPhase === 'opening' &&
    messages.filter(m => m.role === 'user').length === 1 &&
    lastUserMsg != null &&
    isReadinessAffirmation(lastUserMsg.content)

  // 3. Source consistency verification gate. Group A detection stays pure and
  // idempotent; Group B asks at most one deterministic verification question
  // before Director/Panel/behavior/scoring/main LLM. Conduct preflight runs only
  // when a source-consistency turn may happen, and reuses the same conduct rules.
  const sourceConsistencyIssuesForGate = detectSourceConsistencyIssues(
    { config, phase: stateWithPhase.phase, now },
    stateWithPhase.sourceConsistencyIssues ?? []
  )

  const sourceConsistencyPromptCount =
    stateWithPhase.sourceConsistencyPromptCount ?? 0
  const hasSourceConsistencyPromptBudget =
    sourceConsistencyPromptCount < MAX_SOURCE_CONSISTENCY_PROMPTS

  const shouldRunSourceConsistencyGate =
    !isReadinessTransition &&
    (stateWithPhase.pendingSourceConsistency != null ||
      (hasSourceConsistencyPromptBudget &&
        newPhase !== 'closing' &&
        selectNextSourceConsistencyIssue(sourceConsistencyIssuesForGate) !== null))

  if (shouldRunSourceConsistencyGate && lastUserMsg) {
    const pendingSourceConsistencyIssue = stateWithPhase.pendingSourceConsistency
      ? sourceConsistencyIssuesForGate.find(
          issue => issue.id === stateWithPhase.pendingSourceConsistency?.issueId
        ) ?? null
      : null

    const question = pendingSourceConsistencyIssue
      ? buildVerificationQuestion(
          pendingSourceConsistencyIssue.issueType ?? '',
          config.language
        )
      : getCurrentAssessmentQuestion(assessmentMessages)

    const conductPreflight = await classifySourceConsistencyConduct({
      answer: lastUserMsg.content,
      question,
      now,
    })

    if (shouldConductBlockVerification(conductPreflight.signal)) {
      const conductDecision = decideConduct(
        conductPreflight.signal,
        stateWithPhase.conductState,
        question,
        lastUserMsg.content,
        lastUserMsg.clientMessageId
      )

      return buildConductDecisionOutput({
        input,
        decision: conductDecision,
        question,
        remainingSeconds,
        promptCharCount: conductPreflight.promptCharCount,
        truncated: false,
      })
    }
  }

  const sourceConsistencyGate = shouldRunSourceConsistencyGate
    ? decideSourceConsistencyGate({
        issues: sourceConsistencyIssuesForGate,
        pending: stateWithPhase.pendingSourceConsistency ?? null,
        lastUserMsg: lastUserMsg ?? null,
        canAsk: newPhase !== 'closing',
        promptCount: sourceConsistencyPromptCount,
        now,
      })
    : null

  if (sourceConsistencyGate?.action === 'ask') {
    return buildSourceConsistencyOutput({
      input,
      issue: sourceConsistencyGate.issue,
      issues: sourceConsistencyGate.issues,
      pendingAfter: sourceConsistencyGate.pendingAfter,
      promptCountAfter: sourceConsistencyGate.promptCountAfter,
      exclusion: assessmentExclusion(sourceConsistencyGate),
      remainingSeconds,
    })
  }

  const verificationConsumedThisTurn =
    sourceConsistencyGate?.verificationConsumedThisTurn === true

  // The readiness confirmation and a consumed verification reply are both
  // non-interview answers: drop the trailing user message from evaluation so it
  // is never scored or recorded as competency evidence.
  const excludeTrailingUserFromEval =
    verificationConsumedThisTurn || isReadinessTransition

  const evaluationMessages =
    excludeTrailingUserFromEval &&
    assessmentMessages.length > 0 &&
    assessmentMessages[assessmentMessages.length - 1]?.role === 'user'
      ? assessmentMessages.slice(0, -1)
      : assessmentMessages

  // 4. Behavior pipeline

  const behaviorContext = {
    runtime: {
      messages: evaluationMessages,
      currentPhase: stateWithPhase.phase,
      elapsedMinutes,
      now,
    },
    historical: {
      contradictionCount:   priorContradictionCount,
      lastSilenceRisk:      priorSilenceRisk,
      weakCompetencyTopics: priorWeakTopics,
      existingInsights:     priorInsights,
      existingPatterns:     priorPatterns,
    },
    pressure: {
      silenceRisk:                 priorSilenceRisk,
      pressureLevel:               priorPressureLevel,
      pressureEscalationTriggered: carry.pressureEscalationTriggered ?? false,
    },
  } as unknown as BehaviorContext

  const orchestratorState: OrchestratorSessionState = {
    validatedSignals: [],
    insights:         (priorInsights as any[]) ?? [],
    patterns:         (priorPatterns as any[]) ?? [],
    pendingTasks:     [],
    lastTier3RunAt:   null,
  }

  let behaviorResult: any = {
    activeRisks:       [],
    validatedSignals: [],
    insights:         [],
    patterns:         [],
    pendingTasks:     [],
  }

  if (evaluationMessages.length > 0) {
    behaviorResult = await orchestrateBehavior(behaviorContext, orchestratorState)
  }

  const activeRisks: Array<{ type: string }> =
    Array.isArray((behaviorResult as any).activeRisks)
      ? (behaviorResult as any).activeRisks
      : []

  // 5. State patches

  // When a verification reply is consumed, the preceding real interview answer
  // remains the latest eligible user message and must still be processed once.
  const evalLastUserMsg = [...evaluationMessages]
    .reverse()
    .find(message => message.role === 'user')
  const updatedTopics = evalLastUserMsg
    ? recordTopicsFromText(stateWithPhase, evalLastUserMsg.content, now)
    : stateWithPhase

  let stateAfterCompetency = updatedTopics

  if (evalLastUserMsg) {
    const matchedCompetencies = matchCompetenciesInText(stateWithPhase, evalLastUserMsg.content)

    for (const competency of matchedCompetencies) {
      stateAfterCompetency = applyEvidenceDelta(
        stateAfterCompetency,
        competency,
        evalLastUserMsg.content,
        now
      )
    }
  }

  const contradictionPatch = detectContradictions(
    {
      messages: evaluationMessages,
      currentPhase: stateWithPhase.phase,
      now,
    },
    stateWithPhase.contradictions ?? []
  )

  let updatedContradictions = applyContradictionPatch(
    stateWithPhase.contradictions ?? [],
    contradictionPatch
  )

  const semanticJudge: SemanticModelCall = ({ system, user }) =>
    callClaude({
      systemPrompt: system,
      messages: [{ role: 'user', content: user, timestamp: now }],
    })

  try {
    const semanticPatch = await detectContradictionsSemantic(
      {
        messages: evaluationMessages,
        currentPhase: stateWithPhase.phase,
        now,
      },
      updatedContradictions,
      semanticJudge
    )

    updatedContradictions = applyContradictionPatch(updatedContradictions, semanticPatch)
  } catch (err) {
    console.error('[barbaros:contradiction] semantic detection failed, skipped:', err)
  }

  const updatedSourceConsistencyIssues =
    sourceConsistencyGate?.issues ?? sourceConsistencyIssuesForGate

  const statePatch: Partial<SessionState> = {
    phase:              newPhase,
    phaseStartedAt:     phaseChanged ? now : state.phaseStartedAt,
    phaseQuestionCount: phaseChanged ? 1 : state.phaseQuestionCount + 1,
    config,
    contradictions:     updatedContradictions,
    sourceConsistencyIssues: updatedSourceConsistencyIssues,
    pendingSourceConsistency: sourceConsistencyGate
      ? sourceConsistencyGate.pendingAfter
      : stateWithPhase.pendingSourceConsistency ?? null,
    sourceConsistencyPromptCount: sourceConsistencyGate
      ? sourceConsistencyGate.promptCountAfter
      : stateWithPhase.sourceConsistencyPromptCount ?? 0,
    recentTopics:       stateAfterCompetency.recentTopics,
    competencyCoverage: stateAfterCompetency.competencyCoverage,
    metrics: {
      ...stateWithPhase.metrics,
      contradictionCount: updatedContradictions.length,
    },
    messages: assessmentMessages,
    sessionPaused: false,
    pauseReason: null,
    conductState: normalizeConductState(stateWithPhase.conductState),
  }

  // 5. Score + candidate profile

  let score: ReturnType<typeof aggregateScores> | null = null

  const confirmedSignals: any[] = Array.isArray((behaviorResult as any).validatedSignals)
    ? (behaviorResult as any).validatedSignals.filter((s: any) => s?.confirmed)
    : []

  const insightCount: number = Array.isArray((behaviorResult as any).insights)
    ? (behaviorResult as any).insights.length
    : 0

  const hasLiveSignal = confirmedSignals.length > 0 || insightCount > 0

  if (evalLastUserMsg && hasLiveSignal) {
    try {
      const rawScoreInput = buildRawScoreInput(
        behaviorResult,
        stateAfterCompetency.competencyCoverage,
        updatedContradictions,
        evaluationMessages,
        elapsedMinutes,
        now
      )

      const scoreSet = normalizeScores(rawScoreInput)
      score = aggregateScores(scoreSet, now)

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

      console.log('[barbaros:profile]', JSON.stringify({
        turn:             assessmentMessages.filter(m => m.role === 'user').length,
        confirmedSignals: confirmedSignals.length,
        insightCount,
        depth:            statePatch.candidateProfile?.depth,
        clarity:          statePatch.candidateProfile?.clarity,
        engagement:       statePatch.candidateProfile?.engagement,
        confidenceLevel:  statePatch.candidateProfile?.confidenceLevel,
      }))
    } catch (err) {
      score = null
      console.error('[barbaros:profile] scoring failed, skipped this turn:', err)
    }
  } else if (evalLastUserMsg) {
    console.log('[barbaros:profile] skipped, no confirmed signals this turn', JSON.stringify({
      turn:             assessmentMessages.filter(m => m.role === 'user').length,
      confirmedSignals: confirmedSignals.length,
      insightCount,
    }))
  }

  // 5b. Director

  const missingCompetencies = Object.entries(stateAfterCompetency.competencyCoverage)
    .filter(([, cov]) => (cov as { coverage: number }).coverage < 50)
    .map(([key]) => key)

  const answerSignals = evalLastUserMsg
    ? quickAnswerSignals(evalLastUserMsg.content)
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

  ;(statePatch as Record<string, unknown>).directorBudget = directorDecision.budgetAfter

  if (directorDecision.intent === 'RETURN_TO_PREVIOUS' && directorDecision.targetRef) {
    statePatch.contradictions = applyContradictionPatch(updatedContradictions, {
      markAddressed: [directorDecision.targetRef],
    })
  }

  // 5c. Panel

  const panel = resolvePanelForConfig(config)
  let activePanelMember: (typeof panel.members)[number] | null = null

  if (panel.enabled) {
    const priorPanelTurnState: PanelTurnState =
      ((stateWithPhase as any).panelTurnState as PanelTurnState | undefined)
      ?? createPanelTurnState()

    const mergedStateForPanel = { ...stateWithPhase, ...statePatch } as SessionState

    const panelDecision = evaluatePanelHandover({
      panel,
      turnState: priorPanelTurnState,
      state: mergedStateForPanel,
      config,
      messages: evaluationMessages,
      elapsedMinutes,
      totalMinutes,
    })

    activePanelMember = panelDecision.member

    ;(statePatch as Record<string, unknown>).panelTurnState = {
      ...panelDecision.turnState,
      questionsAskedByActive: panelDecision.turnState.questionsAskedByActive + 1,
    }
  }

  // 6. Prompt assembly

  const activeWeaknesses = weaknessState.weaknesses.filter(
    w => w.status === 'active' || w.status === 'improving'
  )

  const confirmedGrowth = growthState.growthSignals.filter(
    g => g.strength !== 'emerging' && g.status === 'active'
  )

  const promptInput: Parameters<typeof buildPrompt>[0] = {
    config,
    state:          { ...stateWithPhase, ...statePatch } as SessionState,
    weaknesses:     activeWeaknesses,
    growthSignals:  confirmedGrowth,
    elapsedMinutes,
    totalMinutes,
    isFirstSession: previousSnapshot === null,
    directorDecision,
  }

  if (activePanelMember) {
    promptInput.panelMember = activePanelMember
  }

  const built = buildPrompt(promptInput, false)

  // Resolved verification exchanges remain available to the interview LLM as
  // conversation context, while every evaluation path continues to use
  // evaluationMessages. On the resolution turn, remove the current clarification
  // from the assessment stream, then re-add it with its deterministic question so
  // the LLM never sees an orphaned answer.
  const promptMessages = buildSourceConsistencyContextMessages(
    verificationConsumedThisTurn ? evaluationMessages : assessmentMessages,
    updatedSourceConsistencyIssues,
    config.language
  )

  // 7. LLM call

  const rawContent = await callClaude({
    systemPrompt: built.systemPrompt,
    messages: promptMessages,
  })

  const conductSignal = parseConductSignal(rawContent)

  if (
    !isReadinessTransition &&
    lastUserMsg &&
    (conductSignal === 'off_topic_or_playful' || conductSignal === 'explicit_abuse')
  ) {
    const question = getCurrentAssessmentQuestion(promptMessages)
    const conductDecision = decideConduct(
      conductSignal,
      stateWithPhase.conductState,
      question,
      lastUserMsg.content,
      lastUserMsg.clientMessageId
    )

    return buildConductDecisionOutput({
      input,
      decision: conductDecision,
      question,
      remainingSeconds,
      promptCharCount: built.charCount,
      truncated: built.truncated,
    })
  }

  const content = stripConductTag(rawContent)

  // A professional answer resolves the saved question. Escalation history stays
  // intact, but any future pause must resume from the then-current question.
  statePatch.conductState = clearResolvedConductTurn(
    stateWithPhase.conductState
  )

  // 8. TTS

  let audioBase64: string | null = null

  try {
    const speechText = stripScoreTag(content)

    if (speechText.length > 0) {
      audioBase64 = await synthesizeSpeech(speechText)
    }
  } catch {
    audioBase64 = null
  }

  // 9. Longitudinal updates

  const sessionId = (stateWithPhase as any).sessionId ?? 'unknown'
  let weaknessPatch = weaknessState
  let growthPatch = growthState

  if (previousSnapshot !== null && score !== null) {
    const patternsForDelta = Array.isArray((behaviorResult as any).patterns)
      ? (behaviorResult as any).patterns
      : []

    const miniDelta = buildMiniDelta(patternsForDelta, sessionId, now)

    weaknessPatch = updateWeaknessTracker(weaknessState, miniDelta, sessionId, now)
    growthPatch = updateGrowthTracker(growthState, miniDelta, sessionId, now)
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
    coveredAreas:    [],
    activeRoleId:    activePanelMember?.id ?? null,
    activeRoleTitle: activePanelMember?.displayTitle ?? null,
    sessionPaused:   false,
    pauseReason:     null,
    responseKind:    'interview',
    excludeLastUserMessageFromAssessment: isReadinessTransition
      ? true
      : sourceConsistencyGate
        ? assessmentExclusion(sourceConsistencyGate).excludeLastUserMessageFromAssessment
        : false,
    excludeResponseFromAssessment: false,
    remainingSeconds,
  }
}

interface ConductOutputInput {
  input: EngineInput
  decision: ConductDecision
  question: string | null
  remainingSeconds: number
  promptCharCount: number
  truncated: boolean
}

async function buildConductDecisionOutput(
  args: ConductOutputInput
): Promise<EngineOutput> {
  const {
    input,
    decision,
    question,
    remainingSeconds,
    promptCharCount,
    truncated,
  } = args

  const content = buildConductResponse(
    decision.action,
    decision.signal,
    input.config.language,
    question
  )

  const paused = decision.action === 'pause'
  let audioBase64: string | null = null

  if (!paused && content) {
    try {
      audioBase64 = await synthesizeSpeech(content)
    } catch {
      audioBase64 = null
    }
  }

  return {
    content,
    audioBase64,
    score: null,
    statePatch: {
      sessionPaused: paused,
      pauseReason: paused ? 'conduct' : null,
      conductState: decision.state,
    },
    weaknessPatch: input.weaknessState,
    growthPatch: input.growthState,
    isEndOfSession: false,
    phaseChanged: false,
    snapshot: null,
    promptCharCount,
    truncated,
    coveredAreas: [],
    activeRoleId: null,
    activeRoleTitle: null,
    sessionPaused: paused,
    pauseReason: paused ? 'conduct' : null,
    responseKind: decision.action === 'none' ? 'interview' : decision.action,
    excludeLastUserMessageFromAssessment: true,
    excludeResponseFromAssessment: true,
    remainingSeconds,
  }
}

interface SourceConsistencyConductInput {
  answer: string
  question: string | null
  now: number
}

async function classifySourceConsistencyConduct(
  args: SourceConsistencyConductInput
): Promise<{
  signal: ReturnType<typeof parseConductSignal>
  promptCharCount: number
}> {
  const { answer, question, now } = args

  const systemPrompt = [
    'Classify the candidate conduct for an interview turn.',
    'Return exactly one internal conduct tag and no other text.',
    ...BARBAROS_CONDUCT_RULES,
  ].join('\n')

  const userPrompt = [
    `INTERVIEWER QUESTION:\n${question ?? '[none]'}`,
    `CANDIDATE ANSWER:\n${answer}`,
  ].join('\n\n')

  const raw = await callClaude({
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt, timestamp: now }],
    maxTokens: 32,
    temperature: 0,
  })

  return {
    signal: parseConductSignal(raw),
    promptCharCount: systemPrompt.length + userPrompt.length,
  }
}

// Source Consistency — deterministic verification turn output. Short-circuits
// before Director / Panel / behavior / scoring / main interview LLM.
async function buildSourceConsistencyOutput(args: {
  input: EngineInput
  issue: SourceConsistencyIssue
  issues: SourceConsistencyIssue[]
  pendingAfter: PendingSourceConsistency
  promptCountAfter: number
  exclusion: {
    excludeLastUserMessageFromAssessment: boolean
    excludeResponseFromAssessment: boolean
  }
  remainingSeconds: number
}): Promise<EngineOutput> {
  const {
    input,
    issue,
    issues,
    pendingAfter,
    promptCountAfter,
    exclusion,
    remainingSeconds,
  } = args

  const content = buildVerificationQuestion(
    issue.issueType ?? '',
    input.config.language
  )

  let audioBase64: string | null = null

  try {
    if (content.length > 0) {
      audioBase64 = await synthesizeSpeech(content)
    }
  } catch {
    audioBase64 = null
  }

  return {
    content,
    audioBase64,
    score: null,
    statePatch: {
      config: input.config,
      sourceConsistencyIssues: issues,
      pendingSourceConsistency: pendingAfter,
      sourceConsistencyPromptCount: promptCountAfter,
      sessionPaused: false,
      pauseReason: null,
      conductState: clearResolvedConductTurn(input.state.conductState),
    },
    weaknessPatch: input.weaknessState,
    growthPatch: input.growthState,
    isEndOfSession: false,
    phaseChanged: false,
    snapshot: null,
    promptCharCount: 0,
    truncated: false,
    coveredAreas: [],
    activeRoleId: null,
    activeRoleTitle: null,
    sessionPaused: false,
    pauseReason: null,
    responseKind: 'interview',
    excludeLastUserMessageFromAssessment:
      exclusion.excludeLastUserMessageFromAssessment,
    excludeResponseFromAssessment:
      exclusion.excludeResponseFromAssessment,
    remainingSeconds,
  }
}

async function buildResumeOutput(
  input: EngineInput,
  remainingSeconds: number,
  now: number
): Promise<EngineOutput> {
  const conductState = normalizeConductState(input.state.conductState)
  const wasPaused = input.state.sessionPaused === true
  const content = wasPaused
    ? buildResumeResponse(input.config.language, conductState.pendingQuestion ?? null)
    : ''

  let audioBase64: string | null = null

  if (content) {
    try {
      audioBase64 = await synthesizeSpeech(content)
    } catch {
      audioBase64 = null
    }
  }

  return {
    content,
    audioBase64,
    score: null,
    statePatch: {
      sessionPaused: false,
      pauseReason: null,
      conductState: {
        ...conductState,
        pendingQuestion: null,
      },
      metrics: {
        ...input.state.metrics,
        lastActivityAt: now,
      },
    },
    weaknessPatch: input.weaknessState,
    growthPatch: input.growthState,
    isEndOfSession: false,
    phaseChanged: false,
    snapshot: null,
    promptCharCount: 0,
    truncated: false,
    coveredAreas: [],
    activeRoleId: null,
    activeRoleTitle: null,
    sessionPaused: false,
    pauseReason: null,
    responseKind: 'resume',
    excludeLastUserMessageFromAssessment: false,
    excludeResponseFromAssessment: true,
    remainingSeconds,
  }
}

function buildPausedOutput(
  input: EngineInput,
  remainingSeconds: number
): EngineOutput {
  const conductState = normalizeConductState(input.state.conductState)
  const signal = conductState.lastViolationSignal ?? 'off_topic_or_playful'
  const content = buildConductResponse(
    'pause',
    signal,
    input.config.language,
    conductState.pendingQuestion ?? null
  )
  const lastUserMessage = [...input.messages]
    .reverse()
    .find(message => message.role === 'user')

  return {
    content,
    audioBase64: null,
    score: null,
    statePatch: {
      sessionPaused: true,
      pauseReason: 'conduct',
      conductState,
    },
    weaknessPatch: input.weaknessState,
    growthPatch: input.growthState,
    isEndOfSession: false,
    phaseChanged: false,
    snapshot: null,
    promptCharCount: 0,
    truncated: false,
    coveredAreas: [],
    activeRoleId: null,
    activeRoleTitle: null,
    sessionPaused: true,
    pauseReason: 'conduct',
    responseKind: 'pause',
    excludeLastUserMessageFromAssessment:
      Boolean(lastUserMessage && lastUserMessage.assessmentEligible !== false),
    excludeResponseFromAssessment: true,
    remainingSeconds,
  }
}

// End of Session

async function buildEndOfSessionOutput(
  input:          EngineInput,
  elapsedMinutes: number,
  totalMinutes:   number,
  now:            number
): Promise<EngineOutput> {
  const {
    config,
    state,
    weaknessState,
    growthState,
    previousSnapshot,
    messages,
  } = input

  const coverageState = buildCoverageStateForEnd(state, config, messages, now)
  const coveredAreas = resolveCoveredAreas(coverageState, config, messages)

  const closingContent = buildClosingMessage(
    coveredAreas,
    config.language,
    config.candidateName
  )

  let audioBase64: string | null = null

  try {
    audioBase64 = await synthesizeSpeech(closingContent)
  } catch {
    audioBase64 = null
  }

  const snapshotInput = {
    sessionId:       (state as any).sessionId ?? 'unknown',
    candidateId:     (state as any).sessionId ?? 'unknown',
    jobTitle:        config.jobTitle,
    institution:     config.institution,
    language:        config.language,
    completedPhases: [] as any[],
    durationMinutes: elapsedMinutes,
    totalMessages:   messages.length,
    scoreBreakdown:  {} as any,
    behaviorResult:  { validatedSignals: [], insights: [], patterns: [], activeRisks: [] } as any,
    competencies:    coverageState.competencyCoverage,
    contradictionSummary: { total: 0 } as any,
    phaseSummaries:  [] as any[],
    now,
  } as unknown as Parameters<typeof buildSessionSnapshot>[0]

  let snapshot: SessionSnapshot | null = null
  let weaknessPatch = weaknessState
  let growthPatch = growthState

  try {
    snapshot = buildSessionSnapshot(snapshotInput)

    const delta = computeSessionDelta(snapshot, previousSnapshot, now)
    const sessionId = (state as any).sessionId ?? 'unknown'

    weaknessPatch = updateWeaknessTracker(weaknessState, delta, sessionId, now)
    growthPatch = updateGrowthTracker(growthState, delta, sessionId, now)
  } catch (err) {
    console.error('[barbaros:endSession] snapshot/longitudinal failed, closing gracefully:', err)

    snapshot = null
    weaknessPatch = weaknessState
    growthPatch = growthState
  }

  return {
    content:         closingContent,
    audioBase64,
    score:           null,
    statePatch: {
      phase:              'closing',
      competencyCoverage: coverageState.competencyCoverage,
      sessionPaused:      false,
      pauseReason:        null,
    } as Partial<SessionState>,
    weaknessPatch,
    growthPatch,
    isEndOfSession:  true,
    phaseChanged:    false,
    snapshot,
    promptCharCount: 0,
    truncated:       false,
    coveredAreas,
    activeRoleId:    null,
    activeRoleTitle: null,
    sessionPaused:   false,
    pauseReason:     null,
    responseKind:    'closing',
    excludeLastUserMessageFromAssessment: false,
    excludeResponseFromAssessment: false,
    remainingSeconds: 0,
  }
}

// Helpers

function buildCoverageStateForEnd(
  state:    SessionState,
  config:   InterviewConfig,
  messages: Message[],
  now:      number
): SessionState {
  const baseState: SessionState = { ...state, config }

  const lastUserMsg = [...messages].reverse().find(
    m => m.role === 'user' && m.content.trim()
  )

  if (!lastUserMsg) {
    return baseState
  }

  let coverageState = baseState

  const matchedCompetencies = matchCompetenciesInText(
    baseState,
    lastUserMsg.content
  )

  for (const competency of matchedCompetencies) {
    coverageState = applyEvidenceDelta(
      coverageState,
      competency,
      lastUserMsg.content,
      now
    )
  }

  return coverageState
}

function defaultOpening(config: InterviewConfig): string {
  if (config.language === 'ar') {
    return `مرحباً ${config.candidateName}، أنا Barbaros. نحن هنا اليوم لمقابلة وظيفة ${config.jobTitle} في ${config.institution}. هل أنت مستعد للبدء؟`
  }

  return `Hello ${config.candidateName}, I'm Barbaros. We're here today for the ${config.jobTitle} position at ${config.institution}. Are you ready to begin?`
}

function buildRawScoreInput(
  behavior:       any,
  competencies:   SessionState['competencyCoverage'],
  contradictions: Array<{ severity: 'minor' | 'moderate' | 'major' }>,
  messages:       Message[],
  elapsedMinutes: number,
  now:            number
): RawScoreInput {
  const majorContradictions = contradictions.filter(c => c.severity === 'major').length
  const moderateContradictions = contradictions.filter(c => c.severity === 'moderate').length
  const totalUserMessages = messages.filter(m => m.role === 'user').length

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

function quickAnswerSignals(
  text: string
): { vagueness: 'low' | 'medium' | 'high'; hasExamples: boolean } {
  const t = text.trim()

  const hasExamples =
    /\b(for example|for instance|e\.g\.|such as|specifically|one time|once|when i|at my|last year|this year|in \d{4})\b/i.test(t) ||
    /\d/.test(t)

  const hasVagueLanguage =
    /\b(generally|usually|somehow|things|stuff|maybe|perhaps|it depends)\b/i.test(t) ||
    /(بشكل عام|عادة|نوعاً ما|نوعا ما|أشياء|ربما|قد يكون|يعتمد)/.test(t)

  const vagueness: 'low' | 'medium' =
    !hasExamples && hasVagueLanguage ? 'medium' : 'low'

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
  patterns: Array<{
    canonicalKey: string
    canonicalType: string
    polarity: 'positive' | 'negative'
    occurrences: number
  }>,
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
