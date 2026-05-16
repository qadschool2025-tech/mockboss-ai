// ============================================================================
// Barbaros V4 — Type System
// Production-grade domain model. Single source of truth.
// Pure types only — zero runtime logic, zero helpers, zero validation.
// ============================================================================

// ============================================================================
// SECTION 1 — DOMAIN
// ============================================================================

/**
 * Core sectors with dedicated logic (competencies, question patterns).
 * Use this union for type-safe sector checks.
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
 * This is the full candidate context.
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
  subject?: string // For teachers — subject area
}

/**
 * A single message in the conversation history.
 * `system` role is reserved for internal orchestration messages
 * (hidden injections, state hints) and is never shown to the candidate.
 */
export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
  score?: NormalizedScore
  timestamp?: number
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
  coverage: number // 0-100
  evidenceCount: number
  lastUpdated: number
}

/**
 * A topic discussed in the interview, with metadata for repetition control.
 */
export interface TopicMemory {
  topic: string;
  phase: InterviewPhase | null;
  timesVisited: number;
  lastVisitedAt: number;
  firstVisitedAt: number;
  revisitAllowed: boolean;
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
}

/**
 * Aggregate session metrics. Updated each turn.
 */
export interface SessionMetrics {
  averageScore: number
  averageResponseLength: number
  hesitationCount: number
  vaguenessCount: number
  silenceEvents: number
  contradictionCount: number
  specificityScore: number // 0-100
  totalQuestions: number
  totalAnswers: number
}

/**
 * Running snapshot of the candidate based on accumulated evidence.
 * `ownershipScore` here is an aggregate across the session — distinct from
 * the per-answer `ownershipScore` in BehaviorSignals.
 */
export interface CandidateProfile {
  strengths: string[]
  weaknesses: string[]
  confidenceLevel: number // 0-100
  ownershipScore: number // 0-100 — aggregate ownership across session
}

/**
 * THE CENTRAL STATE OBJECT.
 * Every layer reads from it and returns a patch to update it.
 * Treated as immutable — never mutate directly.
 *
 * `version` enables future migrations of persisted sessions
 * without breaking older clients.
 */
export interface InterviewState {
  version: 1

  phase: InterviewPhase
  phaseQuestionCount: number // questions asked within the current phase
  phaseStartedAt: number // ms epoch — when current phase began

  pressureMode: PressureMode

  competencyCoverage: Record<string, CompetencyCoverage>
  recentTopics: TopicMemory[]
  askedQuestionFingerprints: string[] // normalized fingerprints of asked questions

  contradictions: Contradiction[]

  candidateProfile: CandidateProfile
  metrics: SessionMetrics

  interviewProgress: number // 0-100, derived from time + phase completion
  sessionStartTime: number // ms epoch
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
  specificity: number // 0-100 — concrete details, numbers, names

  ownershipScore: number // 0-100 — per-answer ownership signal
  ownershipType: 'individual' | 'collective' | 'unclear'

  confidence: number // 0-100
  wordCount: number
  hasMetrics: boolean // mentions numbers, percentages, timeframes
  hasExamples: boolean // STAR-style concrete examples
}

/**
 * Higher-level quality assessment of a response.
 */
export interface ResponseQuality {
  isOnTopic: boolean
  isComplete: boolean
  isSilent: boolean // empty or near-empty
  structureScore: number // 0-100 — how well-structured the answer is
  depthScore: number // 0-100 — depth of insight
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
  overall: number // 0-100, normalized (no inflation)

  clarity: number
  confidence: number
  relevance: number
  technicalDepth: number
  communication: number
  problemSolving: number
  leadership: number

  severity: ScoreSeverity
  notes: string

  rawOverall: number // original LLM score before normalization
  normalizedDelta: number // overall - rawOverall (negative = deflated)
}

// ============================================================================
// SECTION 5 — ORCHESTRATION RESULTS
// ============================================================================

/**
 * Result of a phase transition decision by phase-engine.
 * Carries the reason for transparency and debugging.
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
 */
export interface PromptContext {
  phase: InterviewPhase
  pressureMode: PressureMode
  missingCompetencies: string[]
  contradictions: Contradiction[]
  recentTopics: string[]
}

// ============================================================================
// SECTION 6 — ENGINE I/O
// ============================================================================

/**
 * Everything the engine needs to process one interview turn.
 */
export interface InterviewTurnInput {
  config: InterviewConfig
  messages: Message[]
  state: InterviewState
}

/**
 * Everything the engine returns after processing one turn.
 * The route handler serializes this to the client.
 */
export interface InterviewTurnOutput {
  content: string
  score: NormalizedScore | null
  audioBase64: string | null
  state: InterviewState // updated state to persist on the client
  isEndOfSession: boolean
  finalScore?: number
}
