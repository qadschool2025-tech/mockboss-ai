
// lib/barbaros/analysis/behavior/tier1-scanner.ts
// CONTRACT: Tier1 heuristic scanner. Fast, synchronous, zero LLM calls.
// Produces signals and ephemeral risks only. No decisions. No storage.
// All observations are noisy — Tier2 confirms, Tier3 interprets.

import type { Message, InterviewPhase } from '../../types';
import type {
  BehaviorSignal,
  BehaviorSignalType,
  RiskIndicator,
  RiskType,
  SignalSeverity,
  Tier1ScanResult,
} from './behavior-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const HEDGE_PHRASES = [
  'i think', 'i believe', 'maybe', 'perhaps', 'possibly',
  'not sure', 'i guess', "i'm not certain", 'kind of', 'sort of',
  'it depends', 'i might', 'probably', 'i suppose',
];

const DEFLECTION_PHRASES = [
  "i'd rather not", 'skip that', "i don't want to", 'next question',
  'can we move on', 'pass', "i'd prefer not", 'not applicable',
  "that's not relevant", "i'd rather focus",
];

const OVERCONFIDENCE_PHRASES = [
  'always succeed', 'never fail', 'best in', 'perfect record',
  'flawless', 'no one better', 'guaranteed results', 'always the best',
  'i never make mistakes', 'i always deliver',
];

const VAGUE_QUANTIFICATION_PHRASES = [
  'some improvement', 'a lot of', 'many times', 'quite a few',
  'significantly', 'a bunch of', 'tons of', 'a lot more',
  'much better', 'way more', 'huge impact',
];

const SELF_CORRECTION_PHRASES = [
  'actually', 'let me rephrase', 'what i meant', 'to clarify',
  'more precisely', 'correction', 'i should say', 'let me be clear',
];

const SHORT_RESPONSE_WORDS = 20;
const SHRINK_DELTA = -20;           // word count drop across last 3 messages
const EXPAND_DELTA = 20;
const HEDGE_SPIKE_THRESHOLD = 3;    // hedge phrases in one message
const HIGH_CONFIDENCE_THRESHOLD = 0.75;

// ─── Main Scanner ─────────────────────────────────────────────────────────────

export function scanMessage(
  message: Message,
  messageIndex: number,
  recentMessages: Message[],  // last N messages for trend analysis
  phase: InterviewPhase,
  now: number
): Tier1ScanResult {
  const signals: BehaviorSignal[] = [];
  const text = message.content.toLowerCase();
  const wordCount = countWords(message.content);

  // ── Engagement signals ──────────────────────────────────────────────────────

  const shrinkSignal = detectResponseShrinking(
    wordCount, recentMessages, messageIndex, phase, now
  );
  if (shrinkSignal) signals.push(shrinkSignal);

  const expandSignal = detectResponseExpanding(
    wordCount, recentMessages, messageIndex, phase, now
  );
  if (expandSignal) signals.push(expandSignal);

  const hedgeSignal = detectHedgingSpike(
    text, messageIndex, phase, now
  );
  if (hedgeSignal) signals.push(hedgeSignal);

  // ── Evasion signals ─────────────────────────────────────────────────────────

  const deflectionSignal = detectDeflection(
    text, messageIndex, phase, now
  );
  if (deflectionSignal) signals.push(deflectionSignal);

  const vagueSignal = detectVagueQuantification(
    text, messageIndex, phase, now
  );
  if (vagueSignal) signals.push(vagueSignal);

  // ── Confidence signals ──────────────────────────────────────────────────────

  const overconfidenceSignal = detectOverconfidence(
    text, messageIndex, phase, now
  );
  if (overconfidenceSignal) signals.push(overconfidenceSignal);

  const confidenceDropSignal = detectConfidenceDrop(
    wordCount, text, messageIndex, phase, now
  );
  if (confidenceDropSignal) signals.push(confidenceDropSignal);

  // ── Depth signals ───────────────────────────────────────────────────────────

  const exampleSignal = detectExampleUsage(
    text, messageIndex, phase, now
  );
  if (exampleSignal) signals.push(exampleSignal);

  const selfCorrectionSignal = detectSelfCorrection(
    text, messageIndex, phase, now
  );
  if (selfCorrectionSignal) signals.push(selfCorrectionSignal);

  // ── Derive risks from signals (ephemeral) ───────────────────────────────────

  const risks = deriveRisks(signals, wordCount, recentMessages, phase, now);

  return {
    signals,
    risks,
    scannedAt: now,
    messageIndex,
  };
}

// ─── Signal Detectors ─────────────────────────────────────────────────────────

function detectResponseShrinking(
  currentWordCount: number,
  recentMessages: Message[],
  messageIndex: number,
  phase: InterviewPhase,
  now: number
): BehaviorSignal | null {
  const userMessages = recentMessages
    .filter((m) => m.role === 'user')
    .slice(-3);

  if (userMessages.length < 2) return null;

  const counts = userMessages.map((m) => countWords(m.content));
  const delta = currentWordCount - counts[0];

  if (delta > SHRINK_DELTA) return null;

  const severity: SignalSeverity = delta < -40 ? 'high' : delta < -25 ? 'medium' : 'low';
  const confidenceScore = severity === 'high' ? 0.7 : severity === 'medium' ? 0.55 : 0.35;

  return makeSignal(
    'response_shrinking', severity, confidenceScore,
    messageIndex, phase, now,
    `Word count dropped from ~${counts[0]} to ${currentWordCount}`
  );
}

function detectResponseExpanding(
  currentWordCount: number,
  recentMessages: Message[],
  messageIndex: number,
  phase: InterviewPhase,
  now: number
): BehaviorSignal | null {
  const userMessages = recentMessages
    .filter((m) => m.role === 'user')
    .slice(-3);

  if (userMessages.length < 2) return null;

  const counts = userMessages.map((m) => countWords(m.content));
  const delta = currentWordCount - counts[0];

  if (delta < EXPAND_DELTA) return null;

  return makeSignal(
    'response_expanding', 'low', 0.6,
    messageIndex, phase, now,
    `Word count grew from ~${counts[0]} to ${currentWordCount}`
  );
}

function detectHedgingSpike(
  text: string,
  messageIndex: number,
  phase: InterviewPhase,
  now: number
): BehaviorSignal | null {
  const matches = HEDGE_PHRASES.filter((p) => text.includes(p));
  if (matches.length < 2) return null;

  const severity: SignalSeverity =
    matches.length >= HEDGE_SPIKE_THRESHOLD ? 'high' : 'medium';
  const confidenceScore = matches.length >= HEDGE_SPIKE_THRESHOLD ? 0.72 : 0.5;

  return makeSignal(
    'hedging_spike', severity, confidenceScore,
    messageIndex, phase, now,
    `Hedge phrases: ${matches.slice(0, 3).join(', ')}`
  );
}

function detectDeflection(
  text: string,
  messageIndex: number,
  phase: InterviewPhase,
  now: number
): BehaviorSignal | null {
  const match = DEFLECTION_PHRASES.find((p) => text.includes(p));
  if (!match) return null;

  return makeSignal(
    'possible_deflection', 'high', 0.68,
    messageIndex, phase, now,
    `Deflection phrase: "${match}"`
  );
}

function detectVagueQuantification(
  text: string,
  messageIndex: number,
  phase: InterviewPhase,
  now: number
): BehaviorSignal | null {
  const matches = VAGUE_QUANTIFICATION_PHRASES.filter((p) => text.includes(p));
  if (matches.length < 2) return null;

  return makeSignal(
    'vague_quantification', 'medium', 0.5,
    messageIndex, phase, now,
    `Vague phrases: ${matches.slice(0, 2).join(', ')}`
  );
}

function detectOverconfidence(
  text: string,
  messageIndex: number,
  phase: InterviewPhase,
  now: number
): BehaviorSignal | null {
  const matches = OVERCONFIDENCE_PHRASES.filter((p) => text.includes(p));
  if (matches.length === 0) return null;

  const severity: SignalSeverity = matches.length >= 2 ? 'high' : 'medium';
  const confidenceScore = matches.length >= 2 ? 0.65 : 0.45;

  return makeSignal(
    'overconfidence_spike', severity, confidenceScore,
    messageIndex, phase, now,
    `Overconfidence: "${matches[0]}"`
  );
}

function detectConfidenceDrop(
  wordCount: number,
  text: string,
  messageIndex: number,
  phase: InterviewPhase,
  now: number
): BehaviorSignal | null {
  const isShort = wordCount < SHORT_RESPONSE_WORDS;
  const hasHedge = HEDGE_PHRASES.some((p) => text.includes(p));

  if (!isShort || !hasHedge) return null;

  return makeSignal(
    'confidence_drop', 'medium', 0.55,
    messageIndex, phase, now,
    `Short response (${wordCount}w) combined with hedging`
  );
}

function detectExampleUsage(
  text: string,
  messageIndex: number,
  phase: InterviewPhase,
  now: number
): BehaviorSignal | null {
  const hasExample =
    /for example|for instance|such as|one time|once i|when i was|a situation where/.test(text);

  if (!hasExample) return null;

  return makeSignal(
    'example_usage', 'low', 0.8,
    messageIndex, phase, now,
    'Candidate used a concrete example'
  );
}

function detectSelfCorrection(
  text: string,
  messageIndex: number,
  phase: InterviewPhase,
  now: number
): BehaviorSignal | null {
  const match = SELF_CORRECTION_PHRASES.find((p) => text.includes(p));
  if (!match) return null;

  return makeSignal(
    'self_correction', 'low', 0.7,
    messageIndex, phase, now,
    `Self-correction phrase: "${match}"`
  );
}

// ─── Risk Derivation (ephemeral) ──────────────────────────────────────────────

function deriveRisks(
  signals: BehaviorSignal[],
  currentWordCount: number,
  recentMessages: Message[],
  phase: InterviewPhase,
  now: number
): RiskIndicator[] {
  const risks: RiskIndicator[] = [];

  // silence_risk: shrinking + short response
  const shrinking = signals.find((s) => s.type === 'response_shrinking');
  const confidenceDrop = signals.find((s) => s.type === 'confidence_drop');

  if (shrinking && currentWordCount < SHORT_RESPONSE_WORDS) {
    risks.push(makeRisk('silence_risk', 'high', [shrinking, confidenceDrop].filter(Boolean) as BehaviorSignal[], phase, now));
  } else if (shrinking || confidenceDrop) {
    risks.push(makeRisk('silence_risk', 'medium', [shrinking, confidenceDrop].filter(Boolean) as BehaviorSignal[], phase, now));
  }

  // credibility_risk: overconfidence + possible_contradiction
  const overconfidence = signals.find((s) => s.type === 'overconfidence_spike');
  const contradiction = signals.find((s) => s.type === 'possible_contradiction');

  if (overconfidence && contradiction) {
    risks.push(makeRisk('credibility_risk', 'high', [overconfidence, contradiction], phase, now));
  } else if (overconfidence && overconfidence.severity === 'high') {
    risks.push(makeRisk('overconfidence_risk', 'medium', [overconfidence], phase, now));
  }

  // evasion_risk: deflection + vague quantification together
  const deflection = signals.find((s) => s.type === 'possible_deflection');
  const vague = signals.find((s) => s.type === 'vague_quantification');

  if (deflection) {
    const severity: SignalSeverity = vague ? 'high' : 'medium';
    risks.push(makeRisk('evasion_risk', severity, [deflection, vague].filter(Boolean) as BehaviorSignal[], phase, now));
  }

  // dropout_risk: engagement_drop + shrinking + hedging all together
  const hedging = signals.find((s) => s.type === 'hedging_spike');
  if (shrinking && hedging && currentWordCount < SHORT_RESPONSE_WORDS) {
    risks.push(makeRisk('dropout_risk', 'high', [shrinking, hedging], phase, now));
  }

  return risks;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSignal(
  type: BehaviorSignalType,
  severity: SignalSeverity,
  confidenceScore: number,
  messageIndex: number,
  phase: InterviewPhase,
  now: number,
  rawEvidence: string
): BehaviorSignal {
  return {
    id: `sig_${type}_${messageIndex}_${now}`,
    type,
    severity,
    confidenceScore,
    messageIndex,
    detectedAt: now,
    phase,
    rawEvidence,
  };
}

function makeRisk(
  type: RiskType,
  severity: SignalSeverity,
  triggerSignals: BehaviorSignal[],
  phase: InterviewPhase,
  now: number
): RiskIndicator {
  return {
    id: `risk_${type}_${now}`,
    type,
    severity,
    triggeredBy: triggerSignals.map((s) => ({
      type: s.type,
      severity: s.severity,
      validated: false,   // tier1 = unvalidated by definition
    })),
    detectedAt: now,
    phase,
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Derived Queries (used by escalation-policy) ─────────────────────────────

/**
 * Highest confidence signal in a scan result.
 * Used by escalation-policy to decide Tier2 threshold.
 */
export function getHighestConfidenceSignal(
  result: Tier1ScanResult
): BehaviorSignal | null {
  if (result.signals.length === 0) return null;
  return result.signals.reduce((best, s) =>
    s.confidenceScore > best.confidenceScore ? s : best
  );
}

/**
 * True if any signal exceeds the high-confidence threshold.
 */
export function hasHighConfidenceSignal(result: Tier1ScanResult): boolean {
  return result.signals.some(
    (s) => s.confidenceScore >= HIGH_CONFIDENCE_THRESHOLD
  );
}

/**
 * True if multiple risk types are active simultaneously (composite risk).
 */
export function hasCompositeRisk(result: Tier1ScanResult): boolean {
  return result.risks.length >= 2;
}
