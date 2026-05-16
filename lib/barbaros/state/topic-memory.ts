
// lib/barbaros/state/topic-memory.ts
// Tracks topics discussed to prevent repetition and enable smart revisits

import type { InterviewState, TopicMemory } from "../types";
import { LIMITS } from "../constants";
import { canonicalize, fingerprintQuestion } from "../utils/text";

// ─────────────────────────────────────────────────────────────
// SECTION 1 — TOPIC EXTRACTION
// ─────────────────────────────────────────────────────────────

// Lightweight keyword extractor: pulls noun-like content tokens
// from a question/answer. Not NLP — heuristic for pattern matching.
const STOP_WORDS = new Set([
  // English
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "must", "shall",
  "can", "of", "in", "to", "for", "with", "on", "at", "by", "from",
  "about", "as", "into", "through", "during", "you", "your", "yours",
  "i", "me", "my", "mine", "we", "us", "our", "ours", "they", "them",
  "their", "theirs", "this", "that", "these", "those", "what", "which",
  "who", "whom", "how", "when", "where", "why", "any", "some", "all",
  "tell", "describe", "explain", "share", "talk", "discuss",
  // Arabic common stopwords
  "في", "من", "إلى", "على", "عن", "مع", "هل", "ما", "ماذا", "كيف",
  "متى", "أين", "لماذا", "هذا", "هذه", "ذلك", "تلك", "أن", "إن",
  "كان", "كانت", "يكون", "أنت", "أنا", "نحن", "هم", "هي", "هو",
]);

export function extractTopicKeywords(text: string): string[] {
  const canonical = canonicalize(text);
  const tokens = canonical.split(/\s+/).filter(Boolean);
  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const tok of tokens) {
    const cleaned = tok.replace(/[^\p{L}\p{N}]/gu, "");
    if (cleaned.length < 3) continue;
    if (STOP_WORDS.has(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    keywords.push(cleaned);
  }

  return keywords.slice(0, 8);
}

// ─────────────────────────────────────────────────────────────
// SECTION 2 — DUPLICATE DETECTION
// ─────────────────────────────────────────────────────────────

export function isQuestionDuplicate(
  state: InterviewState,
  questionText: string
): boolean {
  const fp = fingerprintQuestion(questionText);
  if (!fp) return false;
  return state.askedQuestionFingerprints.includes(fp);
}

export function findSimilarQuestions(
  state: InterviewState,
  questionText: string,
  threshold: number = 0.6
): string[] {
  const targetKeywords = new Set(extractTopicKeywords(questionText));
  if (targetKeywords.size === 0) return [];

  const matches: string[] = [];

  for (const msg of state.messages) {
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
// SECTION 3 — TOPIC QUERIES
// ─────────────────────────────────────────────────────────────

export function isTopicRecentlyDiscussed(
  state: InterviewState,
  topic: string,
  withinMs: number = 5 * 60 * 1000
): boolean {
  const normalized = topic.trim().toLowerCase();
  if (!normalized) return false;

  const entry = state.recentTopics.find(
    (t) => t.topic.toLowerCase() === normalized
  );
  if (!entry) return false;

  const elapsed = Date.now() - entry.lastVisitedAt;
  return elapsed <= withinMs;
}

export function canRevisitTopic(
  state: InterviewState,
  topic: string
): boolean {
  const normalized = topic.trim().toLowerCase();
  const entry = state.recentTopics.find(
    (t) => t.topic.toLowerCase() === normalized
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
  const discussed = new Set(
    state.recentTopics.map((t) => t.topic.toLowerCase())
  );
  return candidateTopics.filter(
    (t) => !discussed.has(t.trim().toLowerCase())
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION 4 — TOPIC RECORDING WITH KEYWORD EXPANSION
// ─────────────────────────────────────────────────────────────

export function recordTopicsFromText(
  state: InterviewState,
  text: string,
  revisitAllowed: boolean = false
): InterviewState {
  const keywords = extractTopicKeywords(text);
  if (keywords.length === 0) return state;

  let recentTopics = [...state.recentTopics];

  for (const kw of keywords) {
    const existingIdx = recentTopics.findIndex(
      (t) => t.topic.toLowerCase() === kw.toLowerCase()
    );

    if (existingIdx >= 0) {
      const existing = recentTopics[existingIdx];
      recentTopics[existingIdx] = {
        ...existing,
        timesVisited: existing.timesVisited + 1,
        lastVisitedAt: Date.now(),
      };
    } else {
      recentTopics.push({
        topic: kw,
        timesVisited: 1,
        lastVisitedAt: Date.now(),
        revisitAllowed,
      });
    }
  }

  // Enforce capacity limit (drop oldest)
  if (recentTopics.length > LIMITS.MAX_TOPIC_MEMORY) {
    recentTopics = recentTopics
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, LIMITS.MAX_TOPIC_MEMORY);
  }

  return { ...state, recentTopics };
}

// ─────────────────────────────────────────────────────────────
// SECTION 5 — SUMMARY HELPERS (for prompt context)
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
} {
  return {
    total: state.recentTopics.length,
    overused: state.recentTopics.filter(
      (t) => t.timesVisited >= 2 && !t.revisitAllowed
    ).length,
    revisitable: state.recentTopics.filter((t) => t.revisitAllowed).length,
  };
}
