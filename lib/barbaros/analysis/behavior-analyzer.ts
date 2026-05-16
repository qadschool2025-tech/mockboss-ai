
// lib/barbaros/analysis/behavior-analyzer.ts
// CONTRACT: Analyzes candidate behavioral patterns across the interview.
// Pure functions only. No state mutation. All time ops take `now: number`.

import type { Message, InterviewPhase } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BehaviorAnalysisInput {
  messages: Message[];
  currentPhase: InterviewPhase;
  now: number;
}

export interface ResponsePattern {
  averageWordCount: number;
  trend: 'expanding' | 'stable' | 'shrinking';
  lastThreeWordCounts: number[];
}

export interface EngagementSignals {
  asksQuestions: boolean;
  usesExamples: boolean;
  selfCorrects: boolean;
  hedgesFrequently: boolean;
  repeatsKeywords: boolean;
}

export interface BehaviorProfile {
  responsePattern: ResponsePattern;
  engagement: EngagementSignals;
  silenceRisk: 'low' | 'medium' | 'high';
  deflectionCount: number;
  overconfidenceSignals: number;
  uncertaintySignals: number;
  totalUserMessages: number;
  averageResponseLatency: number | null; // ms, null if no timestamps
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SHORT_RESPONSE_THRESHOLD = 20;   // words
const LONG_RESPONSE_THRESHOLD = 150;   // words
const HEDGE_PHRASES = [
  'i think', 'i believe', 'maybe', 'perhaps', 'possibly',
  'not sure', 'i guess', "i'm not certain", 'kind of', 'sort of',
  'it depends', 'i might',
];
const DEFLECTION_PHRASES = [
  "i'd rather not", 'skip that', "i don't want to", 'next question',
  'can we move on', 'pass', "i'd prefer", 'not applicable',
];
const OVERCONFIDENCE_PHRASES = [
  'always', 'never fail', 'best in', 'expert in', 'perfect',
  'flawless', 'i always succeed', 'no one better', 'guaranteed',
];
const SELF_CORRECTION_PHRASES = [
  'actually', 'let me rephrase', 'correction', 'what i meant',
  'to clarify', 'i should say', 'more precisely',
];

// ─── Main Analyzer ────────────────────────────────────────────────────────────

export function analyzeBehavior(input: BehaviorAnalysisInput): BehaviorProfile {
  const { messages, now } = input;

  const userMessages = messages.filter((m) => m.role === 'user');

  if (userMessages.length === 0) {
    return emptyBehaviorProfile();
  }

  const wordCounts = userMessages.map((m) => countWords(m.content));
  const responsePattern = analyzeResponsePattern(wordCounts);
  const engagement = analyzeEngagement(userMessages);
  const deflectionCount = countPhraseMatches(userMessages, DEFLECTION_PHRASES);
  const overconfidenceSignals = countPhraseMatches(userMessages, OVERCONFIDENCE_PHRASES);
  const uncertaintySignals = countPhraseMatches(userMessages, HEDGE_PHRASES);
  const silenceRisk = assessSilenceRisk(responsePattern, wordCounts);
  const averageResponseLatency = computeAverageLatency(messages, now);

  return {
    responsePattern,
    engagement,
    silenceRisk,
    deflectionCount,
    overconfidenceSignals,
    uncertaintySignals,
    totalUserMessages: userMessages.length,
    averageResponseLatency,
  };
}

// ─── Sub-analyzers ────────────────────────────────────────────────────────────

function analyzeResponsePattern(wordCounts: number[]): ResponsePattern {
  const total = wordCounts.reduce((a, b) => a + b, 0);
  const averageWordCount = wordCounts.length > 0
    ? Math.round(total / wordCounts.length)
    : 0;

  const last = wordCounts.slice(-3);
  const trend = computeTrend(last);

  return {
    averageWordCount,
    trend,
    lastThreeWordCounts: last,
  };
}

function analyzeEngagement(userMessages: Message[]): EngagementSignals {
  const combined = userMessages.map((m) => m.content.toLowerCase()).join(' ');

  return {
    asksQuestions: /\?/.test(combined),
    usesExamples: /for example|for instance|such as|like when|one time|once I/.test(combined),
    selfCorrects: containsAnyPhrase(combined, SELF_CORRECTION_PHRASES),
    hedgesFrequently: countPhraseMatchesInText(combined, HEDGE_PHRASES) >= 3,
    repeatsKeywords: detectKeywordRepetition(userMessages),
  };
}

function assessSilenceRisk(
  pattern: ResponsePattern,
  wordCounts: number[]
): 'low' | 'medium' | 'high' {
  const recentAvg = pattern.lastThreeWordCounts.length > 0
    ? pattern.lastThreeWordCounts.reduce((a, b) => a + b, 0) /
      pattern.lastThreeWordCounts.length
    : pattern.averageWordCount;

  if (recentAvg < SHORT_RESPONSE_THRESHOLD && pattern.trend === 'shrinking') {
    return 'high';
  }
  if (recentAvg < SHORT_RESPONSE_THRESHOLD || pattern.trend === 'shrinking') {
    return 'medium';
  }
  return 'low';
}

function computeAverageLatency(
  messages: Message[],
  now: number
): number | null {
  const pairs: number[] = [];

  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];

    if (
      curr.role === 'user' &&
      prev.role === 'assistant' &&
      prev.timestamp &&
      curr.timestamp
    ) {
      pairs.push(curr.timestamp - prev.timestamp);
    }
  }

  if (pairs.length === 0) return null;

  const total = pairs.reduce((a, b) => a + b, 0);
  return Math.round(total / pairs.length);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function computeTrend(counts: number[]): ResponsePattern['trend'] {
  if (counts.length < 2) return 'stable';

  const first = counts[0];
  const last = counts[counts.length - 1];
  const delta = last - first;

  if (delta > 20) return 'expanding';
  if (delta < -20) return 'shrinking';
  return 'stable';
}

function containsAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

function countPhraseMatches(messages: Message[], phrases: string[]): number {
  const combined = messages.map((m) => m.content.toLowerCase()).join(' ');
  return countPhraseMatchesInText(combined, phrases);
}

function countPhraseMatchesInText(text: string, phrases: string[]): number {
  return phrases.filter((p) => text.includes(p)).length;
}

function detectKeywordRepetition(messages: Message[]): boolean {
  const wordFreq: Record<string, number> = {};
  const STOP_WORDS = new Set([
    'i', 'a', 'the', 'and', 'or', 'to', 'in', 'is', 'it',
    'of', 'that', 'my', 'we', 'was', 'for', 'on', 'are', 'with',
  ]);

  for (const msg of messages) {
    const words = msg.content.toLowerCase().split(/\s+/).filter(Boolean);
    for (const word of words) {
      if (word.length > 4 && !STOP_WORDS.has(word)) {
        wordFreq[word] = (wordFreq[word] ?? 0) + 1;
      }
    }
  }

  // Repeated 4+ times across messages = keyword repetition
  return Object.values(wordFreq).some((count) => count >= 4);
}

function emptyBehaviorProfile(): BehaviorProfile {
  return {
    responsePattern: {
      averageWordCount: 0,
      trend: 'stable',
      lastThreeWordCounts: [],
    },
    engagement: {
      asksQuestions: false,
      usesExamples: false,
      selfCorrects: false,
      hedgesFrequently: false,
      repeatsKeywords: false,
    },
    silenceRisk: 'low',
    deflectionCount: 0,
    overconfidenceSignals: 0,
    uncertaintySignals: 0,
    totalUserMessages: 0,
    averageResponseLatency: null,
  };
}

// ─── Derived Queries (used by pressure-selector + scoring) ───────────────────

/**
 * Is the candidate showing signs of overconfidence worth challenging?
 */
export function shouldChallengeOverconfidence(profile: BehaviorProfile): boolean {
  return profile.overconfidenceSignals >= 2;
}

/**
 * Is the candidate being evasive enough to warrant a follow-up pressure?
 */
export function isBeingEvasive(profile: BehaviorProfile): boolean {
  return profile.deflectionCount >= 1 || profile.engagement.hedgesFrequently;
}

/**
 * Is the candidate's engagement dropping and needs re-anchoring?
 */
export function isEngagementDropping(profile: BehaviorProfile): boolean {
  return (
    profile.silenceRisk !== 'low' ||
    profile.responsePattern.trend === 'shrinking'
  );
}

/**
 * Overall engagement score 0–100 for scoring layer.
 */
export function computeEngagementScore(profile: BehaviorProfile): number {
  let score = 50;

  if (profile.engagement.usesExamples) score += 15;
  if (profile.engagement.asksQuestions) score += 10;
  if (profile.engagement.selfCorrects) score += 10;
  if (profile.responsePattern.trend === 'expanding') score += 10;
  if (profile.responsePattern.trend === 'shrinking') score -= 15;
  if (profile.silenceRisk === 'high') score -= 20;
  if (profile.silenceRisk === 'medium') score -= 10;
  if (profile.engagement.hedgesFrequently) score -= 10;
  if (profile.deflectionCount >= 1) score -= 10;

  return Math.max(0, Math.min(100, score));
}
