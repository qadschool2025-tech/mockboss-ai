// app/api/interview/route.ts
// Barbaros V4 — Interview API Route.
// Thin adapter: HTTP ↔ engine. Zero business logic here.
//
// FIXES APPLIED:
// Fix #2 — score field normalized: technical_depth → domain_expertise
// Fix #5 — Content-Type: application/json; charset=utf-8 (Arabic correctness)
// Fix #6 — stripScoreTag also removes an UNCLOSED/dangling <score> block.
// Fix #coverage — pass coveredAreas from engine to client/report handoff.

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
} from '@/lib/barbaros'

// ─── In-Memory Session Store ──────────────────────────────────────────────────

interface SessionStore {
  state:            SessionState
  weaknessState:    WeaknessTrackerState
  growthState:      GrowthTrackerState
  previousSnapshot: SessionSnapshot | null
  sessionStartTime: number
}

const sessions = new Map<string, SessionStore>()

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

// Fix #6: remove score markers in BOTH forms so they never reach the candidate.
function stripScoreTag(content: string): string {
  return content
    .replace(/<score>[\s\S]*?<\/score>/g, '')
    .replace(/<score>[\s\S]*$/g, '')
    .replace(/<\/score>/g, '')
    .trim()
}

// ─── Request Validation ───────────────────────────────────────────────────────

function validateConfig(config: unknown): config is InterviewConfig {
  if (!config || typeof config !== 'object') return false

  const c = config as Record<string, unknown>

  return (
    typeof c.candidateName   === 'string' &&
    typeof c.jobTitle        === 'string' &&
    typeof c.institution     === 'string' &&
    typeof c.sector          === 'string' &&
    typeof c.yearsExperience === 'string' &&
    typeof c.language        === 'string' &&
    typeof c.plan            === 'string'
  )
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { config, messages, sessionId } = body as {
      config:    unknown
      messages:  Message[]
      sessionId: string
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

    let store = sessions.get(sessionId)

    if (!store) {
      store = {
        state:            createInitialSessionState(sessionId, now),
        weaknessState:    createEmptyWeaknessTrackerState(now),
        growthState:      createEmptyGrowthTrackerState(now),
        previousSnapshot: null,
        sessionStartTime: now,
      }

      sessions.set(sessionId, store)
    }

    const output = await runEngine({
      config,
      messages:         messages ?? [],
      state:            store.state,
      weaknessState:    store.weaknessState,
      growthState:      store.growthState,
      previousSnapshot: store.previousSnapshot,
      sessionStartTime: store.sessionStartTime,
      now,
    })

    store.state         = { ...store.state, ...output.statePatch }
    store.weaknessState = output.weaknessPatch
    store.growthState   = output.growthPatch

    if (output.isEndOfSession && output.snapshot) {
      store.previousSnapshot = output.snapshot
    }

    const score        = extractScore(output.content)
    const cleanContent = stripScoreTag(output.content)

    if (output.isEndOfSession) {
      sessions.delete(sessionId)
    }

   ```
return new NextResponse(
  JSON.stringify({
    success:         true,
    content:         cleanContent,
    audioBase64:     output.audioBase64,
    score,
    isEndOfSession:  output.isEndOfSession,
    phaseChanged:    output.phaseChanged,
    coveredAreas:    output.coveredAreas,
    activeRoleId:    output.activeRoleId ?? null,
    activeRoleTitle: output.activeRoleTitle ?? null,
    _debug: process.env.NODE_ENV === 'development' ? {
      promptCharCount: output.promptCharCount,
      truncated:       output.truncated,
      phase:           store.state.phase,
    } : undefined,
  }),
  {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  }
)
```
)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[route] Engine error:', message)

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
