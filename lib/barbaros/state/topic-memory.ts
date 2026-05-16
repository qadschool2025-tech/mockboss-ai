// lib/barbaros/state/topic-memory.ts
// Tracks topics discussed to prevent repetition and enable smart revisits
//
// Architectural rules:
//   - This module NEVER reads state.messages directly.
//     Conversation history is passed in as an explicit parameter.
//   - All time-sensitive operations accept `now` as a parameter for
//     deterministic testing and replay.
//   - Topic keywords are normalized via TOPIC_SYNONYMS before storage,
//     so "redis" and "caching" collapse into "performance_optimization".

import type {
  InterviewState,
  TopicMemory,
  Message,
  InterviewPhase,
} from "../types";
import { LIMITS, STOP_WORDS } from "../constants";
import {
  canonicalize,
  fingerprintQuestion,
  normalizeTopicKeyword,
} from "../utils/text";

// ─────────────────────────────────────────────────────────────
// SECTION 1 — KEYWORD CACHE (memoization)
// ─────────────────────────────────────────────────────────────

// LRU-style cache. extractTopicKeywords is called frequently
// (duplicate checks, similarity, recording, prompt context)
// so memoization gives measurable speedup with negligible memory.
const KEYWORD_CACHE_MAX = 500;
const keywordCache = new Map<string, string[]>();

function getCachedKeywords(text: string): string[] | undefined {
  return keywordCache.get(text);
}

function setCachedKeywords(text: string, keywords: string[]): void {
  if (keywordCache.size >= KEYWORD_CACHE_MAX) {
    // Drop oldest entry (Map preserves insertion order)
    const firstKey = keywordCache.keys().next().value;
    if (firstKey !== undefined) keywordCache.delete(firstKey);
  }
  keywordCache.set(text, keywords);
}

export function clearKeywordCache(): void {
  keywordCache.clear();
}

// ─────────────────────────────────────────────────────────────
// SECTION 2 — TOPIC EXTRACTION
// ─────────────────────────────────────────────────────────────

/**
 * Extract canonical topic keywords from raw text.
 * Returns deduplicated, normalized topic labels (not raw tokens).
 */
export function extractTopicKeywords(text: string): string[] {
  const cached = getCachedKeywords(text);
  if (cached) return cached;

  const canonical = canonicalize(text);
  const tokens = canonical.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const topics: string[] = [];

  for (const tok of tokens) {
    const cleaned = tok.replace(/[^\p{L}\p{N}]/gu, "");
    if (cleaned.length < 3) continue;
    if (STOP_WORDS.has(cleaned)) continue;

    const normalized = normalizeTopicKeyword(cleaned);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    topics.push(normalized);
  }

  const result = topics.slice(0, 8);
  setCachedKeywords(text, result);
  return result;
}

// ─────────────────────────────────────────────────────────────
// SECTION 3 — DUPLICATE DETECTION
// ─────────────────────────────────────────────────────────────

export function isQuestionDuplicate(
  state: InterviewState,
  questionText: string
): boolean {
  const fp = fingerprintQuestion(questionText);
  if (!fp) return false;
  return state.askedQuestionFingerprints.includes(fp);
}

/**
 * Find prior assistant questions similar to the given text.
 * IMPORTANT: messages are passed explicitly — this module does
 * NOT read state.messages directly (decoupling rule).
 */
export function findSimilarQuestions(
  messages: ReadonlyArray<Message>,
  questionText: string,
  threshold: number = 0.6
): string[] {
  const targetKeywords = new Set(extractTopicKeywords(questionText));
  if (targetKeywords.size === 0) return [];

  const matches: string[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const msgKeywords = new Set(extractTopicKeywords(msg.content));
    if (msgKeywords.size === 0) continue;

    const overlap = countSetIntersection(targetKeywords, msgKeywords);
    const ratio = overlap / Math.min(targetKeywords.size, msgKeywords.size);
    if (ratio >= threshold) {
      matches.push(msg.content);
    }
  }

  return matches;
}

function countSetIntersection<T>(a: Set<T>, b: Set<T>): number {
  let count = 0;
  for (const item of a) if (b.has(item)) count++;
  return count;
}

// ─────────────────────────────────────────────────────────────
// SECTION 4 — TOPIC QUERIES
// ─────────────────────────────────────────────────────────────

export function isTopicRecentlyDiscussed(
  state: InterviewState,
  topic: string,
  now: number,
  withinMs: number = 5 * 60 * 1000
): boolean {
  const normalized = normalizeTopicKeyword(topic);
  if (!normalized) return false;

  const entry = state.recentTopics.find(
    (t) => t.topic === normalized
  );
  if (!entry) return false;

  const elapsed = now - entry.lastVisitedAt;
  return elapsed <= withinMs;
}

export function canRevisitTopic(
  state: InterviewState,
  topic: string
): boolean {
  const normalized = normalizeTopicKeyword(topic);
  const entry = state.recentTopics.find(
    (t) => t.topic === normalized
  );
  if (!entry) return true;
  return entry.revisitAllowed;
}

export function getOverusedTopics(
  state: InterviewState,
  threshold: number = 2
): TopicMemory[] {
  return state.recentTopics.filter(
    (t) => t.timesVisited >= threshold && !t.revisitAllowed
  );
}

export function getUnexploredTopics(
  state: InterviewState,
  candidateTopics: string[]
): string[] {
  const discussed = new Set(state.recentTopics.map((t) => t.topic));
  const result: string[] = [];

  for (const candidate of candidateTopics) {
    const normalized = normalizeTopicKeyword(candidate);
    if (normalized && !discussed.has(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

export function getTopicsByPhase(
  state: InterviewState,
  phase: InterviewPhase
): TopicMemory[] {
  return state.recentTopics.filter((t) => t.phase === phase);
}

// ─────────────────────────────────────────────────────────────
// SECTION 5 — TOPIC RECORDING (phase-aware, deterministic time)
// ─────────────────────────────────────────────────────────────

/**
 * Record topics extracted from a piece of text.
 * Caller MUST pass `now` (deterministic) and optionally `phase`.
 * If phase is omitted, falls back to state.currentPhase.
 */
export function recordTopicsFromText(
  state: InterviewState,
  text: string,
  now: number,
  options: {
    phase?: InterviewPhase;
    revisitAllowed?: boolean;
  } = {}
): InterviewState {
  const keywords = extractTopicKeywords(text);
  if (keywords.length === 0) return state;

 const phase = options.phase ?? state.phase;
  const revisitAllowed = options.revisitAllowed ?? false;

  let recentTopics = [...state.recentTopics];

  for (const kw of keywords) {
    const existingIdx = recentTopics.findIndex((t) => t.topic === kw);

    if (existingIdx >= 0) {
      const existing = recentTopics[existingIdx];
      recentTopics[existingIdx] = {
        ...existing,
        timesVisited: existing.timesVisited + 1,
        lastVisitedAt: now,
        // Keep first phase the topic appeared in (don't overwrite)
      };
    } else {
      recentTopics.push({
        topic: kw,
        phase,
        timesVisited: 1,
        firstVisitedAt: now,
        lastVisitedAt: now,
        revisitAllowed,
      });
    }
  }

  // Enforce capacity (drop oldest by lastVisitedAt)
  if (recentTopics.length > LIMITS.MAX_TOPIC_MEMORY) {
    recentTopics = recentTopics
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, LIMITS.MAX_TOPIC_MEMORY);
  }

  return { ...state, recentTopics };
}

// ─────────────────────────────────────────────────────────────
// SECTION 6 — SUMMARY HELPERS (for prompt context)
// ─────────────────────────────────────────────────────────────

export function getRecentTopicsSummary(
  state: InterviewState,
  limit: number = 10
): string[] {
  return [...state.recentTopics]
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, limit)
    .map((t) => t.topic);
}

export function getTopicMemoryStats(state: InterviewState): {
  total: number;
  overused: number;
  revisitable: number;
  byPhase: Record<InterviewPhase, number>;
} {
  const byPhase: Record<string, number> = {};
  for (const t of state.recentTopics) {
    if (t.phase) byPhase[t.phase] = (byPhase[t.phase] ?? 0) + 1;
  }

  return {
    total: state.recentTopics.length,
    overused: state.recentTopics.filter(
      (t) => t.timesVisited >= 2 && !t.revisitAllowed
    ).length,
    revisitable: state.recentTopics.filter((t) => t.revisitAllowed).length,
    byPhase: byPhase as Record<InterviewPhase, number>,
  };
}
