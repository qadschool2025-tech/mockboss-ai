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
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  _client = new Anthropic({ apiKey })
  return _client
}

// ============================================================================
// TYPES
// ============================================================================

export interface ClaudeCallOptions {
  systemPrompt: string
  messages: Message[]
  maxTokens?: number
  temperature?: number
}

export interface ClaudeCallResult {
  /** Cleaned response content with <score> tags stripped. */
  content: string
  /** Parsed score block if present, otherwise null. */
  rawScore: RawScore | null
  /** Raw response text exactly as returned by the model. */
  raw: string
  /** Token usage for observability. */
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

// ============================================================================
// CORE CALL
// ============================================================================

/**
 * Send a turn to Claude and return parsed content + score.
 *
 * Filters out 'system' role messages from history — those are internal
 * orchestration notes and must never be sent to the model as turns.
 * The system prompt is passed via the `system` parameter instead.
 */
export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const client = getClient()

  const apiMessages = opts.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content || '[no content]',
    }))

  // First turn — seed with a synthetic user message so the model produces
  // the opening line instead of waiting for input.
  const messagesForApi =
    apiMessages.length === 0
      ? [{ role: 'user' as const, content: 'Start the interview now.' }]
      : apiMessages

  const response = await client.messages.create({
    model: LLM_CONFIG.MODEL,
    max_tokens: opts.maxTokens ?? LLM_CONFIG.MAX_TOKENS_STANDARD,
    temperature: opts.temperature,
    system: opts.systemPrompt,
    messages: messagesForApi,
  })

  const raw =
    response.content[0]?.type === 'text' ? response.content[0].text : ''

  return parseClaudeResponse(raw, {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  })
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

/**
 * Parse Claude's raw text output into structured content + score.
 * Exported for testing.
 */
export function parseClaudeResponse(
  raw: string,
  usage: { inputTokens: number; outputTokens: number } = {
    inputTokens: 0,
    outputTokens: 0,
  }
): ClaudeCallResult {
  let rawScore: RawScore | null = null
  let content = raw

  const scoreBlock = extractTag(raw, 'score')
  if (scoreBlock) {
    rawScore = safeParseScore(scoreBlock)
    content = stripTag(raw, 'score')
  }

  return {
    content: content.trim(),
    rawScore,
    raw,
    usage,
  }
}

/**
 * Defensive JSON parse for the score block.
 * Returns null if malformed — never throws.
 */
function safeParseScore(text: string): RawScore | null {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.score !== 'number') return null
    return parsed as RawScore
  } catch {
    return null
  }
}
