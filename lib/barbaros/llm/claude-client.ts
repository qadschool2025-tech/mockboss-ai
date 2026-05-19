
// ============================================================================
// Barbaros V4 — Claude Client
// Thin, typed wrapper around the Anthropic Messages API.
// Owns: API call, retry, response parsing.
// Knows nothing about interview state or prompts.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'
import type { Message, RawScore } from '../types'
import { LLM_CONFIG } from '../constants'
import { extractTag, stripTag } from '../utils/text'

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey })
  return _client
}

// ============================================================================
// TYPES
// ============================================================================

export interface ClaudeCallOptions {
  systemPrompt: string
  messages:     Message[]
  maxTokens?:   number
  temperature?: number
}

export interface ClaudeCallResult {
  content:  string
  rawScore: RawScore | null
  raw:      string
  usage: {
    inputTokens:  number
    outputTokens: number
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// CORE CALL
// engine.ts expects: callClaude(opts) → Promise<string>
// Returns raw LLM text (with <score> tag intact).
// Parsing happens in route.ts / engine.ts.
// ============================================================================

const MAX_RETRIES = 3
const TIMEOUT_MS  = 30_000

export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const client = getClient()

  const apiMessages = opts.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content || '[no content]',
    }))

  const messagesForApi =
    apiMessages.length === 0
      ? [{ role: 'user' as const, content: 'Start the interview now.' }]
      : apiMessages

  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const response = await client.messages.create(
        {
          model:       LLM_CONFIG.MODEL,
          max_tokens:  opts.maxTokens ?? LLM_CONFIG.MAX_TOKENS_STANDARD,
          system:      opts.systemPrompt,
          messages:    messagesForApi,
          // Fix #4: only pass temperature if explicitly set
          ...(opts.temperature !== undefined && { temperature: opts.temperature }),
        },
        { signal: controller.signal }
      )

      clearTimeout(timeoutId)

      // Fix #1: collect all text blocks, not just first
      const raw = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('\n')

      return raw

    } catch (err: unknown) {
      lastError = err

      // Abort = timeout, no retry
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('[claude-client] Request timed out')
        throw new Error('Claude request timed out after 30s')
      }

      // Last attempt — throw
      if (attempt === MAX_RETRIES) break

      // Exponential backoff: 500ms, 1000ms, 2000ms
      const delay = 500 * Math.pow(2, attempt)
      console.warn(`[claude-client] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`)
      await sleep(delay)
    }
  }

  throw lastError
}

// ============================================================================
// RESPONSE PARSING (used by tests and optional downstream consumers)
// ============================================================================

export function parseClaudeResponse(
  raw:   string,
  usage: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 }
): ClaudeCallResult {
  let rawScore: RawScore | null = null
  let content = raw

  const scoreBlock = extractTag(raw, 'score')
  if (scoreBlock) {
    rawScore = safeParseScore(scoreBlock)
    content  = stripTag(raw, 'score')
  }

  return {
    content: content.trim(),
    rawScore,
    raw,
    usage,
  }
}

function safeParseScore(text: string): RawScore | null {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.score !== 'number')      return null
    return parsed as RawScore
  } catch {
    return null
  }
}
