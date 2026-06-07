// ============================================================================
// Barbaros V4 — Type System (Unified Contract v3.1 — STABILIZED)
// Single source of truth. Pure types only — zero runtime logic.
//
// CHANGELOG v3 → v3.1 (additive, non-breaking):
//   + Added: Contradiction optional fields — source, confidence,
//            suggestedProbe, contradictionType (semantic-detection metadata).
//            Heuristic-detected contradictions leave them undefined; the
//            Director consumes id/severity unchanged. suggestedProbe is advisory.
//
// CHANGELOG v2 → v3:
//   - Removed: sessionStartTime (duplicate of metrics.startedAt)
//   - Changed: Message.timestamp is now REQUIRED (was optional)
//   - Changed: InterviewTurnInput simplified — state + newUserMessage + now
//   - Changed: PromptContext.recentTopics is now TopicMemory[] (was string[])
//
// CHANGELOG v1 → v2:
//   + Added: messages, config to InterviewState (persistence/replay)
//   + Added: pressureMode, phaseStartedAt, lastActivityAt
//   + Added: isComplete (session terminus flag)
//   + Added: scores[] with TODO marker for V5 extraction
//   + Unified: TopicMemory (phase + firstVisitedAt + revisitAllowed)
//   + Unified: CandidateProfile (operational + analytical fields merged)
//   + Unified: SessionMetrics (startedAt + lastActivityAt + pressureEscalations)
//   + Kept:   phase (not currentPhase), severity: minor/moderate/major,
//             Contradiction.id + indices
// ============================================================================

// ============================================================================
// SECTION 1 — DOMAIN
// ============================================================================

/**
 * Core sectors with dedicated logic (competencies, question patterns).
 */
export type CoreSector =
  | 'technology'
  | 'education'
  | 'healthcare'
  | 'finance'
  | 'government'
  | 'marketing'
  | 'sales'
  | 'legal'
  | 'customer_support'
  | 'human_resources'
  | 'operations'
  | 'general'

/**
 * Sector accepts core sectors OR any free-form string.
 * Free-form strings are normalized via `normalizeSector()` (utils/sanitization).
 */
export type Sector = CoreSector | (string & {})

export type Language = 'en' | 'ar' | 'mixed'

export type Plan = 'free' | 'go' | 'pro' | 'expert'

export type ExperienceLevel =
  | 'entry'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'lead'
  | 'executive'

/**
 * Configuration passed from onboarding to the interview engine.
 */
export interface InterviewConfig {
  candidateName: string
  jobTitle: string
  institution: string
  country?: string
  sector: Sector
  yearsExperience: string
  experienceLevel?: ExperienceLevel
  language: Language
  plan: Plan
  cvSummary?: string
  jobRequirements?: string
  isCareerSwitch?: boolean
  subject?: string
}

/**
 * A single message in the conversation history.
 *
 * `system` role is reserved for internal orchestration messages
 * (hidden injections, state hints) — never shown to the candidate.
 *
 * `timestamp` is REQUIRED because the system relies on it for:
 *   - silence detection
 *   - contradiction ordering
 *   - replay determinism
 *   - pacing analysis
 *
 * `isQuestion` is optional because only assistant messages need it
 * (user/system messages have no use for the flag).
 */
export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp: number
  score?: NormalizedScore
  isQuestion?: boolean
}

// ============================================================================
// SECTION 2 — STATE (THE HEART)
// ============================================================================

/**
 * Interview phases. Backend determines current phase explicitly — never the LLM.
 */
export type InterviewPhase =
  | 'opening'
  | 'motivation'
  | 'cv_deep_dive'
  | 'technical'
  | 'behavioral'
  | 'pressure'
  | 'closing'

/**
 * Pressure modes shape pacing, tone, and follow-up intensity.
 * Selected dynamically by `pressure-selector` based on candidate behavior.
 */
export type PressureMode =
  | 'neutral'
  | 'analytical'
  | 'skeptical'
  | 'fast_paced'
  | 'silence_pressure'

/**
 * Coverage record for a single competency.
 * Stored in a Record keyed by competency name for O(1) lookup.
 */
export interface CompetencyCoverage {
  coverage: number          // 0-100
  evidenceCount: number
  lastUpdated: number
}

/**
 * A topic discussed in the interview, with metadata for repetition control.
 */
export interface TopicMemory {
  topic: string
  phase: InterviewPhase | null
  timesVisited: number
  firstVisitedAt: number
  lastVisitedAt: number
  revisitAllowed: boolean
}

/**
 * A detected contradiction between two candidate statements.
 * The contradiction-tracker stores these and revisits them later.
 */
export interface Contradiction {
  id: string
  topic: string
  earlierStatement: string
  earlierMessageIndex: number
  laterStatement: string
  laterMessageIndex: number
  severity: 'minor' | 'moderate' | 'major'
  addressed: boolean
  detectedAt: number
  phase: InterviewPhase

  // ── Optional semantic-detection metadata (v3.1, additive) ────────────────
  // Populated ONLY by the semantic detector (detectContradictionsSemantic).
  // Heuristic-detected contradictions leave these undefined.
  // The Director still consumes only `id` + `severity` (unchanged); the fields
  // below are advisory context for downstream layers, never decision inputs.

  // Detection origin. Absent ⇒ treat as 'heuristic' for backward compatibility.
  source?: 'heuristic' | 'semantic'

  // Semantic-judge confidence, 0-100. Used to gate entry into state
  // (only high-confidence semantic contradictions are persisted).
  confidence?: number

  // Advisory confrontation phrasing produced by the semantic judge.
  // NOT binding — the personality / question layer owns final wording.
  suggestedProbe?: string

  // Nature of the conflict, e.g. 'logical' | 'factual' | 'temporal'
  // | 'numerical' | 'scope'. Free-form to avoid over-constraining the judge.
  contradictionType?: string
}

/**
 * Aggregate session metrics. Updated each turn.
 * `startedAt` is the canonical session start time — there is no duplicate
 * field at the state root level (deliberately).
 */
export interface SessionMetrics {
  averageScore: number
  averageResponseLength: number
  hesitationCount: number
  vaguenessCount: number
  silenceEvents: number
  contradictionCount: number
  specificityScore: number       // 0-100
  totalQuestions: number
  totalAnswers: number
  pressureEscalations: number
  startedAt: number              // ms epoch — canonical session start
  lastActivityAt: number         // ms epoch
}

/**
 * Running snapshot of the candidate based on accumulated evidence.
 * Merges both analytical fields (strengths/weaknesses) and operational
 * fields (clarity/depth/engagement) used by the prompt builder.
 *
 * `ownershipScore` here is the aggregate across the session —
 * distinct from per-answer `ownershipScore` in BehaviorSignals.
 */
export interface CandidateProfile {
  strengths: string[]
  weaknesses: string[]
  confidenceLevel: number        // 0-100 — aggregate confidence
  ownershipScore: number         // 0-100 — aggregate ownership

  // Operational dimensions used by prompt builder & pressure selector
  clarity: number                // 0-100
  depth: number                  // 0-100
  consistency: number            // 0-100
  engagement: number             // 0-100

  lastUpdatedAt: number
}

/**
 * THE CENTRAL STATE OBJECT.
 * Every layer reads from it and returns a patch to update it.
 * Treated as immutable — never mutate directly.
 *
 * `version` enables future migrations of persisted sessions.
 */
export interface InterviewState {
  version: 1

  // Identity & configuration
  config: InterviewConfig

  // Conversation history (lives inside state for resume/replay)
  messages: Message[]

  // Phase machinery
  phase: InterviewPhase
  phaseQuestionCount: number
  phaseStartedAt: number         // ms epoch

  // Pressure state
  pressureMode: PressureMode

  // Memory layers
  competencyCoverage: Record<string, CompetencyCoverage>
  recentTopics: TopicMemory[]
  askedQuestionFingerprints: string[]
  contradictions: Contradiction[]

  // Aggregates
  candidateProfile: CandidateProfile
  metrics: SessionMetrics

  // Per-turn scores
  // TODO(V5): Move historical scores outside InterviewState
  // into analytics/reporting pipeline. Kept here for now to support
  // simple session replay without an extra storage layer.
  scores: NormalizedScore[]

  // Lifecycle
  interviewProgress: number      // 0-100, derived from time + phase completion
  isComplete: boolean
}

// ============================================================================
// SECTION 3 — ANALYSIS
// ============================================================================

/**
 * Behavioral signals extracted from a single candidate answer.
 * Computed in backend — never exposed to the candidate.
 *
 * `ownershipScore` here is per-answer — distinct from the aggregate
 * `ownershipScore` in CandidateProfile.
 */
export interface BehaviorSignals {
  hesitation: 'low' | 'medium' | 'high'
  vagueness: 'low' | 'medium' | 'high'
  specificity: number            // 0-100

  ownershipScore: number         // 0-100 — per-answer
  ownershipType: 'individual' | 'collective' | 'unclear'

  confidence: number             // 0-100
  wordCount: number
  hasMetrics: boolean            // numbers, percentages, timeframes
  hasExamples: boolean           // STAR-style concrete examples
}

/**
 * Higher-level quality assessment of a response.
 */
export interface ResponseQuality {
  isOnTopic: boolean
  isComplete: boolean
  isSilent: boolean              // empty or near-empty
  structureScore: number         // 0-100
  depthScore: number             // 0-100
}

// ============================================================================
// SECTION 4 — SCORING
// ============================================================================

/**
 * Raw score block emitted by the LLM. Always pass through normalization.
 * Do NOT consume directly outside the scoring layer.
 */
export interface RawScore {
  score: number
  clarity?: number
  confidence?: number
  relevance?: number
  technical_depth?: number
  communication?: number
  problem_solving?: number
  leadership?: number
  notes?: string
}

export type ScoreSeverity = 'weak' | 'average' | 'strong' | 'exceptional'

/**
 * The canonical score used everywhere downstream.
 * Produced by `score-normalizer` from a RawScore + BehaviorSignals.
 *
 * `rawOverall` and `normalizedDelta` enable debugging and tuning of
 * the normalization layer (catch inflation drift over time).
 */
export interface NormalizedScore {
  overall: number                // 0-100, normalized

  clarity: number
  confidence: number
  relevance: number
  technicalDepth: number
  communication: number
  problemSolving: number
  leadership: number

  severity: ScoreSeverity
  notes: string

  rawOverall: number             // original LLM score before normalization
  normalizedDelta: number        // overall - rawOverall (negative = deflated)
}

// ============================================================================
// SECTION 5 — ORCHESTRATION RESULTS
// ============================================================================

/**
 * Result of a phase transition decision by phase-engine.
 */
export interface PhaseTransitionResult {
  previousPhase: InterviewPhase
  nextPhase: InterviewPhase
  transitioned: boolean
  reason: string
}

/**
 * Compact context passed to the prompt-builder.
 * Carries only what the LLM needs — keeps prompts lightweight.
 *
 * `recentTopics` is full TopicMemory[] (not just strings) so the
 * prompt builder can apply recency weighting, repetition avoidance,
 * and revisit logic.
 */
export interface PromptContext {
  phase: InterviewPhase
  pressureMode: PressureMode
  missingCompetencies: string[]
  contradictions: Contradiction[]
  recentTopics: TopicMemory[]
}

// ============================================================================
// SECTION 6 — ENGINE I/O
// ============================================================================

/**
 * Everything the engine needs to process one interview turn.
 *
 * `newUserMessage` is the candidate's latest input — it is NOT yet
 * inside `state.messages`. The engine is responsible for merging it.
 *
 * `now` is injected for deterministic time (testing, replay).
 */
export interface InterviewTurnInput {
  state: InterviewState
  newUserMessage: string
  now: number
}

/**
 * Everything the engine returns after processing one turn.
 * The route handler serializes this to the client.
 */
export interface InterviewTurnOutput {
  content: string
  score: NormalizedScore | null
  audioBase64: string | null
  state: InterviewState
  isEndOfSession: boolean
  finalScore?: number
}
