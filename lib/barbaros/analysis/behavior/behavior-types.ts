// lib/barbaros/analysis/behavior/behavior-types.ts
// CONTRACT: Behavioral ontology for Barbaros V4. Version 4.
// Changes from v3:
//   - Added trendDirection to SessionBehaviorPattern
//   - Removes all text-matching dependency from session-snapshot

import type { InterviewPhase, Message } from '../../types';

// ─── Foundation ───────────────────────────────────────────────────────────────

export type SignalSeverity = 'low' | 'medium' | 'high';

export type SignalConfidenceScore = number; // 0.0 – 1.0

export type SignalConfidenceLabel = 'weak' | 'moderate' | 'strong';

export function toConfidenceLabel(score: SignalConfidenceScore): SignalConfidenceLabel {
  if (score >= 0.7) return 'strong';
  if (score >= 0.4) return 'moderate';
  return 'weak';
}

export type BehaviorSignalType =
  | 'response_shrinking'
  | 'response_expanding'
  | 'hedging_spike'
  | 'engagement_drop'
  | 'possible_deflection'
  | 'topic_avoidance'
  | 'vague_quantification'
  | 'confidence_drop'
  | 'overconfidence_spike'
  | 'confidence_instability'
  | 'possible_contradiction'
  | 'inconsistent_framing'
  | 'example_usage'
  | 'self_correction'
  | 'keyword_repetition';

export type PatternCategory =
  | 'engagement'
  | 'evasion'
  | 'confidence'
  | 'depth'
  | 'credibility';

export type TrendDirection = 'expanding' | 'shrinking' | 'stable';

// ─── Primitives ───────────────────────────────────────────────────────────────

export interface BehaviorSignal {
  id: string;
  type: BehaviorSignalType;
  severity: SignalSeverity;
  confidenceScore: SignalConfidenceScore;
  messageIndex: number;
  detectedAt: number;
  phase: InterviewPhase;
  rawEvidence: string;
}

export interface ValidatedSignal {
  id: string;
  signalId: string;
  signalType: BehaviorSignalType;
  originalConfidenceScore: SignalConfidenceScore;
  confirmed: boolean;
  severity: SignalSeverity;
  confidenceScore: SignalConfidenceScore;
  messageIndex: number;
  evidence: string[];
  validatedAt: number;
  validationPhase: InterviewPhase;
}

export interface BehaviorInsight {
  id: string;
  topic: string;
  description: string;
  evidence: string[];
  sourceSignalTypes: BehaviorSignalType[];
  sourceMessageIndices: number[];
  confidenceScore: SignalConfidenceScore;
  phase: InterviewPhase;
  generatedAt: number;
}

/**
 * SessionBehaviorPattern — v4 adds trendDirection.
 * trendDirection: null when category has no directional meaning (credibility, depth).
 * Assigned by tier3-insights.ts from signal types — zero text matching.
 */
export interface SessionBehaviorPattern {
  id: string;
  description: string;
  patternCategory: PatternCategory;
  trendDirection: TrendDirection | null;  // ← NEW in v4
  sourceInsightIds: string[];
  confidenceScore: SignalConfidenceScore;
  stabilityScore: number;
  decayCount: number;
  occurrenceCount: number;
  crossPhaseConfirmed: boolean;
  phasesObserved: InterviewPhase[];
  firstObservedAt: number;
  lastObservedAt: number;
  lastConfirmedAt: number;
  persistence: 'session';
}

export interface LongitudinalBehaviorPattern
  extends Omit<SessionBehaviorPattern, 'persistence'> {
  persistence: 'longitudinal';
  sessionCount: number;
  crossSessionOccurrences: number;
  firstSessionId: string;
  lastSessionId: string;
}

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
    validated: boolean;
  }>;
  detectedAt: number;
  phase: InterviewPhase;
}

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
  triggerSignalIds: string[];
  blocking: boolean;
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
  risks: RiskIndicator[];
  scannedAt: number;
  messageIndex: number;
}

export interface Tier2ValidationResult {
  validatedSignals: ValidatedSignal[];
  newRisks: RiskIndicator[];
  validatedAt: number;
  messagesConsidered: number;
}

export interface Tier3InsightResult {
  insights: BehaviorInsight[];
  patternCandidates: SessionBehaviorPattern[];
  confirmedPatterns: SessionBehaviorPattern[];
  analyzedAt: number;
  sourceMessageIndices: number[];
}

// ─── Async Tasks ──────────────────────────────────────────────────────────────

export interface Tier2Task {
  id: string;
  type: 'tier2';
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  phase: InterviewPhase;
  signalIds: string[];
}

export interface Tier3Task {
  id: string;
  type: 'tier3';
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  phase: InterviewPhase;
  messageIndices: number[];
}

export type PendingBehaviorTask = Tier2Task | Tier3Task;

// ─── Orchestration ────────────────────────────────────────────────────────────

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
  pressureLevel: number;
  pressureEscalationTriggered: boolean;
}

export interface BehaviorContext {
  runtime: BehaviorRuntimeContext;
  historical: BehaviorHistoricalContext;
  pressure: BehaviorPressureContext;
}

export interface BehaviorOrchestrationResult {
  tier1Result: Tier1ScanResult;
  escalationDecision: EscalationDecision;
  activeRisks: RiskIndicator[];
  validatedSignals: ValidatedSignal[];
  insights: BehaviorInsight[];
  patterns: SessionBehaviorPattern[];
  pendingTasks: PendingBehaviorTask[];
  orchestratedAt: number;
}
