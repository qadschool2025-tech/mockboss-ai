// ============================================================================
// Barbaros V4 — Constants
// Pure values only. Zero logic, zero functions.
// Imported by engines, never by types.
// ============================================================================

import type {
  InterviewPhase,
  PressureMode,
  CoreSector,
  Plan,
  ScoreSeverity,
} from './types'

// ============================================================================
// SECTION 1 — PHASES
// ============================================================================

/**
 * Canonical phase order. Phase engine progresses through this sequence.
 */
export const PHASE_ORDER: readonly InterviewPhase[] = [
  'opening',
  'motivation',
  'cv_deep_dive',
  'technical',
  'behavioral',
  'pressure',
  'closing',
] as const

/**
 * Target number of questions per phase before transition is considered.
 * Phase engine uses these as soft targets — actual transitions also depend
 * on coverage, time, and candidate signals.
 */
export const MAX_QUESTIONS_PER_PHASE: Record<InterviewPhase, number> = {
  opening: 1,
  motivation: 2,
  cv_deep_dive: 3,
  technical: 5,
  behavioral: 3,
  pressure: 2,
  closing: 1,
}

/**
 * Minimum questions before a phase is allowed to transition.
 * Prevents premature jumps even if signals push for transition.
 */
export const MIN_QUESTIONS_PER_PHASE: Record<InterviewPhase, number> = {
  opening: 1,
  motivation: 1,
  cv_deep_dive: 2,
  technical: 3,
  behavioral: 2,
  pressure: 1,
  closing: 1,
}

// ============================================================================
// SECTION 2 — PRESSURE
// ============================================================================

/**
 * Default pressure mode at session start.
 */
export const DEFAULT_PRESSURE_MODE: PressureMode = 'neutral'

/**
 * Thresholds used by pressure-selector to escalate or de-escalate.
 * Values are 0-100 scales matching BehaviorSignals fields.
 */
export const PRESSURE_THRESHOLDS = {
  // Escalate to skeptical when vagueness is persistent
  SKEPTICAL_VAGUENESS_MIN: 60,

  // Escalate to analytical when specificity is missing
  ANALYTICAL_SPECIFICITY_MAX: 40,

  // Escalate to fast_paced when confidence is very high (test under pressure)
  FAST_PACED_CONFIDENCE_MIN: 75,

  // Silence pressure triggers after this many consecutive low-content answers
  SILENCE_PRESSURE_TRIGGER_COUNT: 2,

  // De-escalate to neutral if candidate recovers
  NEUTRAL_RECOVERY_SPECIFICITY: 65,
} as const

// ============================================================================
// SECTION 3 — SECTORS
// ============================================================================

/**
 * All recognized core sectors. Used for normalization fallback.
 */
export const CORE_SECTORS: readonly CoreSector[] = [
  'technology',
  'education',
  'healthcare',
  'finance',
  'government',
  'marketing',
  'sales',
  'legal',
  'customer_support',
  'human_resources',
  'operations',
  'general',
] as const

/**
 * Common aliases mapping free-form input → canonical CoreSector.
 * Consumed by `normalizeSector()` in utils/sanitization.
 * Keys are lowercased for case-insensitive matching.
 */
export const SECTOR_ALIASES: Record<string, CoreSector> = {
  // Technology
  tech: 'technology',
  it: 'technology',
  software: 'technology',
  engineering: 'technology',
  'software engineering': 'technology',
  developer: 'technology',
  programming: 'technology',

  // Education
  teaching: 'education',
  teacher: 'education',
  academic: 'education',
  school: 'education',
  university: 'education',

  // Healthcare
  medical: 'healthcare',
  health: 'healthcare',
  nursing: 'healthcare',
  clinical: 'healthcare',

  // Finance
  banking: 'finance',
  accounting: 'finance',
  financial: 'finance',
  investment: 'finance',

  // Government
  public: 'government',
  'public sector': 'government',
  ministry: 'government',

  // Marketing
  advertising: 'marketing',
  branding: 'marketing',
  digital: 'marketing',

  // Sales
  'business development': 'sales',
  bd: 'sales',
  'account management': 'sales',

  // Legal
  law: 'legal',
  lawyer: 'legal',
  attorney: 'legal',

  // Customer Support
  support: 'customer_support',
  'customer service': 'customer_support',
  cs: 'customer_support',

  // HR
  hr: 'human_resources',
  'people ops': 'human_resources',
  recruiting: 'human_resources',

  // Operations
  ops: 'operations',
  logistics: 'operations',
  'supply chain': 'operations',
}

// ============================================================================
// SECTION 4 — COMPETENCIES
// ============================================================================

/**
 * Universal competencies expected from every candidate, regardless of sector.
 */
export const UNIVERSAL_COMPETENCIES: readonly string[] = [
  'communication',
  'problem_solving',
  'ownership',
  'adaptability',
] as const

/**
 * Sector-specific competency map.
 * Combined with UNIVERSAL_COMPETENCIES to form the full target set.
 */
export const SECTOR_COMPETENCIES: Record<CoreSector, readonly string[]> = {
  technology: [
    'technical_depth',
    'system_design',
    'debugging',
    'code_quality',
    'architecture',
  ],
  education: [
    'pedagogy',
    'classroom_management',
    'curriculum_design',
    'student_assessment',
    'differentiation',
  ],
  healthcare: [
    'clinical_judgment',
    'patient_care',
    'protocol_adherence',
    'crisis_management',
    'empathy',
  ],
  finance: [
    'analytical_thinking',
    'financial_modeling',
    'risk_assessment',
    'regulatory_knowledge',
    'attention_to_detail',
  ],
  government: [
    'policy_understanding',
    'stakeholder_management',
    'compliance',
    'public_service_ethos',
  ],
  marketing: [
    'strategic_thinking',
    'creativity',
    'data_analysis',
    'brand_understanding',
    'campaign_execution',
  ],
  sales: [
    'persuasion',
    'pipeline_management',
    'objection_handling',
    'relationship_building',
    'closing_skills',
  ],
  legal: [
    'legal_reasoning',
    'attention_to_detail',
    'research_skills',
    'negotiation',
    'ethics',
  ],
  customer_support: [
    'empathy',
    'de_escalation',
    'product_knowledge',
    'efficiency',
    'patience',
  ],
  human_resources: [
    'people_judgment',
    'conflict_resolution',
    'policy_knowledge',
    'confidentiality',
    'talent_assessment',
  ],
  operations: [
    'process_optimization',
    'logistics',
    'vendor_management',
    'cost_control',
    'scalability',
  ],
  general: [
    'critical_thinking',
    'collaboration',
    'time_management',
    'leadership',
  ],
}

// ============================================================================
// SECTION 5 — SCORING
// ============================================================================

/**
 * Severity bands. Used to classify NormalizedScore.overall into a label.
 * Boundaries are inclusive on the lower bound.
 */
export const SCORE_THRESHOLDS: Record<ScoreSeverity, { min: number; max: number }> = {
  weak: { min: 0, max: 39 },
  average: { min: 40, max: 64 },
  strong: { min: 65, max: 84 },
  exceptional: { min: 85, max: 100 },
}

/**
 * Normalization parameters. Used by score-normalizer to fight LLM inflation.
 *
 * - INFLATION_PENALTY: subtracted from any raw score above 80.
 * - HESITATION_PENALTY: subtracted when hesitation is 'high'.
 * - VAGUENESS_PENALTY: subtracted when vagueness is 'high'.
 * - SPECIFICITY_BONUS: added when specificity > 80.
 * - MIN_SCORE / MAX_SCORE: clamp bounds.
 */
export const SCORE_NORMALIZATION = {
  INFLATION_PENALTY: 8,
  HESITATION_PENALTY: 6,
  VAGUENESS_PENALTY: 7,
  SPECIFICITY_BONUS: 4,
  MIN_SCORE: 0,
  MAX_SCORE: 100,
} as const

// ============================================================================
// SECTION 6 — LIMITS
// ============================================================================

/**
 * Memory and history bounds. Keep these tight to control prompt size.
 */
export const LIMITS = {
  MAX_TOPIC_MEMORY: 10, // recentTopics array cap
  MAX_ASKED_QUESTIONS: 30, // fingerprint history cap
  MAX_CONTRADICTIONS: 15,
  MAX_MESSAGE_LENGTH: 4000, // characters per message before truncation
  MIN_ANSWER_WORDS: 3, // below this → treated as silent/incomplete
  SILENCE_THRESHOLD_MS: 30_000, // 30s of no input triggers silence handling
  TOPIC_COOLDOWN_QUESTIONS: 3, // questions before a topic can be revisited
} as const

// ============================================================================
// SECTION 7 — TIME LIMITS (per plan)
// ============================================================================

/**
 * Session duration in seconds, by plan.
 * Matches the published pricing tiers.
 */
export const TIME_LIMITS: Record<Plan, number> = {
  free: 15 * 60, // 15 min — Go intro / trial
  go: 15 * 60, // 15 min — single session
  pro: 30 * 60, // 30 min
  expert: 45 * 60, // 45 min
}

// ============================================================================
// SECTION 8 — LLM
// ============================================================================

/**
 * Model and generation parameters for Claude calls.
 * Centralized so a single switch can swap models project-wide.
 *
 * MAX_TOKENS_STANDARD raised 250 → 768: an Arabic 2–3 sentence answer plus the
 * appended <score> JSON block could exceed 250 tokens and get cut mid-block,
 * leaking an unclosed <score> tag. This is a ceiling, not a target — brevity is
 * still enforced by the prompt; the higher value only prevents truncation.
 */
export const LLM_CONFIG = {
  MODEL: 'claude-sonnet-4-5',
  MAX_TOKENS_OPENING: 80,
  MAX_TOKENS_STANDARD: 768,
  MAX_TOKENS_CLOSING: 120,
} as const

/**
 * Current state schema version. Bump when InterviewState shape changes
 * in a breaking way; migration logic will key off this.
 */
export const STATE_VERSION = 1 as const
// ─────────────────────────────────────────────────────────────
// SECTION 9 — LANGUAGE DATA (STOP WORDS)
// ─────────────────────────────────────────────────────────────

export const STOP_WORDS: ReadonlySet<string> = new Set([
  // English — articles, conjunctions, prepositions
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "must", "shall",
  "can", "of", "in", "to", "for", "with", "on", "at", "by", "from",
  "about", "as", "into", "through", "during", "after", "before",
  "between", "above", "below", "up", "down", "out", "off", "over",
  "under", "again", "further", "then", "once", "here", "there",
  // English — pronouns
  "you", "your", "yours", "yourself", "yourselves",
  "i", "me", "my", "mine", "myself",
  "we", "us", "our", "ours", "ourselves",
  "he", "him", "his", "himself",
  "she", "her", "hers", "herself",
  "it", "its", "itself",
  "they", "them", "their", "theirs", "themselves",
  // English — determiners & question words
  "this", "that", "these", "those", "what", "which", "who", "whom",
  "how", "when", "where", "why", "any", "some", "all", "each", "every",
  "both", "few", "more", "most", "other", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very",
  // English — interview-specific filler verbs
  "tell", "describe", "explain", "share", "talk", "discuss", "say",
  "said", "think", "thought", "know", "knew", "want", "wanted",
  "like", "liked", "get", "got", "make", "made", "go", "went",
  // Arabic — prepositions & particles
  "في", "من", "إلى", "على", "عن", "مع", "حتى", "بعد", "قبل", "عند",
  "لدى", "نحو", "بين", "تحت", "فوق", "أمام", "خلف",
  // Arabic — question & demonstratives
  "هل", "ما", "ماذا", "كيف", "متى", "أين", "لماذا", "أي", "أية",
  "هذا", "هذه", "ذلك", "تلك", "هؤلاء", "أولئك", "هنا", "هناك",
  // Arabic — pronouns
  "أنا", "أنت", "أنتِ", "نحن", "هم", "هن", "هي", "هو", "أنتم", "أنتن",
  // Arabic — verbs of being & common
  "أن", "إن", "كان", "كانت", "كانوا", "يكون", "تكون", "صار", "أصبح",
  "ليس", "ليست", "ولا", "ولم", "ولن", "قد", "لقد", "كل", "بعض",
  // Arabic — interview filler verbs
  "قل", "قال", "أخبر", "اشرح", "تكلم", "ناقش", "اعتقد", "أعتقد",
  "أعرف", "أريد", "أحب",
]);

// ─────────────────────────────────────────────────────────────
// SECTION 10 — TOPIC SYNONYM NORMALIZATION
// ─────────────────────────────────────────────────────────────

// Maps surface keywords → canonical topic labels.
// Used by topic-memory to collapse "redis", "caching", "optimization"
// into one canonical topic for accurate duplicate / coverage detection.
// Keys MUST be lowercase, canonicalized form.
export const TOPIC_SYNONYMS: Readonly<Record<string, string>> = {
  // Performance & optimization
  "caching": "performance_optimization",
  "redis": "performance_optimization",
  "memcache": "performance_optimization",
  "memcached": "performance_optimization",
  "optimization": "performance_optimization",
  "optimize": "performance_optimization",
  "optimized": "performance_optimization",
  "performance": "performance_optimization",
  "latency": "performance_optimization",
  "throughput": "performance_optimization",

  // Architecture & scalability
  "microservices": "system_architecture",
  "monolith": "system_architecture",
  "architecture": "system_architecture",
  "scalability": "system_architecture",
  "scaling": "system_architecture",
  "distributed": "system_architecture",
  "infrastructure": "system_architecture",

  // Leadership & people
  "leadership": "leadership",
  "leading": "leadership",
  "led": "leadership",
  "managed": "leadership",
  "managing": "leadership",
  "mentored": "leadership",
  "mentoring": "leadership",
  "mentorship": "leadership",
  "coached": "leadership",
  "coaching": "leadership",

  // Conflict & collaboration
  "conflict": "conflict_resolution",
  "disagreement": "conflict_resolution",
  "tension": "conflict_resolution",
  "dispute": "conflict_resolution",
  "collaboration": "collaboration",
  "teamwork": "collaboration",
  "team": "collaboration",
  "partnered": "collaboration",

  // Communication
  "communication": "communication",
  "presented": "communication",
  "presentation": "communication",
  "stakeholder": "communication",
  "stakeholders": "communication",

  // Problem solving
  "debugging": "problem_solving",
  "debug": "problem_solving",
  "troubleshoot": "problem_solving",
  "troubleshooting": "problem_solving",
  "investigated": "problem_solving",
  "diagnosed": "problem_solving",

  // Teaching domain (sector-aware synonyms)
  "classroom": "classroom_management",
  "discipline": "classroom_management",
  "lesson": "lesson_planning",
  "curriculum": "curriculum_design",
  "assessment": "student_assessment",
  "grading": "student_assessment",
  "differentiation": "differentiated_instruction",

  // Arabic equivalents
  "قيادة": "leadership",
  "إدارة": "leadership",
  "فريق": "collaboration",
  "تعاون": "collaboration",
  "تواصل": "communication",
  "نزاع": "conflict_resolution",
  "خلاف": "conflict_resolution",
  "أداء": "performance_optimization",
  "تحسين": "performance_optimization",
  "تخطيط": "lesson_planning",
  "منهج": "curriculum_design",
  "تقييم": "student_assessment",
  "صف": "classroom_management",
  "فصل": "classroom_management",
};

// Helper-free normalization: pure data only.
// The actual normalization function lives in utils/text.ts
