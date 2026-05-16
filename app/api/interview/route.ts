// app/api/interview/route.ts
// Barbaros V4 — Interview API Route.
// Thin adapter: HTTP ↔ engine. Zero business logic here.
//
// Responsibilities:
// - Parse and validate request
// - Manage session state between turns (in-memory, keyed by sessionId)
// - Call runEngine
// - Extract <score> tag from response
// - Return clean JSON to frontend

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
// Keyed by sessionId. Cleared when session ends.
// Note: resets on Vercel cold start — acceptable for MVP.
// Post-launch: replace with Redis or Vercel KV.

interface SessionStore {
  state:            SessionState
  weaknessState:    WeaknessTrackerState
  growthState:      GrowthTrackerState
  previousSnapshot: SessionSnapshot | null
  sessionStartTime: number
}

const sessions = new Map<string, SessionStore>()

// ─── Score Extraction ─────────────────────────────────────────────────────────

function extractScore(content: string): Record<string, unknown> | null {
  const match = content.match(/<score>([\s\S]*?)<\/score>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

function stripScoreTag(content: string): string {
  return content.replace(/<score>[\s\S]*?<\/score>/g, '').trim()
}

// ─── Request Validation ───────────────────────────────────────────────────────

function validateConfig(config: unknown): config is InterviewConfig {
  if (!config || typeof config !== 'object') return false
  const c = config as Record<string, unknown>
  return (
    typeof c.candidateName  === 'string' &&
    typeof c.jobTitle       === 'string' &&
    typeof c.institution    === 'string' &&
    typeof c.sector         === 'string' &&
    typeof c.yearsExperience === 'string' &&
    typeof c.language       === 'string' &&
    typeof c.plan           === 'string'
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

    // Validate
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

    // Get or create session store
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

    // Run engine
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

    // Merge state patches back into store
    store.state         = { ...store.state,      ...output.statePatch  }
    store.weaknessState = output.weaknessPatch
    store.growthState   = output.growthPatch

    // Save snapshot at session end
    if (output.isEndOfSession && output.snapshot) {
      store.previousSnapshot = output.snapshot
    }

    // Extract score from raw content — frontend receives clean content
    const score          = extractScore(output.content)
    const cleanContent   = stripScoreTag(output.content)

    // Clean up session from memory when done
    if (output.isEndOfSession) {
      sessions.delete(sessionId)
    }

    return NextResponse.json({
      success:        true,
      content:        cleanContent,
      audioBase64:    output.audioBase64,
      score,
      isEndOfSession: output.isEndOfSession,
      phaseChanged:   output.phaseChanged,
      // Dev diagnostics — strip in production if needed
      _debug: process.env.NODE_ENV === 'development' ? {
        promptCharCount: output.promptCharCount,
        truncated:       output.truncated,
        phase:           store.state.phase,
      } : undefined,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[route] Engine error:', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
