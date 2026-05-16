// lib/barbaros/analysis/behavior/behavior-types.ts
// CONTRACT: Behavioral ontology for Barbaros V4. Version 2.
// Model-agnostic. No circular ownership. Explicit lifespans.
//
// TAXONOMY (immutable language):
//   Signal          → observation    (instant, noisy, ephemeral)
//   ValidatedSignal → confirmation   (short, curated, decoupled from Signal shape)
//   Insight         → interpretation (accumulated, medium lifespan)
//   Pattern         → persistence    (long, stabilityScore not binary)
//   Risk            → intervention   (runtime ONLY, never stored)
//   Escalation      → decision       (single cycle, not analysis)
//
// PERSISTENCE BOUNDARY:
//   Session  → Signal, ValidatedSignal, Insight, SessionBehaviorPattern, Risk
//   Longitud → LongitudinalBehaviorPattern (extension only, owned by longitudinal/)

import type { InterviewPhase, Message } from '../../types';

// ─── Foundation ───────────────────────────────────────────────────────────────

export type SignalSeverity = 'low' | 'medium' | 'high';

// Numeric score 0-1 for computation. Label derived via helper.
export type SignalConfidenceScore = number; // 0.0 – 1.0

export type SignalConfidenceLabel = 'weak' | 'moderate' | 'strong';

export function toConfidenceLabel(score: SignalConfidenceScore): SignalConfidenceLabel {
  if (score >= 0.7) return 'strong';
  if (score >= 0.4) return 'moderate';
  return 'weak';
}

export type BehaviorSignalType =
  // Engagement
  | 'response_shrinking'
  | 'response_expanding'
  | 'hedging_spike'
  | 'engagement_drop'
  // Evasion
  | 'possible_deflection'
  | 'topic_avoidance'
  | 'vague_quantification'
  // Confidence
  | 'confidence_drop'
  | 'overconfidence_spike'
  | 'confidence_instability'
  // Credibility
  | 'possible_contradiction'
  | 'inconsistent_framing'
  // Depth
  | 'example_usage'
  | 'self_correction'
  | 'keyword_repetition';

// ─── Primitives ───────────────────────────────────────────────────────────────

/**
 * BehaviorSignal — instant observation from 1-2 messages.
 * Does NOT claim cause. Does NOT judge. Lifespan: current turn.
 */
export interface BehaviorSignal {
  id: string;                         // required for async reconciliation
  type: BehaviorSignalType;
  severity: SignalSeverity;
  confidenceScore: SignalConfidenceScore; // 0-1
  messageIndex: number;
  detectedAt: number;                 // now: number (ms)
  phase: InterviewPhase;
  rawEvidence: string;                // short excerpt, max ~100 chars
}

/**
 * ValidatedSignal — Tier2 confirmation of a signal.
 * DECOUPLED from BehaviorSignal shape (no embedded signal object).
 * Tier2 "destructures" the signal — changes to BehaviorSignal don't cascade.
 * Only validated signals reach scoring and longitudinal.
 * Lifespan: session (curated).
 */
export interface ValidatedSignal {
  id: string;
  signalId: string;                   // reference only, not embedded
  signalType: BehaviorSignalType;
  originalConfidenceScore: SignalConfidenceScore;

  confirmed: boolean;
  severity: SignalSeverity;
  confidenceScore: SignalConfidenceScore; // may differ from original after validation

  messageIndex: number;
  evidence: string[];                 // structured array, not single string
  validatedAt: number;
  validationPhase: InterviewPhase;
}

/**
 * BehaviorInsight — accumulated interpretation from Tier3.
 * NOT from a single message. Feeds longitudinal directly.
 * Lifespan: session + longitudinal snapshot.
 */
export interface BehaviorInsight {
  id: string;
  topic: string;
  description: string;
  evidence: string[];
  sourceSignalTypes: BehaviorSignalType[];
  sourceMessageIndices: number[];     // sparse indices, not a range
  confidenceScore: SignalConfidenceScore;
  phase: InterviewPhase;
  generatedAt: number;
}

/**
 * SessionBehaviorPattern — recurring insight within this session.
 * Reversible: stabilityScore, not binary resolved.
 * Lifespan: session only.
 * LongitudinalBehaviorPattern is a separate type owned by longitudinal/.
 */
export interface SessionBehaviorPattern {
  id: string;
  description: string;
  sourceInsightIds: string[];
  confidenceScore: SignalConfidenceScore;
  stabilityScore: number;             // 0-1, can decay
  decayCount: number;                 // increments when contradicted
  occurrenceCount: number;
  crossPhaseConfirmed: boolean;       // true only if seen in 2+ phases
  phasesObserved: InterviewPhase[];
  firstObservedAt: number;
  lastObservedAt: number;
  lastConfirmedAt: number;
  persistence: 'session';             // discriminator — never 'longitudinal' here
}

/**
 * LongitudinalBehaviorPattern — extension for cross-session patterns.
 * Owned by longitudinal/ layer. Defined here as contract boundary only.
 * Lifespan: across sessions.
 */
export interface LongitudinalBehaviorPattern extends Omit<SessionBehaviorPattern, 'persistence'> {
  persistence: 'longitudinal';
  sessionCount: number;               // how many sessions this appeared in
  crossSessionOccurrences: number;
  firstSessionId: string;
  lastSessionId: string;
}

/**
 * RiskIndicator — runtime intervention signal.
 * EPHEMERAL: never stored in candidate profile, never crosses sessions.
 * Feeds pressure-selector in real-time only.
 */
export type RiskType =
  | 'silence_risk'
  | 'credibility_risk'
  | 'dropout_risk'
  | 'overconfidence_risk'
  | 'evasion_risk';

export interface RiskIndicator {
  id: string;
  type: RiskType;
  severity: SignalSeverity;
  triggeredBy: Array<{
    type: BehaviorSignalType;
    severity: SignalSeverity;
    validated: boolean;               // was it tier2-confirmed?
  }>;
  detectedAt: number;
  phase: InterviewPhase;
  // NO: stored, NO: longitudinal, NO: candidate profile
}

/**
 * Escalation — decision only. Not analysis. Not memory.
 * Produced EXCLUSIVELY by escalation-policy.ts.
 * Lifespan: single decision cycle.
 */
export type EscalationLevel =
  | 'stay_tier1'
  | 'run_tier2'
  | 'run_tier3'
  | 'defer';

export type EscalationReason =
  | 'high_confidence_signal'
  | 'phase_changed'
  | 'contradiction_count_increased'
  | 'silence_risk_changed_sharply'
  | 'confidence_instability'
  | 'repeated_weak_competency'
  | 'pressure_escalation_triggered'
  | 'elapsed_time_threshold'
  | 'composite_signal_threshold';

export interface EscalationDecision {
  level: EscalationLevel;
  reasons: EscalationReason[];
  triggerSignalIds: string[];         // which signals caused this decision
  blocking: boolean;                  // true = wait for result; false = async/defer
  decidedAt: number;
}

export interface EscalationContext {
  currentSignals: BehaviorSignal[];
  phaseChanged: boolean;
  contradictionCountIncreased: boolean;
  silenceRiskChangedSharply: boolean;
  confidenceInstability: boolean;
  repeatedWeakCompetency: boolean;
  pressureEscalationTriggered: boolean;
  elapsedMinutes: number;
  totalUserMessages: number;
  phase: InterviewPhase;
  now: number;
}

// ─── Tier Outputs ─────────────────────────────────────────────────────────────

export interface Tier1ScanResult {
  signals: BehaviorSignal[];
  risks: RiskIndicator[];             // ephemeral, immediate use only
  scannedAt: number;
  messageIndex: number;
}

export interface Tier2ValidationResult {
  validatedSignals: ValidatedSignal[];
  newRisks: RiskIndicator[];
  validatedAt: number;
  messagesConsidered: number;         // max 3
}

export interface Tier3InsightResult {
  insights: BehaviorInsight[];
  patternCandidates: SessionBehaviorPattern[];  // crossPhaseConfirmed: false
  confirmedPatterns: SessionBehaviorPattern[];  // crossPhaseConfirmed: true
  analyzedAt: number;
  sourceMessageIndices: number[];     // sparse, not range
}

// ─── Async Tasks (discriminated union) ───────────────────────────────────────

/**
 * Discriminated union — TypeScript narrowing works cleanly.
 * No optional chaos in orchestrator.
 */
export interface Tier2Task {
  id: string;
  type: 'tier2';
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  phase: InterviewPhase;
  signalIds: string[];                // IDs only, resolved at execution time
}

export interface Tier3Task {
  id: string;
  type: 'tier3';
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  phase: InterviewPhase;
  messageIndices: number[];           // sparse indices to analyze
}

export type PendingBehaviorTask = Tier2Task | Tier3Task;

// ─── Orchestration ────────────────────────────────────────────────────────────

/**
 * Soft modular boundary — one object, three internal namespaces.
 * Avoids god-object while keeping orchestrator simple.
 * Each sub-context can be extracted independently if the system grows.
 */
export interface BehaviorRuntimeContext {
  messages: Message[];
  currentPhase: InterviewPhase;
  elapsedMinutes: number;
  now: number;
}

export interface BehaviorHistoricalContext {
  contradictionCount: number;
  lastSilenceRisk: 'low' | 'medium' | 'high';
  weakCompetencyTopics: string[];
  existingInsights: BehaviorInsight[];
  existingPatterns: SessionBehaviorPattern[];
}

export interface BehaviorPressureContext {
  silenceRisk: 'low' | 'medium' | 'high';
  pressureLevel: number;              // 0-100
  pressureEscalationTriggered: boolean;
}

export interface BehaviorContext {
  runtime: BehaviorRuntimeContext;
  historical: BehaviorHistoricalContext;
  pressure: BehaviorPressureContext;
}

/**
 * BehaviorOrchestrationResult — final output of behavior-orchestrator.ts.
 * Consumed by: engine.ts, pressure-selector, session-snapshot.
 */
export interface BehaviorOrchestrationResult {
  // Immediate (this turn)
  tier1Result: Tier1ScanResult;
  escalationDecision: EscalationDecision;
  activeRisks: RiskIndicator[];       // ephemeral — current turn only

  // Accumulated (session)
  validatedSignals: ValidatedSignal[];
  insights: BehaviorInsight[];
  patterns: SessionBehaviorPattern[];

  // Async queue (non-blocking)
  pendingTasks: PendingBehaviorTask[];

  orchestratedAt: number;
}
