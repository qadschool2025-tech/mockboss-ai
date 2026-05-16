
// lib/barbaros/analysis/behavior/behavior-orchestrator.ts
// CONTRACT: Orchestrator only. Zero business logic. Zero analysis.
// Connects: tier1 → escalation-policy → tier2/3 (async)
// Produces: BehaviorOrchestrationResult
//
// Rules:
//   - Never analyzes signals directly
//   - Never decides escalation (escalation-policy owns that)
//   - Never reads state directly (all via BehaviorContext)
//   - recentMessages passed to tier1 EXCLUDES current message (no duplication)
//   - Tier3 has cooldown — never runs twice within TIER3_COOLDOWN_MS
//   - All time ops take `now: number`
//
// CONTRACT FIXES applied here:
//   - tier2 fallback receives real phase (not hardcoded 'opening')
//   - insight threshold: (messages >= 2 OR signalTypes >= 2) AND evidence >= 1

import type { Message, InterviewPhase } from '../../types';
import type {
  BehaviorContext,
  BehaviorInsight,
  BehaviorOrchestrationResult,
  BehaviorPressureContext,
  BehaviorRuntimeContext,
  BehaviorHistoricalContext,
  EscalationDecision,
  PendingBehaviorTask,
  RiskIndicator,
  SessionBehaviorPattern,
  Tier1ScanResult,
  Tier2ValidationResult,
  Tier3InsightResult,
  ValidatedSignal,
} from './behavior-types';
import { scanMessage } from './tier1-scanner';
import { decideEscalation } from './escalation-policy';
import { validateSignals } from './tier2-validator';
import { analyzeDeep } from './tier3-insights';

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER3_COOLDOWN_MS        = 60_000;   // 1 minute between Tier3 runs
const TIER2_MAX_MESSAGES       = 3;
const INSIGHT_MIN_INDICES      = 2;        // Contract: 2+ message indices
const INSIGHT_MIN_SIGNAL_TYPES = 2;        // Contract: 2+ signal types
// Threshold: (indices >= 2 OR signalTypes >= 2) AND evidence >= 1

// ─── Session State (passed in, never stored here) ─────────────────────────────

export interface OrchestratorSessionState {
  validatedSignals: ValidatedSignal[];
  insights: BehaviorInsight[];
  patterns: SessionBehaviorPattern[];
  pendingTasks: PendingBehaviorTask[];
  lastTier3RunAt: number | null;          // cooldown tracking
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Process one interview turn through the behavior pipeline.
 * Called by engine.ts after every user message.
 */
export async function orchestrateBehavior(
  context: BehaviorContext,
  sessionState: OrchestratorSessionState
): Promise<BehaviorOrchestrationResult> {
  const { runtime, historical, pressure } = context;
  const { messages, currentPhase, now } = runtime;

  // ── Step 1: Isolate current message ─────────────────────────────────────────
  const currentMessage = messages[messages.length - 1];
  const messageIndex   = messages.length - 1;

  // recentMessages EXCLUDES current message (tier1 contract)
  const recentMessages = messages.slice(0, -1);

  // ── Step 2: Tier1 scan ───────────────────────────────────────────────────────
  const tier1Result = scanMessage(
    currentMessage,
    messageIndex,
    recentMessages,
    currentPhase,
    now
  );

  // ── Step 3: Build escalation context ────────────────────────────────────────
  const escalationContext = buildEscalationContext(
    context,
    tier1Result,
    sessionState,
    now
  );

  // ── Step 4: Decide escalation (policy owns this) ─────────────────────────────
  const escalationDecision = decideEscalation(escalationContext, tier1Result);

  // ── Step 5: Execute escalation ───────────────────────────────────────────────
  const {
    newValidatedSignals,
    newInsights,
    newPatterns,
    newPendingTasks,
    activeRisks,
  } = await executeEscalation(
    escalationDecision,
    tier1Result,
    messages,
    sessionState,
    currentPhase,
    now
  );

  // ── Step 6: Merge with session state ─────────────────────────────────────────
  const allValidatedSignals = mergeUnique(
    sessionState.validatedSignals,
    newValidatedSignals,
    (s) => s.id
  );

  const allInsights = mergeUnique(
    sessionState.insights,
    newInsights,
    (i) => i.id
  );

  const allPatterns = mergePatterns(sessionState.patterns, newPatterns);

  const allPendingTasks = [
    ...sessionState.pendingTasks,
    ...newPendingTasks,
  ];

  return {
    tier1Result,
    escalationDecision,
    activeRisks,
    validatedSignals: allValidatedSignals,
    insights: allInsights,
    patterns: allPatterns,
    pendingTasks: allPendingTasks,
    orchestratedAt: now,
  };
}

// ─── Escalation Executor ──────────────────────────────────────────────────────

interface EscalationOutput {
  newValidatedSignals: ValidatedSignal[];
  newInsights: BehaviorInsight[];
  newPatterns: SessionBehaviorPattern[];
  newPendingTasks: PendingBehaviorTask[];
  activeRisks: RiskIndicator[];
}

async function executeEscalation(
  decision: EscalationDecision,
  tier1Result: Tier1ScanResult,
  messages: Message[],
  sessionState: OrchestratorSessionState,
  phase: InterviewPhase,
  now: number
): Promise<EscalationOutput> {

  // Always collect ephemeral risks from tier1
  const activeRisks = [...tier1Result.risks];

  switch (decision.level) {

    // ── run_tier2: blocking spot-check ────────────────────────────────────────
    case 'run_tier2': {
      const signalsToValidate = tier1Result.signals.filter((s) =>
        decision.triggerSignalIds.includes(s.id)
      );

      const recentForTier2 = messages.slice(-TIER2_MAX_MESSAGES);

      let tier2Result: Tier2ValidationResult;
      try {
        tier2Result = await validateSignals(
          {
            signals: signalsToValidate,
            recentMessages: recentForTier2,
            phase,        // fix: real phase, not hardcoded 'opening'
            now,
          },
          now
        );
      } catch {
        tier2Result = buildTier2Fallback(signalsToValidate, phase, now);
      }

      // Merge new risks from tier2
      activeRisks.push(...tier2Result.newRisks);

      return {
        newValidatedSignals: tier2Result.validatedSignals,
        newInsights: [],
        newPatterns: [],
        newPendingTasks: [],
        activeRisks,
      };
    }

    // ── run_tier3: deep analysis (async, non-blocking) ────────────────────────
    case 'run_tier3': {
      // Check cooldown — tier3 never runs twice within TIER3_COOLDOWN_MS
      if (!canRunTier3(sessionState.lastTier3RunAt, now)) {
        return buildEmptyOutput(activeRisks);
      }

      const confirmedSignals = sessionState.validatedSignals.filter(
        (s) => s.confirmed
      );

      let tier3Result: Tier3InsightResult;
      try {
        tier3Result = await analyzeDeep({
          validatedSignals: confirmedSignals,
          existingInsights: sessionState.insights,
          existingPatterns: sessionState.patterns,
          phase,
          now,
        });
      } catch {
        return buildEmptyOutput(activeRisks);
      }

      // Apply insight contract threshold
      const qualifiedInsights = tier3Result.insights.filter(
        meetsInsightThreshold
      );

      return {
        newValidatedSignals: [],
        newInsights: qualifiedInsights,
        newPatterns: [
          ...tier3Result.patternCandidates,
          ...tier3Result.confirmedPatterns,
        ],
        newPendingTasks: [],
        activeRisks,
      };
    }

    // ── defer: queue async task, don't block ─────────────────────────────────
    case 'defer': {
      const task: PendingBehaviorTask = {
        id: `task_tier2_${now}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'tier2',
        priority: 'low',
        createdAt: now,
        phase,
        signalIds: decision.triggerSignalIds,
      };

      return {
        newValidatedSignals: [],
        newInsights: [],
        newPatterns: [],
        newPendingTasks: [task],
        activeRisks,
      };
    }

    // ── stay_tier1: no escalation needed ─────────────────────────────────────
    case 'stay_tier1':
    default:
      return buildEmptyOutput(activeRisks);
  }
}

// ─── Context Builder ──────────────────────────────────────────────────────────

function buildEscalationContext(
  context: BehaviorContext,
  tier1Result: Tier1ScanResult,
  sessionState: OrchestratorSessionState,
  now: number
) {
  const { runtime, historical, pressure } = context;

  const prevSilenceRisk = historical.lastSilenceRisk;
  const currentSilenceRisk = deriveSilenceRisk(tier1Result);
  const silenceRiskChangedSharply =
    prevSilenceRisk === 'low' && currentSilenceRisk === 'high';

  const hasNewContradiction = historical.contradictionCount > 0;

  const confidenceInstability = tier1Result.signals.some(
    (s) => s.type === 'confidence_instability' || s.type === 'confidence_drop'
  );

  return {
    currentSignals: tier1Result.signals,
    phaseChanged: false,                // engine.ts sets this — orchestrator doesn't track phase
    contradictionCountIncreased: hasNewContradiction,
    silenceRiskChangedSharply,
    confidenceInstability,
    repeatedWeakCompetency: historical.weakCompetencyTopics.length > 0,
    pressureEscalationTriggered: pressure.pressureEscalationTriggered,
    elapsedMinutes: runtime.elapsedMinutes,
    totalUserMessages: runtime.messages.filter((m) => m.role === 'user').length,
    phase: runtime.currentPhase,
    now,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Insight contract threshold.
 * (2+ message indices OR 2+ signal types) AND evidence >= 1
 */
function meetsInsightThreshold(insight: BehaviorInsight): boolean {
  const hasMultipleIndices  = insight.sourceMessageIndices.length >= INSIGHT_MIN_INDICES;
  const hasMultipleSignals  = insight.sourceSignalTypes.length >= INSIGHT_MIN_SIGNAL_TYPES;
  const hasEvidence         = insight.evidence.length >= 1;
  return (hasMultipleIndices || hasMultipleSignals) && hasEvidence;
}

function canRunTier3(lastRunAt: number | null, now: number): boolean {
  if (lastRunAt === null) return true;
  return now - lastRunAt >= TIER3_COOLDOWN_MS;
}

function deriveSilenceRisk(
  tier1Result: Tier1ScanResult
): 'low' | 'medium' | 'high' {
  const silenceRisk = tier1Result.risks.find((r) => r.type === 'silence_risk');
  if (!silenceRisk) return 'low';
  if (silenceRisk.severity === 'high') return 'high';
  if (silenceRisk.severity === 'medium') return 'medium';
  return 'low';
}

function mergeUnique<T>(
  existing: T[],
  incoming: T[],
  getKey: (item: T) => string
): T[] {
  const seen = new Set(existing.map(getKey));
  const newItems = incoming.filter((i) => !seen.has(getKey(i)));
  return [...existing, ...newItems];
}

function mergePatterns(
  existing: SessionBehaviorPattern[],
  incoming: SessionBehaviorPattern[]
): SessionBehaviorPattern[] {
  const map = new Map(existing.map((p) => [p.id, p]));
  for (const p of incoming) {
    // Incoming (strengthened) patterns overwrite existing
    map.set(p.id, p);
  }
  return [...map.values()];
}

function buildEmptyOutput(
  activeRisks: RiskIndicator[]
): EscalationOutput {
  return {
    newValidatedSignals: [],
    newInsights: [],
    newPatterns: [],
    newPendingTasks: [],
    activeRisks,
  };
}

function buildTier2Fallback(
  signals: import('./behavior-types').BehaviorSignal[],
  phase: InterviewPhase,
  now: number
): Tier2ValidationResult {
  return {
    validatedSignals: signals.map((s) => ({
      id: `vs_fallback_${s.id}_${now}`,
      signalId: s.id,
      signalType: s.type,
      originalConfidenceScore: s.confidenceScore,
      confirmed: false,
      severity: s.severity,
      confidenceScore: s.confidenceScore * 0.5,
      messageIndex: s.messageIndex,
      evidence: [],
      validatedAt: now,
      validationPhase: phase,   // fix: real phase
    })),
    newRisks: [],
    validatedAt: now,
    messagesConsidered: 0,
  };
}

// ─── Exported Queries (used by engine.ts) ────────────────────────────────────

/**
 * Should engine.ts update lastTier3RunAt after this orchestration?
 */
export function didRunTier3(decision: EscalationDecision): boolean {
  return decision.level === 'run_tier3';
}

/**
 * Active high-severity risks for immediate pressure-selector input.
 */
export function getHighSeverityRisks(
  result: BehaviorOrchestrationResult
): RiskIndicator[] {
  return result.activeRisks.filter((r) => r.severity === 'high');
}

/**
 * Patterns ready for longitudinal promotion.
 */
export function getLongitudinalCandidates(
  result: BehaviorOrchestrationResult
): SessionBehaviorPattern[] {
  return result.patterns.filter(
    (p) => p.crossPhaseConfirmed && p.stabilityScore >= 0.6
  );
}
