// lib/barbaros/analysis/behavior/tier3-insights.ts
// CONTRACT: Tier3 deep analysis. Version 2.
// Changes from v1:
//   - buildPatterns now assigns patternCategory from signal types
//   - buildPatterns now assigns trendDirection from signal types
//   - Zero text matching for classification

import type { InterviewPhase } from '../../types';
import type {
  BehaviorInsight,
  BehaviorSignalType,
  PatternCategory,
  SessionBehaviorPattern,
  SignalConfidenceScore,
  Tier3InsightResult,
  TrendDirection,
  ValidatedSignal,
} from './behavior-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIGNALS_TO_SEND   = 8;
const MAX_EXISTING_INSIGHTS = 4;
const TIER3_MAX_TOKENS      = 900;
const PATTERN_MIN_OCCURRENCE      = 2;
const PATTERN_CROSS_PHASE_MIN     = 2;

// Signal → PatternCategory mapping (single source of truth)
const SIGNAL_TO_CATEGORY: Record<BehaviorSignalType, PatternCategory> = {
  response_shrinking:     'engagement',
  response_expanding:     'engagement',
  hedging_spike:          'confidence',
  engagement_drop:        'engagement',
  possible_deflection:    'evasion',
  topic_avoidance:        'evasion',
  vague_quantification:   'evasion',
  confidence_drop:        'confidence',
  overconfidence_spike:   'confidence',
  confidence_instability: 'confidence',
  possible_contradiction: 'credibility',
  inconsistent_framing:   'credibility',
  example_usage:          'depth',
  self_correction:        'depth',
  keyword_repetition:     'depth',
};

// Signal → TrendDirection mapping
// null = signal has no directional meaning
const SIGNAL_TO_TREND: Partial<Record<BehaviorSignalType, TrendDirection>> = {
  response_shrinking: 'shrinking',
  response_expanding: 'expanding',
  engagement_drop:    'shrinking',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Tier3AnalysisInput {
  validatedSignals: ValidatedSignal[];
  existingInsights: BehaviorInsight[];
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

// ─── LLM Adapter ─────────────────────────────────────────────────────────────
// TODO: extract to lib/barbaros/llm/behavior-llm-adapter.ts

async function runLLMCheck(
  system: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const { callClaude } = await import('../../llm/claude-client');
  return callClaude({ systemPrompt: system, userMessage: prompt, maxTokens });
}

// ─── Main Analyzer ────────────────────────────────────────────────────────────

export async function analyzeDeep(
  input: Tier3AnalysisInput
): Promise<Tier3InsightResult> {
  const { validatedSignals, existingInsights, existingPatterns, phase, now } = input;

  const confirmedSignals = validatedSignals
    .filter((s) => s.confirmed)
    .slice(-MAX_SIGNALS_TO_SEND);

  const recentInsights = existingInsights.slice(-MAX_EXISTING_INSIGHTS);

  if (confirmedSignals.length === 0) return emptyTier3Result(now);

  const system = buildSystemPrompt();
  const prompt = buildAnalysisPrompt(confirmedSignals, recentInsights, phase);

  let llmResponse: LLMInsightResponse;
  try {
    const raw  = await runLLMCheck(system, prompt, TIER3_MAX_TOKENS);
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
    confirmedSignals,
    phase,
    now
  );

  const allIndices = confirmedSignals.map((s) => s.messageIndex);

  return {
    insights:           newInsights,
    patternCandidates:  candidates,
    confirmedPatterns:  confirmed,
    analyzedAt:         now,
    sourceMessageIndices: [...new Set(allIndices)].sort((a, b) => a - b),
  };
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a deep behavioral analyst for a professional interview intelligence system.

Analyze validated behavioral signals and produce:
1. Behavioral insights — accumulated interpretations (NOT from single messages)
2. Pattern candidates — recurring behaviors worth tracking

Rules:
- Insights require evidence from at least 2 distinct signal types or message indices
- Only report what signals clearly support — be conservative
- Patterns must appear in 2+ signals or across phases
- Return ONLY valid JSON. No preamble, no markdown.
- evidence: short strings max 12 words each, 1-3 per insight
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
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed  = JSON.parse(cleaned) as LLMInsightResponse;

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
    .filter(meetsInsightThreshold)
    .map((i) => ({
      id:                   `insight_${slugify(i.topic)}_${now}_${Math.random().toString(36).slice(2, 6)}`,
      topic:                i.topic,
      description:          i.description,
      evidence:             i.evidence.slice(0, 3),
      sourceSignalTypes:    i.sourceSignalTypes as BehaviorSignalType[],
      sourceMessageIndices: [...new Set(i.sourceMessageIndices)],
      confidenceScore:      clampScore(i.confidenceScore),
      phase,
      generatedAt:          now,
    }));
}

function buildPatterns(
  rawCandidates: LLMInsightResponse['patternCandidates'],
  allInsights: BehaviorInsight[],
  existingPatterns: SessionBehaviorPattern[],
  confirmedSignals: ValidatedSignal[],
  phase: InterviewPhase,
  now: number
): { candidates: SessionBehaviorPattern[]; confirmed: SessionBehaviorPattern[] } {
  const candidates: SessionBehaviorPattern[] = [];
  const confirmed:  SessionBehaviorPattern[] = [];

  for (const raw of rawCandidates) {
    const matchedInsights = allInsights.filter((i) =>
      raw.sourceInsightTopics.includes(i.topic)
    );
    if (matchedInsights.length < PATTERN_MIN_OCCURRENCE) continue;

    const allPhases = [
      ...matchedInsights.map((i) => i.phase),
      ...(raw.phasesObserved as InterviewPhase[]),
    ];
    const uniquePhases       = [...new Set(allPhases)] as InterviewPhase[];
    const crossPhaseConfirmed = uniquePhases.length >= PATTERN_CROSS_PHASE_MIN;

    // Derive category and trend from signal types — zero text matching
    const relatedSignalTypes = matchedInsights.flatMap(
      (i) => i.sourceSignalTypes
    );
    const patternCategory  = inferPatternCategory(relatedSignalTypes);
    const trendDirection   = inferTrendDirection(relatedSignalTypes);

    const existing = existingPatterns.find(
      (p) => p.description.toLowerCase() === raw.description.toLowerCase()
    );

    if (existing) {
      const updated: SessionBehaviorPattern = {
        ...existing,
        occurrenceCount:      existing.occurrenceCount + 1,
        stabilityScore:       Math.min(1, existing.stabilityScore + 0.1),
        lastObservedAt:       now,
        lastConfirmedAt:      now,
        crossPhaseConfirmed:  existing.crossPhaseConfirmed || crossPhaseConfirmed,
        phasesObserved:       [...new Set([...existing.phasesObserved, phase])],
        sourceInsightIds:     [...new Set([...existing.sourceInsightIds, ...matchedInsights.map((i) => i.id)])],
        patternCategory,
        trendDirection,
      };
      crossPhaseConfirmed ? confirmed.push(updated) : candidates.push(updated);
    } else {
      const pattern: SessionBehaviorPattern = {
        id:                  `pattern_${slugify(raw.description)}_${now}_${Math.random().toString(36).slice(2, 6)}`,
        description:         raw.description,
        patternCategory,
        trendDirection,
        sourceInsightIds:    matchedInsights.map((i) => i.id),
        confidenceScore:     clampScore(raw.confidenceScore),
        stabilityScore:      0.3,
        decayCount:          0,
        occurrenceCount:     matchedInsights.length,
        crossPhaseConfirmed,
        phasesObserved:      uniquePhases,
        firstObservedAt:     now,
        lastObservedAt:      now,
        lastConfirmedAt:     now,
        persistence:         'session',
      };
      crossPhaseConfirmed ? confirmed.push(pattern) : candidates.push(pattern);
    }
  }

  return { candidates, confirmed };
}

// ─── Category + Trend Inference (zero text matching) ─────────────────────────

/**
 * Infer PatternCategory from the most frequent signal category.
 * Falls back to 'engagement' if no signals found.
 */
function inferPatternCategory(
  signalTypes: BehaviorSignalType[]
): PatternCategory {
  if (signalTypes.length === 0) return 'engagement';

  const counts = new Map<PatternCategory, number>();
  for (const type of signalTypes) {
    const cat = SIGNAL_TO_CATEGORY[type];
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  return [...counts.entries()].reduce(
    (best, [cat, count]) => (count > best[1] ? [cat, count] : best),
    ['engagement', 0] as [PatternCategory, number]
  )[0];
}

/**
 * Infer TrendDirection from signal types.
 * Returns null if no directional signals found.
 */
function inferTrendDirection(
  signalTypes: BehaviorSignalType[]
): TrendDirection | null {
  const counts: Record<TrendDirection, number> = {
    shrinking: 0,
    expanding: 0,
    stable:    0,
  };

  for (const type of signalTypes) {
    const trend = SIGNAL_TO_TREND[type];
    if (trend) counts[trend]++;
  }

  // Dominant direction wins
  if (counts.shrinking > counts.expanding) return 'shrinking';
  if (counts.expanding > counts.shrinking) return 'expanding';
  if (counts.shrinking > 0 || counts.expanding > 0) return 'stable';
  return null;
}

// ─── Insight Threshold (contract) ────────────────────────────────────────────

function meetsInsightThreshold(
  i: LLMInsightResponse['insights'][0]
): boolean {
  const hasMultipleIndices  = i.sourceMessageIndices.length >= 2;
  const hasMultipleSignals  = i.sourceSignalTypes.length >= 2;
  const hasEvidence         = i.evidence.length >= 1;
  return (hasMultipleIndices || hasMultipleSignals) && hasEvidence;
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function emptyTier3Result(now: number): Tier3InsightResult {
  return {
    insights:             [],
    patternCandidates:    [],
    confirmedPatterns:    [],
    analyzedAt:           now,
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

// ─── Derived Queries ──────────────────────────────────────────────────────────

export function getStrongInsights(
  result: Tier3InsightResult,
  threshold = 0.65
): BehaviorInsight[] {
  return result.insights.filter((i) => i.confidenceScore >= threshold);
}

export function getLongitudinalReadyPatterns(
  result: Tier3InsightResult
): SessionBehaviorPattern[] {
  return result.confirmedPatterns.filter((p) => p.crossPhaseConfirmed);
}

export function getActiveInsightTopics(result: Tier3InsightResult): string[] {
  return [...new Set(result.insights.map((i) => i.topic))];
}

export function computeTier3Confidence(result: Tier3InsightResult): number {
  if (result.insights.length === 0) return 0;
  const total = result.insights.reduce((sum, i) => sum + i.confidenceScore, 0);
  return Math.round((total / result.insights.length) * 100) / 100;
}
