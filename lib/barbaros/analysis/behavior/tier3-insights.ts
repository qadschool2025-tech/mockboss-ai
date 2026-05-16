// lib/barbaros/analysis/behavior/tier3-insights.ts
// CONTRACT: Tier3 deep analysis. Produces insights and pattern candidates.
// Consumes: ValidatedSignal[] + existing insights (NOT raw messages directly)
// Produces: Tier3InsightResult (insights, patternCandidates, confirmedPatterns)
//
// Rules:
//   - Only confirmed ValidatedSignals reach this layer
//   - Insights require evidence from 2+ signals or 2+ message indices
//   - Patterns require 2+ insights OR cross-phase confirmation
//   - All time ops take `now: number`
//   - LLM call is deep but bounded (MAX_SIGNALS_TO_SEND)

import type { InterviewPhase } from '../../types';
import type {
  BehaviorInsight,
  BehaviorSignalType,
  SessionBehaviorPattern,
  SignalConfidenceScore,
  Tier3InsightResult,
  ValidatedSignal,
} from './behavior-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIGNALS_TO_SEND = 8;        // cap LLM input
const MAX_EXISTING_INSIGHTS = 4;      // recent context only
const TIER3_MAX_TOKENS = 900;
const PATTERN_MIN_OCCURRENCE = 2;
const PATTERN_CROSS_PHASE_MIN = 2;    // distinct phases needed for crossPhaseConfirmed

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Tier3AnalysisInput {
  validatedSignals: ValidatedSignal[];     // confirmed only
  existingInsights: BehaviorInsight[];     // session insights so far
  existingPatterns: SessionBehaviorPattern[];
  phase: InterviewPhase;
  now: number;
}

interface LLMInsightResponse {
  insights: Array<{
    topic: string;
    description: string;
    evidence: string[];
    sourceSignalTypes: string[];
    sourceMessageIndices: number[];
    confidenceScore: number;
  }>;
  patternCandidates: Array<{
    description: string;
    sourceInsightTopics: string[];
    confidenceScore: number;
    phasesObserved: string[];
  }>;
}

// ─── LLM Adapter (local wrapper) ─────────────────────────────────────────────
// TODO: extract to lib/barbaros/llm/behavior-llm-adapter.ts
// when claude-client interface stabilizes

async function runLLMCheck(
  system: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const { callClaude } = await import('../../llm/claude-client');
  const result = await callClaude({ systemPrompt: system, userMessage: prompt, maxTokens });
  return result;
}

// ─── Main Analyzer ────────────────────────────────────────────────────────────

export async function analyzeDeep(
  input: Tier3AnalysisInput
): Promise<Tier3InsightResult> {
  const { validatedSignals, existingInsights, existingPatterns, phase, now } = input;

  // Only confirmed signals reach Tier3
  const confirmedSignals = validatedSignals
    .filter((s) => s.confirmed)
    .slice(-MAX_SIGNALS_TO_SEND);

  const recentInsights = existingInsights.slice(-MAX_EXISTING_INSIGHTS);

  if (confirmedSignals.length === 0) {
    return emptyTier3Result(now);
  }

  const system = buildSystemPrompt();
  const prompt = buildAnalysisPrompt(confirmedSignals, recentInsights, phase);

  let llmResponse: LLMInsightResponse;

  try {
    const raw = await runLLMCheck(system, prompt, TIER3_MAX_TOKENS);
    llmResponse = parseInsightResponse(raw);
  } catch {
    return emptyTier3Result(now);
  }

  const newInsights = buildInsights(llmResponse.insights, phase, now);
  const allInsights = [...existingInsights, ...newInsights];

  const { candidates, confirmed } = buildPatterns(
    llmResponse.patternCandidates,
    allInsights,
    existingPatterns,
    phase,
    now
  );

  const allIndices = confirmedSignals.flatMap((s) => [s.messageIndex]);

  return {
    insights: newInsights,
    patternCandidates: candidates,
    confirmedPatterns: confirmed,
    analyzedAt: now,
    sourceMessageIndices: [...new Set(allIndices)].sort((a, b) => a - b),
  };
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a deep behavioral analyst for a professional interview intelligence system.

Your task: analyze validated behavioral signals from a candidate interview and produce:
1. Behavioral insights — accumulated interpretations (NOT from single messages)
2. Pattern candidates — recurring behaviors worth tracking

Rules:
- Insights require evidence from at least 2 distinct signal types or message indices
- Be conservative: only report what the signals clearly support
- Patterns must appear in 2+ signals or across phases to be candidates
- Return ONLY valid JSON. No preamble, no markdown, no explanation outside JSON.
- evidence: short strings, max 12 words each, 1-3 per insight
- confidenceScore: 0.0 to 1.0`;
}

function buildAnalysisPrompt(
  signals: ValidatedSignal[],
  existingInsights: BehaviorInsight[],
  phase: InterviewPhase
): string {
  const signalBlock = signals
    .map((s) =>
      `- Type: ${s.signalType} | Severity: ${s.severity} | Score: ${s.confidenceScore} | Msg#: ${s.messageIndex} | Evidence: ${s.evidence.join('; ')}`
    )
    .join('\n');

  const insightBlock = existingInsights.length > 0
    ? existingInsights
        .map((i) => `- [${i.topic}] ${i.description} (confidence: ${i.confidenceScore})`)
        .join('\n')
    : 'None yet.';

  return `Interview phase: ${phase}

VALIDATED SIGNALS (confirmed by Tier2):
${signalBlock}

EXISTING INSIGHTS (session so far):
${insightBlock}

Produce this exact JSON:
{
  "insights": [
    {
      "topic": "<short topic label>",
      "description": "<1-2 sentence behavioral interpretation>",
      "evidence": ["<evidence string>"],
      "sourceSignalTypes": ["<signal type>"],
      "sourceMessageIndices": [<number>],
      "confidenceScore": 0.0-1.0
    }
  ],
  "patternCandidates": [
    {
      "description": "<pattern description>",
      "sourceInsightTopics": ["<topic>"],
      "confidenceScore": 0.0-1.0,
      "phasesObserved": ["<phase>"]
    }
  ]
}

Return empty arrays if insufficient evidence. Never invent patterns.`;
}

// ─── Response Parser ──────────────────────────────────────────────────────────

function parseInsightResponse(raw: string): LLMInsightResponse {
  const cleaned = raw
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  const parsed = JSON.parse(cleaned) as LLMInsightResponse;

  if (!Array.isArray(parsed.insights) || !Array.isArray(parsed.patternCandidates)) {
    throw new Error('Invalid Tier3 response shape');
  }

  return parsed;
}

// ─── Output Builders ──────────────────────────────────────────────────────────

function buildInsights(
  raw: LLMInsightResponse['insights'],
  phase: InterviewPhase,
  now: number
): BehaviorInsight[] {
  return raw
    .filter((i) => i.sourceMessageIndices.length >= 1 && i.evidence.length >= 1)
    .map((i) => ({
      id: `insight_${slugify(i.topic)}_${now}_${Math.random().toString(36).slice(2, 6)}`,
      topic: i.topic,
      description: i.description,
      evidence: i.evidence.slice(0, 3),
      sourceSignalTypes: i.sourceSignalTypes as BehaviorSignalType[],
      sourceMessageIndices: [...new Set(i.sourceMessageIndices)],
      confidenceScore: clampScore(i.confidenceScore),
      phase,
      generatedAt: now,
    }));
}

function buildPatterns(
  rawCandidates: LLMInsightResponse['patternCandidates'],
  allInsights: BehaviorInsight[],
  existingPatterns: SessionBehaviorPattern[],
  phase: InterviewPhase,
  now: number
): { candidates: SessionBehaviorPattern[]; confirmed: SessionBehaviorPattern[] } {
  const candidates: SessionBehaviorPattern[] = [];
  const confirmed: SessionBehaviorPattern[] = [];

  for (const raw of rawCandidates) {
    // Find matching insights by topic
    const matchedInsights = allInsights.filter((i) =>
      raw.sourceInsightTopics.includes(i.topic)
    );

    if (matchedInsights.length < PATTERN_MIN_OCCURRENCE) continue;

    // Collect phases from matched insights + raw response
    const allPhases = [
      ...matchedInsights.map((i) => i.phase),
      ...(raw.phasesObserved as InterviewPhase[]),
    ];
    const uniquePhases = [...new Set(allPhases)] as InterviewPhase[];
    const crossPhaseConfirmed = uniquePhases.length >= PATTERN_CROSS_PHASE_MIN;

    // Check if pattern already exists (update vs create)
    const existing = existingPatterns.find(
      (p) => p.description.toLowerCase() === raw.description.toLowerCase()
    );

    if (existing) {
      // Strengthen existing pattern
      const updated: SessionBehaviorPattern = {
        ...existing,
        occurrenceCount: existing.occurrenceCount + 1,
        stabilityScore: Math.min(1, existing.stabilityScore + 0.1),
        lastObservedAt: now,
        lastConfirmedAt: now,
        crossPhaseConfirmed: existing.crossPhaseConfirmed || crossPhaseConfirmed,
        phasesObserved: [...new Set([...existing.phasesObserved, phase])],
        sourceInsightIds: [
          ...new Set([...existing.sourceInsightIds, ...matchedInsights.map((i) => i.id)]),
        ],
      };

      crossPhaseConfirmed ? confirmed.push(updated) : candidates.push(updated);
    } else {
      // Create new pattern
      const pattern: SessionBehaviorPattern = {
        id: `pattern_${slugify(raw.description)}_${now}_${Math.random().toString(36).slice(2, 6)}`,
        description: raw.description,
        sourceInsightIds: matchedInsights.map((i) => i.id),
        confidenceScore: clampScore(raw.confidenceScore),
        stabilityScore: 0.3,            // starts low — must be earned
        decayCount: 0,
        occurrenceCount: matchedInsights.length,
        crossPhaseConfirmed,
        phasesObserved: uniquePhases,
        firstObservedAt: now,
        lastObservedAt: now,
        lastConfirmedAt: now,
        persistence: 'session',
      };

      crossPhaseConfirmed ? confirmed.push(pattern) : candidates.push(pattern);
    }
  }

  return { candidates, confirmed };
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function emptyTier3Result(now: number): Tier3InsightResult {
  return {
    insights: [],
    patternCandidates: [],
    confirmedPatterns: [],
    analyzedAt: now,
    sourceMessageIndices: [],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampScore(score: unknown): SignalConfidenceScore {
  const n = typeof score === 'number' ? score : 0;
  return Math.max(0, Math.min(1, n));
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

// ─── Derived Queries (used by orchestrator) ───────────────────────────────────

/**
 * High-confidence insights only — for immediate prompt influence.
 */
export function getStrongInsights(
  result: Tier3InsightResult,
  threshold = 0.65
): BehaviorInsight[] {
  return result.insights.filter((i) => i.confidenceScore >= threshold);
}

/**
 * Cross-phase confirmed patterns — ready for longitudinal layer.
 */
export function getLongitudinalReadyPatterns(
  result: Tier3InsightResult
): SessionBehaviorPattern[] {
  return result.confirmedPatterns.filter((p) => p.crossPhaseConfirmed);
}

/**
 * Topics with active insights — for prompt-builder context injection.
 */
export function getActiveInsightTopics(
  result: Tier3InsightResult
): string[] {
  return [...new Set(result.insights.map((i) => i.topic))];
}

/**
 * Overall insight confidence for this Tier3 run (0-1).
 */
export function computeTier3Confidence(
  result: Tier3InsightResult
): number {
  if (result.insights.length === 0) return 0;
  const total = result.insights.reduce((sum, i) => sum + i.confidenceScore, 0);
  return Math.round((total / result.insights.length) * 100) / 100;
}
