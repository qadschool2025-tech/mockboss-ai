
// lib/barbaros/analysis/behavior/escalation-policy.ts
// CONTRACT: Decision layer only. No analysis. No execution. No memory.
// Sole authority for escalation decisions in the behavior pipeline.
// Consumes: EscalationContext (signals + state flags)
// Produces: EscalationDecision (level + reasons + blocking)
//
// RULES:
//   - Only this file calls escalation decisions
//   - tier1-scanner NEVER decides escalation
//   - behavior-orchestrator NEVER decides escalation
//   - Thresholds are centralized here — change once, affects everything

import type {
  BehaviorSignal,
  EscalationContext,
  EscalationDecision,
  EscalationLevel,
  EscalationReason,
  RiskIndicator,
  Tier1ScanResult,
} from './behavior-types';

// ─── Thresholds (change here only) ───────────────────────────────────────────

const THRESHOLDS = {
  // Tier2: single signal confidence floor
  tier2SignalConfidence: 0.65,

  // Tier2: risk severity that auto-triggers
  tier2RiskSeverity: 'high' as const,

  // Tier3: composite signal count floor
  tier3CompositeSignals: 3,

  // Tier3: elapsed time floor (minutes)
  tier3ElapsedMinutes: 8,

  // Tier3: contradiction count delta that triggers
  tier3ContradictionDelta: 1,

  // Defer: low-priority async threshold
  deferSignalConfidence: 0.4,
} as const;

// ─── Main Decision Function ───────────────────────────────────────────────────

/**
 * Sole entry point for escalation decisions.
 * Called by behavior-orchestrator after every Tier1 scan.
 * Returns a single EscalationDecision — never mutates context.
 */
export function decideEscalation(
  context: EscalationContext,
  tier1Result: Tier1ScanResult
): EscalationDecision {
  const { signals, risks } = tier1Result;
  const { now } = context;

  // Evaluate all conditions
  const tier3Check = shouldRunTier3(context, signals);
  if (tier3Check.should) {
    return makeDecision('run_tier3', tier3Check.reasons, tier3Check.triggerIds, false, now);
  }

  const tier2Check = shouldRunTier2(signals, risks);
  if (tier2Check.should) {
    return makeDecision('run_tier2', tier2Check.reasons, tier2Check.triggerIds, true, now);
  }

  const deferCheck = shouldDefer(signals);
  if (deferCheck.should) {
    return makeDecision('defer', deferCheck.reasons, deferCheck.triggerIds, false, now);
  }

  return makeDecision('stay_tier1', [], [], false, now);
}

// ─── Tier3 Conditions ─────────────────────────────────────────────────────────

interface EscalationCheck {
  should: boolean;
  reasons: EscalationReason[];
  triggerIds: string[];
}

/**
 * Tier3 = deep analysis. Triggered by composite signals — not message count.
 * Any ONE of these conditions is sufficient.
 */
function shouldRunTier3(
  context: EscalationContext,
  signals: BehaviorSignal[]
): EscalationCheck {
  const reasons: EscalationReason[] = [];
  const triggerIds: string[] = [];

  // Phase transition — new context always warrants deep analysis
  if (context.phaseChanged) {
    reasons.push('phase_changed');
  }

  // Contradiction count increased — credibility at risk
  if (context.contradictionCountIncreased) {
    reasons.push('contradiction_count_increased');
    collectSignalIds(signals, ['possible_contradiction', 'inconsistent_framing'], triggerIds);
  }

  // Silence risk changed sharply — engagement in freefall
  if (context.silenceRiskChangedSharply) {
    reasons.push('silence_risk_changed_sharply');
    collectSignalIds(signals, ['response_shrinking', 'confidence_drop', 'engagement_drop'], triggerIds);
  }

  // Confidence instability — pattern worth deep analysis
  if (context.confidenceInstability) {
    reasons.push('confidence_instability');
    collectSignalIds(signals, ['confidence_instability', 'confidence_drop', 'overconfidence_spike'], triggerIds);
  }

  // Same competency weak repeatedly — systematic gap
  if (context.repeatedWeakCompetency) {
    reasons.push('repeated_weak_competency');
  }

  // Pressure was escalated — deep analysis of response
  if (context.pressureEscalationTriggered) {
    reasons.push('pressure_escalation_triggered');
  }

  // Elapsed time threshold — periodic deep check
  if (context.elapsedMinutes >= THRESHOLDS.tier3ElapsedMinutes) {
    reasons.push('elapsed_time_threshold');
  }

  // Composite signal count — too many signals at once
  const compositeSignals = signals.filter(
    (s) => s.confidenceScore >= THRESHOLDS.deferSignalConfidence
  );
  if (compositeSignals.length >= THRESHOLDS.tier3CompositeSignals) {
    reasons.push('composite_signal_threshold');
    compositeSignals.forEach((s) => triggerIds.push(s.id));
  }

  return {
    should: reasons.length > 0,
    reasons,
    triggerIds: [...new Set(triggerIds)],
  };
}

// ─── Tier2 Conditions ─────────────────────────────────────────────────────────

/**
 * Tier2 = spot-check. Triggered by ONE strong signal or high-severity risk.
 * Blocking: interview waits for confirmation before next question.
 */
function shouldRunTier2(
  signals: BehaviorSignal[],
  risks: RiskIndicator[]
): EscalationCheck {
  const reasons: EscalationReason[] = [];
  const triggerIds: string[] = [];

  // Single signal above confidence floor
  const highConfidenceSignal = signals.find(
    (s) => s.confidenceScore >= THRESHOLDS.tier2SignalConfidence
  );
  if (highConfidenceSignal) {
    reasons.push('high_confidence_signal');
    triggerIds.push(highConfidenceSignal.id);
  }

  // High-severity risk present
  const highRisk = risks.find(
    (r) => r.severity === THRESHOLDS.tier2RiskSeverity
  );
  if (highRisk) {
    // Collect signal IDs from risk triggers
    highRisk.triggeredBy.forEach((t) => {
      const match = signals.find((s) => s.type === t.type);
      if (match) triggerIds.push(match.id);
    });

    if (!reasons.includes('high_confidence_signal')) {
      reasons.push('high_confidence_signal');
    }
  }

  return {
    should: reasons.length > 0,
    reasons,
    triggerIds: [...new Set(triggerIds)],
  };
}

// ─── Defer Conditions ─────────────────────────────────────────────────────────

/**
 * Defer = async, non-blocking.
 * For signals worth investigating but not urgent enough to block.
 */
function shouldDefer(signals: BehaviorSignal[]): EscalationCheck {
  const deferableSignals = signals.filter(
    (s) =>
      s.confidenceScore >= THRESHOLDS.deferSignalConfidence &&
      s.confidenceScore < THRESHOLDS.tier2SignalConfidence
  );

  if (deferableSignals.length === 0) return { should: false, reasons: [], triggerIds: [] };

  return {
    should: true,
    reasons: ['high_confidence_signal'],
    triggerIds: deferableSignals.map((s) => s.id),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDecision(
  level: EscalationLevel,
  reasons: EscalationReason[],
  triggerSignalIds: string[],
  blocking: boolean,
  now: number
): EscalationDecision {
  return {
    level,
    reasons,
    triggerSignalIds,
    blocking,
    decidedAt: now,
  };
}

function collectSignalIds(
  signals: BehaviorSignal[],
  types: BehaviorSignal['type'][],
  into: string[]
): void {
  const typeSet = new Set(types);
  signals
    .filter((s) => typeSet.has(s.type))
    .forEach((s) => into.push(s.id));
}

// ─── Derived Queries (used by orchestrator) ───────────────────────────────────

/**
 * Should orchestrator await Tier2 result before sending next prompt?
 */
export function isBlocking(decision: EscalationDecision): boolean {
  return decision.blocking && decision.level === 'run_tier2';
}

/**
 * Should orchestrator queue a Tier3 async task?
 */
export function requiresDeepAnalysis(decision: EscalationDecision): boolean {
  return decision.level === 'run_tier3';
}

/**
 * Should orchestrator add a low-priority background task?
 */
export function requiresDeferredTask(decision: EscalationDecision): boolean {
  return decision.level === 'defer';
}

/**
 * Human-readable summary for debugging/audit trail.
 */
export function summarizeDecision(decision: EscalationDecision): string {
  if (decision.level === 'stay_tier1') return 'No escalation needed.';
  const blocking = decision.blocking ? '(blocking)' : '(async)';
  return `${decision.level} ${blocking} — reasons: ${decision.reasons.join(', ')}`;
}
