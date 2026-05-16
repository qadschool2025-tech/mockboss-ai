
// lib/barbaros/analysis/behavior/tier2-validator.ts
// CONTRACT: Tier2 LLM spot-check validator.
// Receives: targeted signals + max 3 recent messages
// Produces: ValidatedSignal[] (decoupled from BehaviorSignal shape)
// Rules:
//   - Never makes escalation decisions
//   - Never reads full message history
//   - Never embeds BehaviorSignal objects in output
//   - LLM call is targeted and minimal (3 messages max)
//   - All time ops take `now: number`

import type { Message, InterviewPhase } from '../../types';
import type {
  BehaviorSignal,
  BehaviorSignalType,
  RiskIndicator,
  RiskType,
  SignalSeverity,
  Tier2ValidationResult,
  ValidatedSignal,
} from './behavior-types';
import { callClaude } from '../../llm/claude-client';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_MESSAGES_TO_SEND = 3;
const VALIDATION_MAX_TOKENS = 600;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Tier2ValidationInput {
  signals: BehaviorSignal[];          // signals to validate (from escalation decision)
  recentMessages: Message[];          // MUST be pre-sliced to max 3 by orchestrator
  phase: InterviewPhase;
  now: number;
}

interface LLMValidationResponse {
  validations: Array<{
    signalId: string;
    signalType: string;
    confirmed: boolean;
    severity: SignalSeverity;
    confidenceScore: number;          // 0-1
    evidence: string[];
  }>;
  newRisks: Array<{
    type: RiskType;
    severity: SignalSeverity;
    relatedSignalTypes: BehaviorSignalType[];
  }> | null;
}

// ─── Main Validator ───────────────────────────────────────────────────────────

export async function validateSignals(
  input: Tier2ValidationInput,
  now: number
): Promise<Tier2ValidationResult> {
  const { signals, recentMessages, phase } = input;

  // Enforce message limit — orchestrator slices, but we guard here too
  const messagesToAnalyze = recentMessages.slice(-MAX_MESSAGES_TO_SEND);

  const prompt = buildValidationPrompt(signals, messagesToAnalyze, phase);

  let llmResponse: LLMValidationResponse;

  try {
    const raw = await callClaude({
      systemPrompt: buildSystemPrompt(),
      userMessage: prompt,
      maxTokens: VALIDATION_MAX_TOKENS,
    });

    llmResponse = parseValidationResponse(raw);
  } catch {
    // Graceful degradation: if LLM fails, mark all signals unconfirmed
    return buildFallbackResult(signals, now);
  }

  const validatedSignals = buildValidatedSignals(
    signals,
    llmResponse.validations,
    now,
    phase
  );

  const newRisks = buildNewRisks(
    llmResponse.newRisks ?? [],
    signals,
    phase,
    now
  );

  return {
    validatedSignals,
    newRisks,
    validatedAt: now,
    messagesConsidered: messagesToAnalyze.length,
  };
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a behavioral signal validator for a professional interview assessment system.

Your task: analyze recent interview messages and validate whether specific behavioral signals are genuine.

Rules:
- Be precise and conservative. Only confirm a signal if evidence is clear.
- Return ONLY valid JSON matching the specified schema. No preamble, no markdown.
- evidence must be short strings (max 15 words each), 1-3 per signal.
- confidenceScore: 0.0 to 1.0 (float).
- newRisks: only include if you observe something NOT covered by the signals provided.`;
}

function buildValidationPrompt(
  signals: BehaviorSignal[],
  messages: Message[],
  phase: InterviewPhase
): string {
  const signalDescriptions = signals
    .map((s) => `- ID: ${s.id} | Type: ${s.type} | Severity: ${s.severity} | Evidence: "${s.rawEvidence}"`)
    .join('\n');

  const messageHistory = messages
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content.trim()}`)
    .join('\n\n');

  return `Interview phase: ${phase}

SIGNALS TO VALIDATE:
${signalDescriptions}

RECENT MESSAGES (last ${messages.length}):
${messageHistory}

Respond with this exact JSON structure:
{
  "validations": [
    {
      "signalId": "<exact signal id>",
      "signalType": "<exact signal type>",
      "confirmed": true or false,
      "severity": "low" | "medium" | "high",
      "confidenceScore": 0.0-1.0,
      "evidence": ["<short evidence string>"]
    }
  ],
  "newRisks": null or [
    {
      "type": "silence_risk" | "credibility_risk" | "dropout_risk" | "overconfidence_risk" | "evasion_risk",
      "severity": "low" | "medium" | "high",
      "relatedSignalTypes": ["<signal type>"]
    }
  ]
}`;
}

// ─── Response Parser ──────────────────────────────────────────────────────────

function parseValidationResponse(raw: string): LLMValidationResponse {
  const cleaned = raw
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  const parsed = JSON.parse(cleaned) as LLMValidationResponse;

  // Validate shape minimally
  if (!Array.isArray(parsed.validations)) {
    throw new Error('Invalid LLM response: missing validations array');
  }

  return parsed;
}

// ─── Output Builders ──────────────────────────────────────────────────────────

function buildValidatedSignals(
  originalSignals: BehaviorSignal[],
  validations: LLMValidationResponse['validations'],
  now: number,
  phase: InterviewPhase
): ValidatedSignal[] {
  const validationMap = new Map(
    validations.map((v) => [v.signalId, v])
  );

  return originalSignals.map((signal) => {
    const validation = validationMap.get(signal.id);

    if (!validation) {
      // LLM didn't return this signal — treat as unconfirmed
      return buildUnconfirmedSignal(signal, now, phase);
    }

    return {
      id: `vs_${signal.id}_${now}`,
      signalId: signal.id,                          // reference only — no embedding
      signalType: signal.type,
      originalConfidenceScore: signal.confidenceScore,

      confirmed: validation.confirmed,
      severity: validation.severity,
      confidenceScore: clampScore(validation.confidenceScore),

      messageIndex: signal.messageIndex,
      evidence: Array.isArray(validation.evidence)
        ? validation.evidence.slice(0, 3)           // max 3 evidence strings
        : [],
      validatedAt: now,
      validationPhase: phase,
    };
  });
}

function buildNewRisks(
  rawRisks: NonNullable<LLMValidationResponse['newRisks']>,
  signals: BehaviorSignal[],
  phase: InterviewPhase,
  now: number
): RiskIndicator[] {
  return rawRisks.map((r) => ({
    id: `risk_tier2_${r.type}_${now}_${Math.random().toString(36).slice(2, 6)}`,
    type: r.type,
    severity: r.severity,
    triggeredBy: r.relatedSignalTypes.map((type) => {
      const matchedSignal = signals.find((s) => s.type === type);
      return {
        type: type as BehaviorSignalType,
        severity: matchedSignal?.severity ?? 'medium',
        validated: true,               // tier2-discovered = validated by definition
      };
    }),
    detectedAt: now,
    phase,
  }));
}

function buildUnconfirmedSignal(
  signal: BehaviorSignal,
  now: number,
  phase: InterviewPhase
): ValidatedSignal {
  return {
    id: `vs_${signal.id}_${now}`,
    signalId: signal.id,
    signalType: signal.type,
    originalConfidenceScore: signal.confidenceScore,
    confirmed: false,
    severity: signal.severity,
    confidenceScore: signal.confidenceScore * 0.5,  // penalize unconfirmed
    messageIndex: signal.messageIndex,
    evidence: [],
    validatedAt: now,
    validationPhase: phase,
  };
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

/**
 * Called when LLM fails. Marks all signals as unconfirmed.
 * Interview continues — no blocking on LLM error.
 */
function buildFallbackResult(
  signals: BehaviorSignal[],
  now: number
): Tier2ValidationResult {
  return {
    validatedSignals: signals.map((s) =>
      buildUnconfirmedSignal(s, now, 'opening') // phase unknown in fallback
    ),
    newRisks: [],
    validatedAt: now,
    messagesConsidered: 0,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampScore(score: unknown): number {
  const n = typeof score === 'number' ? score : 0;
  return Math.max(0, Math.min(1, n));
}

// ─── Derived Queries (used by orchestrator) ───────────────────────────────────

/**
 * Confirmed signals only — for scoring and longitudinal.
 */
export function getConfirmedSignals(
  result: Tier2ValidationResult
): ValidatedSignal[] {
  return result.validatedSignals.filter((s) => s.confirmed);
}

/**
 * Were any high-severity signals confirmed?
 */
export function hasConfirmedHighSeverity(
  result: Tier2ValidationResult
): boolean {
  return result.validatedSignals.some(
    (s) => s.confirmed && s.severity === 'high'
  );
}

/**
 * Confidence-weighted summary score for this validation batch (0-1).
 */
export function computeValidationScore(
  result: Tier2ValidationResult
): number {
  const confirmed = getConfirmedSignals(result);
  if (confirmed.length === 0) return 0;

  const total = confirmed.reduce((sum, s) => sum + s.confidenceScore, 0);
  return Math.round((total / confirmed.length) * 100) / 100;
}
