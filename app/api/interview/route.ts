// app/api/interview/route.ts
// Barbaros V4 — Interview API Route.
// Thin adapter: HTTP ↔ engine.
// Runtime state is mirrored into an encrypted client-carried session token so
// Vercel instance changes do not destroy pause/resume continuity.
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

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
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

export const runtime = 'nodejs'

// ─── Runtime Cache + Encrypted Session Continuity ──────────────────────────────────────────────────

type ControlAction = 'resume'

type InterviewResponsePayloadCore = {
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
  lastResponsePayload?: InterviewResponsePayloadCore
  inFlight?: {
    fingerprint: string
    promise: Promise<InterviewResponsePayloadCore>
  }
}

const sessions = new Map<string, SessionStore>()

type InterviewResponsePayload = InterviewResponsePayloadCore & {
  sessionToken: string | null
}

type PersistedSessionStore = Omit<SessionStore, 'inFlight'>

interface SessionTokenEnvelope {
  version: 1
  sessionId: string
  expiresAt: number
  store: PersistedSessionStore
}

const SESSION_TOKEN_VERSION = 'v1'
const SESSION_TOKEN_AAD = Buffer.from('barbaros-interview-session-v1')
const SESSION_TOKEN_MAX_LENGTH = 3_000_000
const SESSION_TOKEN_MAX_PLAINTEXT_BYTES = 2_000_000
const SESSION_TOKEN_GRACE_MS = 2 * 60 * 60 * 1000

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
  payload: InterviewResponsePayloadCore,
  store: SessionStore,
  config: InterviewConfig
): InterviewResponsePayloadCore {
  if (payload.isEndOfSession) return { ...payload, remainingSeconds: 0 }

  return {
    ...payload,
    remainingSeconds: getCurrentRemainingSeconds(
      config.plan,
      store.sessionStartTime
    ),
  }
}


function getSessionTokenKey(): Buffer {
  const secret =
    process.env.INTERVIEW_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.ANTHROPIC_API_KEY

  if (!secret) {
    throw new Error(
      'Missing INTERVIEW_SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY, and ANTHROPIC_API_KEY'
    )
  }

  return createHash('sha256')
    .update('barbaros-interview-session-key-v1\0')
    .update(secret)
    .digest()
}

function toBase64Url(value: Buffer): string {
  return value.toString('base64url')
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function getSessionTokenExpiry(
  store: SessionStore,
  config: InterviewConfig
): number {
  const totalSeconds =
    SESSION_LIMIT_SECONDS[config.plan] ?? SESSION_LIMIT_SECONDS.free

  return store.sessionStartTime + totalSeconds * 1000 + SESSION_TOKEN_GRACE_MS
}

function createSessionToken(
  sessionId: string,
  store: SessionStore,
  config: InterviewConfig
): string {
  const persistedStore: PersistedSessionStore = {
    state: store.state,
    weaknessState: store.weaknessState,
    growthState: store.growthState,
    previousSnapshot: store.previousSnapshot,
    sessionStartTime: store.sessionStartTime,
    lastRequestFingerprint: store.lastRequestFingerprint,
    lastResponsePayload: store.lastResponsePayload
      ? { ...store.lastResponsePayload, audioBase64: null }
      : undefined,
  }

  const envelope: SessionTokenEnvelope = {
    version: 1,
    sessionId,
    expiresAt: getSessionTokenExpiry(store, config),
    store: persistedStore,
  }

  const plaintext = Buffer.from(JSON.stringify(envelope), 'utf8')

  if (plaintext.length > SESSION_TOKEN_MAX_PLAINTEXT_BYTES) {
    throw new Error('Interview session state exceeds the safe token size')
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getSessionTokenKey(), iv)
  cipher.setAAD(SESSION_TOKEN_AAD)

  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    SESSION_TOKEN_VERSION,
    toBase64Url(iv),
    toBase64Url(encrypted),
    toBase64Url(authTag),
  ].join('.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isRestorableSessionStore(value: unknown): value is PersistedSessionStore {
  if (!isRecord(value)) return false

  return (
    isRecord(value.state) &&
    isRecord(value.weaknessState) &&
    isRecord(value.growthState) &&
    typeof value.sessionStartTime === 'number' &&
    Number.isFinite(value.sessionStartTime) &&
    (value.previousSnapshot === null || isRecord(value.previousSnapshot)) &&
    (value.lastRequestFingerprint === undefined ||
      typeof value.lastRequestFingerprint === 'string') &&
    (value.lastResponsePayload === undefined ||
      isRecord(value.lastResponsePayload))
  )
}

function restoreSessionStore(
  token: string,
  expectedSessionId: string,
  now: number
): SessionStore | null {
  if (!token || token.length > SESSION_TOKEN_MAX_LENGTH) return null

  try {
    const [version, ivPart, encryptedPart, authTagPart, ...extra] = token.split('.')

    if (
      version !== SESSION_TOKEN_VERSION ||
      !ivPart ||
      !encryptedPart ||
      !authTagPart ||
      extra.length > 0
    ) {
      return null
    }

    const iv = fromBase64Url(ivPart)
    const encrypted = fromBase64Url(encryptedPart)
    const authTag = fromBase64Url(authTagPart)

    if (
      iv.length !== 12 ||
      authTag.length !== 16 ||
      encrypted.length > SESSION_TOKEN_MAX_PLAINTEXT_BYTES
    ) {
      return null
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      getSessionTokenKey(),
      iv
    )
    decipher.setAAD(SESSION_TOKEN_AAD)
    decipher.setAuthTag(authTag)

    const json = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8')
    const parsed = JSON.parse(json) as unknown

    if (!isRecord(parsed)) return null
    if (parsed.version !== 1) return null
    if (parsed.sessionId !== expectedSessionId) return null
    if (
      typeof parsed.expiresAt !== 'number' ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt < now
    ) {
      return null
    }
    if (!isRestorableSessionStore(parsed.store)) return null

    return {
      ...parsed.store,
      inFlight: undefined,
    }
  } catch {
    return null
  }
}

function withSessionToken(
  payload: InterviewResponsePayloadCore,
  sessionId: string,
  store: SessionStore,
  config: InterviewConfig
): InterviewResponsePayload {
  const refreshed = refreshRemainingSeconds(payload, store, config)

  return {
    ...refreshed,
    sessionToken: refreshed.isEndOfSession
      ? null
      : createSessionToken(sessionId, store, config),
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
  controlAction: ControlAction | undefined,
  sessionToken: string | undefined
): string {
  const sessionTokenHash = sessionToken
    ? createHash('sha256').update(sessionToken).digest('hex')
    : null

  return createHash('sha256')
    .update(JSON.stringify({
      sessionId,
      config,
      messages: rawMessages,
      controlAction,
      sessionTokenHash,
    }))
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
    const rawSessionToken = body.sessionToken
    const controlAction = parseControlAction(body.controlAction)

    if (
      rawSessionToken !== undefined &&
      rawSessionToken !== null &&
      typeof rawSessionToken !== 'string'
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid sessionToken' },
        { status: 400 }
      )
    }

    const sessionToken =
      typeof rawSessionToken === 'string' && rawSessionToken.length > 0
        ? rawSessionToken
        : undefined

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
    const cachedStore = sessions.get(sessionId)
    const isContinuation = controlAction === 'resume' || messages.length > 0

    let store: SessionStore
    let effectiveConfig: InterviewConfig
    let fingerprint: string

    if (sessionToken) {
      const restoredStore = restoreSessionStore(sessionToken, sessionId, now)

      if (!restoredStore) {
        return NextResponse.json(
          {
            success: false,
            error: 'Interview session not found or no longer available',
            code: 'SESSION_NOT_FOUND',
          },
          { status: 409 }
        )
      }

      effectiveConfig = restoredStore.state.config
      fingerprint = createRequestFingerprint(
        sessionId,
        effectiveConfig,
        rawMessages,
        controlAction,
        sessionToken
      )

      // A concurrent retry on this instance may already be processing the exact
      // same token-backed request. Reuse it before replacing the runtime cache.
      if (
        cachedStore?.lastRequestFingerprint === fingerprint &&
        cachedStore.lastResponsePayload
      ) {
        return jsonResponse(
          withSessionToken(
            cachedStore.lastResponsePayload,
            sessionId,
            cachedStore,
            effectiveConfig
          )
        )
      }

      if (cachedStore?.inFlight?.fingerprint === fingerprint) {
        const payload = await cachedStore.inFlight.promise
        return jsonResponse(
          withSessionToken(payload, sessionId, cachedStore, effectiveConfig)
        )
      }

      // The encrypted token is authoritative across Vercel instances. A local
      // Map entry may be stale if another instance processed the previous turn.
      store = restoredStore
      sessions.set(sessionId, store)
    } else {
      if (isContinuation) {
        return NextResponse.json(
          {
            success: false,
            error: 'Interview session not found or no longer available',
            code: 'SESSION_NOT_FOUND',
          },
          { status: 409 }
        )
      }

      store = cachedStore ?? {
        state: createInitialSessionState(config, now),
        weaknessState: createEmptyWeaknessTrackerState(now),
        growthState: createEmptyGrowthTrackerState(now),
        previousSnapshot: null,
        sessionStartTime: now,
      }

      if (!cachedStore) {
        sessions.set(sessionId, store)
      }

      effectiveConfig = store.state.config
      fingerprint = createRequestFingerprint(
        sessionId,
        effectiveConfig,
        rawMessages,
        controlAction,
        sessionToken
      )

      if (
        store.lastRequestFingerprint === fingerprint &&
        store.lastResponsePayload
      ) {
        return jsonResponse(
          withSessionToken(
            store.lastResponsePayload,
            sessionId,
            store,
            effectiveConfig
          )
        )
      }

      if (store.inFlight?.fingerprint === fingerprint) {
        const payload = await store.inFlight.promise
        return jsonResponse(
          withSessionToken(payload, sessionId, store, effectiveConfig)
        )
      }
    }

    const activeStore = store
    const promise = runStoredEngine({
      sessionId,
      config: effectiveConfig,
      messages,
      controlAction,
      store: activeStore,
      now,
      fingerprint,
    })

    activeStore.inFlight = { fingerprint, promise }

    try {
      const payload = await promise
      return jsonResponse(
        withSessionToken(payload, sessionId, activeStore, effectiveConfig)
      )
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
): Promise<InterviewResponsePayloadCore> {
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

  const payload: InterviewResponsePayloadCore = {
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
