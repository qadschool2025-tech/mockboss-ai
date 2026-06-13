// app/api/interview/route.ts
// Barbaros V4 — Interview API Route.
// Thin adapter: HTTP ↔ engine. Session storage remains in-memory for this batch.
//
// FIXES PRESERVED:
// - technical_depth → domain_expertise normalization
// - UTF-8 JSON responses
// - closed and dangling <score> cleanup
// - coveredAreas, activeRoleId, and activeRoleTitle handoff
//
// BATCH 1:
// - resume is a control action and never creates a missing session
// - exact duplicate requests share/cached the same engine result
// - conduct metadata never reaches the candidate

import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  runEngine,
  createInitialSessionState,
  createEmptyWeaknessTrackerState,
  createEmptyGrowthTrackerState,
} from '@/lib/barbaros'
import type {
  InterviewConfig,
  SessionState,
  WeaknessTrackerState,
  GrowthTrackerState,
  SessionSnapshot,
  Message,
  EngineOutput,
} from '@/lib/barbaros'

// ─── In-Memory Session Store ──────────────────────────────────────────────────

type ControlAction = 'resume'

type InterviewResponsePayload = {
  success: true
  content: string
  audioBase64: string | null
  score: Record<string, unknown> | null
  isEndOfSession: boolean
  phaseChanged: boolean
  coveredAreas: EngineOutput['coveredAreas']
  activeRoleId: EngineOutput['activeRoleId'] | null
  activeRoleTitle: string | null
  sessionPaused: boolean
  pauseReason: EngineOutput['pauseReason']
  responseKind: EngineOutput['responseKind']
  excludeLastUserMessageFromAssessment: boolean
  excludeResponseFromAssessment: boolean
  remainingSeconds: number
  _debug?: {
    promptCharCount: number
    truncated: boolean
    phase: SessionState['phase']
  }
}

interface SessionStore {
  state: SessionState
  weaknessState: WeaknessTrackerState
  growthState: GrowthTrackerState
  previousSnapshot: SessionSnapshot | null
  sessionStartTime: number
  lastRequestFingerprint?: string
  lastResponsePayload?: InterviewResponsePayload
  inFlight?: {
    fingerprint: string
    promise: Promise<InterviewResponsePayload>
  }
}

const sessions = new Map<string, SessionStore>()

const SESSION_LIMIT_SECONDS: Record<string, number> = {
  free: 15 * 60,
  go: 15 * 60,
  pro: 30 * 60,
  expert: 45 * 60,
}

function getCurrentRemainingSeconds(
  plan: InterviewConfig['plan'],
  sessionStartTime: number,
  now = Date.now()
): number {
  const totalSeconds = SESSION_LIMIT_SECONDS[plan] ?? SESSION_LIMIT_SECONDS.free
  const elapsedSeconds = Math.max(0, (now - sessionStartTime) / 1000)
  return Math.max(0, Math.ceil(totalSeconds - elapsedSeconds))
}

function refreshRemainingSeconds(
  payload: InterviewResponsePayload,
  store: SessionStore,
  config: InterviewConfig
): InterviewResponsePayload {
  if (payload.isEndOfSession) return { ...payload, remainingSeconds: 0 }

  return {
    ...payload,
    remainingSeconds: getCurrentRemainingSeconds(
      config.plan,
      store.sessionStartTime
    ),
  }
}

// ─── Score Extraction, with legacy field normalization ────────────────────────

function extractScore(content: string): Record<string, unknown> | null {
  const match = content.match(/<score>([\s\S]*?)<\/score>/)
  if (!match) return null

  try {
    const raw = JSON.parse(match[1].trim()) as Record<string, unknown>

    if ('technical_depth' in raw && !('domain_expertise' in raw)) {
      raw.domain_expertise = raw.technical_depth
      delete raw.technical_depth
    }

    return raw
  } catch {
    return null
  }
}

function stripInternalTags(content: string): string {
  return content
    .replace(/<score>[\s\S]*?<\/score>/gi, '')
    .replace(/<score>[\s\S]*$/gi, '')
    .replace(/<\/score>/gi, '')
    .replace(/<conduct>[\s\S]*?<\/conduct>/gi, '')
    .replace(/<conduct>[\s\S]*$/gi, '')
    .replace(/<\/conduct>/gi, '')
    .trim()
}

// ─── Request Validation ───────────────────────────────────────────────────────

function validateConfig(config: unknown): config is InterviewConfig {
  if (!config || typeof config !== 'object') return false

  const c = config as Record<string, unknown>

  return (
    typeof c.candidateName === 'string' &&
    typeof c.jobTitle === 'string' &&
    typeof c.institution === 'string' &&
    typeof c.sector === 'string' &&
    typeof c.yearsExperience === 'string' &&
    typeof c.language === 'string' &&
    typeof c.plan === 'string'
  )
}

function normalizeMessages(value: unknown, now: number): Message[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []

    const message = item as Record<string, unknown>
    const role = message.role
    const content = message.content

    if (
      (role !== 'system' && role !== 'user' && role !== 'assistant') ||
      typeof content !== 'string'
    ) {
      return []
    }

    const timestamp =
      typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)
        ? message.timestamp
        : now - Math.max(0, value.length - index) * 1000

    return [{
      role,
      content,
      timestamp,
      ...(typeof message.isQuestion === 'boolean' && {
        isQuestion: message.isQuestion,
      }),
      ...(typeof message.assessmentEligible === 'boolean' && {
        assessmentEligible: message.assessmentEligible,
      }),
      ...(typeof message.clientMessageId === 'string' && {
        clientMessageId: message.clientMessageId,
      }),
    } satisfies Message]
  })
}

function parseControlAction(value: unknown): ControlAction | undefined {
  if (value === undefined || value === null) return undefined
  if (value === 'resume') return 'resume'
  return undefined
}

function createRequestFingerprint(
  sessionId: string,
  config: InterviewConfig,
  rawMessages: unknown,
  controlAction: ControlAction | undefined
): string {
  return createHash('sha256')
    .update(JSON.stringify({ sessionId, config, messages: rawMessages, controlAction }))
    .digest('hex')
}

function jsonResponse(payload: InterviewResponsePayload): NextResponse {
  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const config = body.config
    const sessionId = body.sessionId
    const rawMessages = body.messages
    const controlAction = parseControlAction(body.controlAction)

    if (body.controlAction !== undefined && controlAction === undefined) {
      return NextResponse.json(
        { success: false, error: 'Invalid controlAction' },
        { status: 400 }
      )
    }

    if (!validateConfig(config)) {
      return NextResponse.json(
        { success: false, error: 'Invalid interview config' },
        { status: 400 }
      )
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing sessionId' },
        { status: 400 }
      )
    }

    const now = Date.now()
    const messages = normalizeMessages(rawMessages, now)
    let store = sessions.get(sessionId)

    if (controlAction === 'resume' && !store) {
      return NextResponse.json(
        {
          success: false,
          error: 'Interview session not found or no longer available',
          code: 'SESSION_NOT_FOUND',
        },
        { status: 409 }
      )
    }

    if (!store) {
      store = {
        state: createInitialSessionState(sessionId, now),
        weaknessState: createEmptyWeaknessTrackerState(now),
        growthState: createEmptyGrowthTrackerState(now),
        previousSnapshot: null,
        sessionStartTime: now,
      }

      sessions.set(sessionId, store)
    }

    const fingerprint = createRequestFingerprint(
      sessionId,
      config,
      rawMessages,
      controlAction
    )

    if (
      store.lastRequestFingerprint === fingerprint &&
      store.lastResponsePayload
    ) {
      return jsonResponse(
        refreshRemainingSeconds(store.lastResponsePayload, store, config)
      )
    }

    if (store.inFlight?.fingerprint === fingerprint) {
      const payload = await store.inFlight.promise
      return jsonResponse(refreshRemainingSeconds(payload, store, config))
    }

    const activeStore = store
    const promise = runStoredEngine({
      sessionId,
      config,
      messages,
      controlAction,
      store: activeStore,
      now,
      fingerprint,
    })

    activeStore.inFlight = { fingerprint, promise }

    try {
      const payload = await promise
      return jsonResponse(refreshRemainingSeconds(payload, activeStore, config))
    } finally {
      if (activeStore.inFlight?.fingerprint === fingerprint) {
        activeStore.inFlight = undefined
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[route] Engine error:', message)

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

interface RunStoredEngineInput {
  sessionId: string
  config: InterviewConfig
  messages: Message[]
  controlAction?: ControlAction
  store: SessionStore
  now: number
  fingerprint: string
}

async function runStoredEngine(
  input: RunStoredEngineInput
): Promise<InterviewResponsePayload> {
  const {
    sessionId,
    config,
    messages,
    controlAction,
    store,
    now,
    fingerprint,
  } = input

  const output = await runEngine({
    config,
    messages,
    state: store.state,
    weaknessState: store.weaknessState,
    growthState: store.growthState,
    previousSnapshot: store.previousSnapshot,
    sessionStartTime: store.sessionStartTime,
    now,
    controlAction,
  })

  store.state = {
    ...store.state,
    config,
    ...output.statePatch,
  }
  store.weaknessState = output.weaknessPatch
  store.growthState = output.growthPatch

  if (output.isEndOfSession && output.snapshot) {
    store.previousSnapshot = output.snapshot
  }

  const score = output.excludeLastUserMessageFromAssessment
    ? null
    : extractScore(output.content)
  const cleanContent = stripInternalTags(output.content)

  const payload: InterviewResponsePayload = {
    success: true,
    content: cleanContent,
    audioBase64: output.audioBase64,
    score,
    isEndOfSession: output.isEndOfSession,
    phaseChanged: output.phaseChanged,
    coveredAreas: output.coveredAreas,
    activeRoleId: output.activeRoleId ?? null,
    activeRoleTitle: output.activeRoleTitle ?? null,
    sessionPaused: output.sessionPaused,
    pauseReason: output.pauseReason,
    responseKind: output.responseKind,
    excludeLastUserMessageFromAssessment:
      output.excludeLastUserMessageFromAssessment,
    excludeResponseFromAssessment: output.excludeResponseFromAssessment,
    remainingSeconds: output.isEndOfSession
      ? 0
      : getCurrentRemainingSeconds(config.plan, store.sessionStartTime),
    _debug: process.env.NODE_ENV === 'development'
      ? {
          promptCharCount: output.promptCharCount,
          truncated: output.truncated,
          phase: store.state.phase,
        }
      : undefined,
  }

  store.lastRequestFingerprint = fingerprint
  store.lastResponsePayload = payload

  if (output.isEndOfSession) {
    sessions.delete(sessionId)
  }

  return payload
}
