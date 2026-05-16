
// ============================================================================
// Barbaros V4 — Text Utilities
// Pure string helpers. No side effects, no state.
// ============================================================================

import { LIMITS } from '../constants'

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Collapse all whitespace to single spaces and trim.
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Lowercase + normalize whitespace + strip surrounding punctuation.
 * Used for fingerprinting and comparison — not for display.
 */
export function canonicalize(text: string): string {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

/**
 * Strip surrounding quotes (straight or curly) from a string.
 */
export function stripQuotes(text: string): string {
  return text.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim()
}

// ============================================================================
// TRUNCATION
// ============================================================================

/**
 * Truncate to a max character length, preserving whole words when possible.
 * Appends "…" if truncated.
 */
export function truncate(text: string, max: number = LIMITS.MAX_MESSAGE_LENGTH): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > max * 0.7 ? slice.slice(0, lastSpace) : slice
  return cut.trimEnd() + '…'
}

/**
 * Take the first N words of a string.
 */
export function firstWords(text: string, n: number): string {
  return text.trim().split(/\s+/).slice(0, n).join(' ')
}

// ============================================================================
// MEASUREMENT
// ============================================================================

/**
 * Count words. Treats any run of non-whitespace as one word.
 */
export function wordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/**
 * Count sentences. Heuristic — splits on . ! ? and Arabic punctuation.
 */
export function sentenceCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const matches = trimmed.match(/[^.!?؟।\n]+[.!?؟।]?/g)
  return matches ? matches.filter((s) => s.trim().length > 0).length : 1
}

// ============================================================================
// FINGERPRINTING
// ============================================================================

/**
 * Generate a stable fingerprint for a question.
 * Used by askedQuestionFingerprints to detect rephrased duplicates.
 *
 * Strategy: canonicalize, remove filler words, sort distinctive tokens,
 * keep only the first 8 to capture topical essence without overfitting.
 */
export function fingerprintQuestion(text: string): string {
  const FILLERS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'would',
    'should', 'will', 'shall', 'may', 'might', 'must',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'us', 'them',
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'and', 'or', 'but', 'if', 'so', 'as', 'to', 'of', 'in', 'on',
    'at', 'by', 'for', 'with', 'from', 'about', 'into', 'through',
    'what', 'how', 'when', 'where', 'why', 'who', 'which',
    'that', 'this', 'these', 'those',
    'tell', 'describe', 'explain', 'share', 'give', 'walk', 'me',
    'please', 'sometimes', 'maybe', 'just',
  ])

  const tokens = canonicalize(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !FILLERS.has(t))

  return tokens.slice(0, 8).sort().join('|')
}

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Extract a content block wrapped in <tag>…</tag>.
 * Returns the inner content (trimmed) or null if not found.
 */
export function extractTag(text: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i')
  const match = text.match(re)
  return match ? match[1].trim() : null
}

/**
 * Remove a <tag>…</tag> block (and its contents) from text.
 */
export function stripTag(text: string, tag: string): string {
  const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'gi')
  return text.replace(re, '').trim()
}

// ============================================================================
// EMPTINESS
// ============================================================================

/**
 * True if text is empty, whitespace, or below the minimum-answer threshold.
 */
export function isEffectivelyEmpty(text: string): boolean {
  return wordCount(text) < LIMITS.MIN_ANSWER_WORDS
}
