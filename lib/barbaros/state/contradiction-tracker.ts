// lib/barbaros/state/contradiction-tracker.ts
// CONTRACT: Contradiction tracker — detects and manages statement contradictions
// All time ops take `now: number`. No direct state mutation.

import type { Contradiction, InterviewPhase, Message } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ContradictionDetectionInput {
  messages: Message[];
  currentPhase: InterviewPhase;
  now: number;
}

export interface ContradictionPatch {
  add?: Contradiction[];
  markAddressed?: string[]; // contradiction ids
}

export interface ContradictionSummary {
  total: number;
  unaddressed: number;
  byTopic: Record<string, number>;
  highestSeverity: Contradiction['severity'] | null;
  hasMajor: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SEVERITY_KEYWORDS: Record<Contradiction['severity'], string[]> = {
  major: [
    'never', 'always', 'impossible', 'never did', 'not at all',
    'completely disagree', 'absolutely not', 'no experience',
  ],
  moderate: [
    'rarely', 'sometimes', 'occasionally', 'not sure', 'I think',
    'might have', 'possibly',
  ],
  minor: [],
};

// Minimum messages between statements to consider a contradiction real
const MIN_MESSAGE_GAP = 2;

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Detect new contradictions from messages.
 * Returns a patch (add array) — never mutates existing contradictions.
 */
export function detectContradictions(
  input: ContradictionDetectionInput,
  existingContradictions: Contradiction[]
): ContradictionPatch {
  const { messages, currentPhase, now } = input;

  const userMessages = messages
    .map((m, index) => ({ ...m, index }))
    .filter((m) => m.role === 'user');

  if (userMessages.length < 2) return {};

  const newContradictions: Contradiction[] = [];
  const existingIds = new Set(existingContradictions.map((c) => c.id));

  // Compare all user message pairs with sufficient gap
  for (let i = 0; i < userMessages.length - 1; i++) {
    for (let j = i + 1; j < userMessages.length; j++) {
      const earlier = userMessages[i];
      const later = userMessages[j];

      if (later.index - earlier.index < MIN_MESSAGE_GAP) continue;

      const topic = extractSharedTopic(earlier.content, later.content);
      if (!topic) continue;

      const contradictionSignal = scoreContradiction(earlier.content, later.content);
      if (contradictionSignal.severity === null) continue;

      const id = generateContradictionId(
        earlier.index,
        later.index,
        topic
      );

      if (existingIds.has(id)) continue;

      newContradictions.push({
        id,
        topic,
        earlierStatement: truncateStatement(earlier.content),
        earlierMessageIndex: earlier.index,
        laterStatement: truncateStatement(later.content),
        laterMessageIndex: later.index,
        severity: contradictionSignal.severity,
        addressed: false,
        detectedAt: now,
        phase: currentPhase,
      });

      existingIds.add(id);
    }
  }

  return newContradictions.length > 0 ? { add: newContradictions } : {};
}

/**
 * Mark contradictions as addressed by id.
 * Returns a patch — caller applies it to state.
 */
export function markContradictionsAddressed(
  ids: string[]
): ContradictionPatch {
  if (ids.length === 0) return {};
  return { markAddressed: ids };
}

/**
 * Apply a patch to an existing contradictions array.
 * Pure function — returns new array.
 */
export function applyContradictionPatch(
  contradictions: Contradiction[],
  patch: ContradictionPatch
): Contradiction[] {
  let result = [...contradictions];

  if (patch.add && patch.add.length > 0) {
    result = [...result, ...patch.add];
  }

  if (patch.markAddressed && patch.markAddressed.length > 0) {
    const addressedSet = new Set(patch.markAddressed);
    result = result.map((c) =>
      addressedSet.has(c.id) ? { ...c, addressed: true } : c
    );
  }

  return result;
}

/**
 * Summarize contradiction state for prompt context / scoring.
 */
export function summarizeContradictions(
  contradictions: Contradiction[]
): ContradictionSummary {
  const unaddressed = contradictions.filter((c) => !c.addressed);

  const byTopic: Record<string, number> = {};
  for (const c of unaddressed) {
    byTopic[c.topic] = (byTopic[c.topic] ?? 0) + 1;
  }

  const severityOrder: Contradiction['severity'][] = ['major', 'moderate', 'minor'];
  let highestSeverity: Contradiction['severity'] | null = null;

  for (const sev of severityOrder) {
    if (unaddressed.some((c) => c.severity === sev)) {
      highestSeverity = sev;
      break;
    }
  }

  return {
    total: contradictions.length,
    unaddressed: unaddressed.length,
    byTopic,
    highestSeverity,
    hasMajor: unaddressed.some((c) => c.severity === 'major'),
  };
}

/**
 * Get unaddressed contradictions sorted by severity (major first).
 */
export function getUnaddressedContradictions(
  contradictions: Contradiction[]
): Contradiction[] {
  const severityWeight: Record<Contradiction['severity'], number> = {
    major: 3,
    moderate: 2,
    minor: 1,
  };

  return contradictions
    .filter((c) => !c.addressed)
    .sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
}

/**
 * Get contradictions relevant to a specific topic.
 */
export function getContradictionsByTopic(
  contradictions: Contradiction[],
  topic: string
): Contradiction[] {
  const normalizedTopic = topic.toLowerCase().trim();
  return contradictions.filter(
    (c) => c.topic.toLowerCase().trim() === normalizedTopic
  );
}

// ─── Semantic Detection (LLM layer) ─────────────────────────────────────────────
//
// The heuristic above is intentionally shallow. Logical contradictions such as
// "I don't formally track participation" vs "participation improved" share no
// topic keyword and contain no negation pair, so the heuristic misses them
// entirely. The semantic layer fills that gap with a NARROW model call that does
// ONE job: judge whether the latest candidate statement conflicts with a prior.
//
// Strict boundaries (by design):
//   - The judge returns JSON only. It does NOT write interview questions,
//     manage the interview, or decide what Barbaros does next.
//   - `suggestedProbe` is advisory; the personality/question layer owns final
//     wording. The Director alone decides whether to confront.
//   - Only results at/above SEMANTIC_MIN_CONFIDENCE enter state, so the Director
//     never reasons about confidence and false confrontations are avoided — a
//     wrong confrontation costs more credibility than a missed one.
//
// The model call is INJECTED (`callModel`); this module imports no SDK and stays
// unit-testable. The engine supplies the transport in the wiring step.

const SEMANTIC_RECENT_CLAIMS = 10;   // prior candidate statements sent as context
const SEMANTIC_MIN_CONFIDENCE = 70;  // 0-100 — conservative entry gate

/** Transport injected by the engine. Returns the model's raw text output. */
export type SemanticModelCall = (args: {
  system: string;
  user: string;
}) => Promise<string>;

/** Raw, validated shape returned by the semantic judge. */
interface SemanticJudgeResult {
  contradiction: boolean;
  sourceClaim?: string;
  conflictingClaim?: string;
  type?: string;
  confidence?: number;
  suggestedProbe?: string;
  topic?: string;
}

/**
 * Detect a logical contradiction between the LATEST candidate statement and the
 * recent prior statements, using an injected narrow model call.
 *
 * Async and side-effect-free: returns a ContradictionPatch (never mutates).
 * Defensive: any transport/parse failure yields an empty patch — a detection
 * miss must never break the interview turn.
 *
 * One model call per turn (latest answer vs up to SEMANTIC_RECENT_CLAIMS
 * priors), so cost scales with turns, not pairwise.
 */
export async function detectContradictionsSemantic(
  input: ContradictionDetectionInput,
  existingContradictions: Contradiction[],
  callModel: SemanticModelCall
): Promise<ContradictionPatch> {
  const { messages, currentPhase, now } = input;

  const userMessages = messages
    .map((m, index) => ({ ...m, index }))
    .filter((m) => m.role === 'user');

  // Need at least one prior statement plus the new one.
  if (userMessages.length < 2) return {};

  const latest = userMessages[userMessages.length - 1];
  const priors = userMessages.slice(-1 - SEMANTIC_RECENT_CLAIMS, -1);
  if (priors.length === 0) return {};

  let raw: string;
  try {
    raw = await callModel({
      system: SEMANTIC_JUDGE_SYSTEM,
      user: buildSemanticJudgeUser(priors, latest.content),
    });
  } catch {
    return {}; // transport failure — fail safe, no contradiction
  }

  const judged = parseSemanticJudgeResult(raw);
  if (
    !judged ||
    !judged.contradiction ||
    !judged.sourceClaim ||
    !judged.conflictingClaim
  ) {
    return {};
  }

  const confidence = clampScore(judged.confidence ?? 0);
  if (confidence < SEMANTIC_MIN_CONFIDENCE) return {};

  const id = semanticContradictionId(judged.sourceClaim, judged.conflictingClaim);
  if (existingContradictions.some((c) => c.id === id)) return {};

  const earlierMessageIndex = locateStatementIndex(
    priors,
    judged.sourceClaim,
    priors[0].index
  );

  const contradiction: Contradiction = {
    id,
    topic: deriveSemanticTopic(judged),
    earlierStatement: truncateStatement(judged.sourceClaim),
    earlierMessageIndex,
    laterStatement: truncateStatement(judged.conflictingClaim),
    laterMessageIndex: latest.index,
    severity: severityFromConfidence(confidence),
    addressed: false,
    detectedAt: now,
    phase: currentPhase,
    // semantic metadata (optional fields, types v3.1)
    source: 'semantic',
    confidence,
    suggestedProbe: judged.suggestedProbe?.trim() || undefined,
    contradictionType: judged.type?.trim() || undefined,
  };

  // TEMP DIAGNOSTIC — remove after contradiction verification. Proves the
  // SEMANTIC detector (not the heuristic, not the LLM interviewer's own
  // judgment) is what caught this contradiction. Read in Vercel → Logs.
  // Logs only: no behavior, Director, prompt, or scoring change.
  console.log(
    '[barbaros:contradiction]',
    `source=semantic confidence=${confidence} type=${contradiction.contradictionType ?? 'unknown'} topic=${contradiction.topic} id=${contradiction.id}`
  );

  return { add: [contradiction] };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

interface ContradictionSignal {
  severity: Contradiction['severity'] | null;
}

/**
 * Score whether two statements likely contradict each other.
 * Lightweight heuristic — LLM layer handles deeper detection.
 */
function scoreContradiction(
  earlier: string,
  later: string
): ContradictionSignal {
  const e = earlier.toLowerCase();
  const l = later.toLowerCase();

  // Check for negation patterns
  const negationPairs = [
    ['i have', "i haven't"],
    ['i have', 'i have not'],
    ['i did', "i didn't"],
    ['i did', 'i did not'],
    ['i can', "i can't"],
    ['i can', 'i cannot'],
    ['i am', "i'm not"],
    ['i am', 'i am not'],
    ['always', 'never'],
    ['yes', 'no'],
    ['experience', 'no experience'],
    ['worked', 'never worked'],
    ['managed', 'never managed'],
    ['led', 'never led'],
  ];

  for (const [pos, neg] of negationPairs) {
    if (
      (e.includes(pos) && l.includes(neg)) ||
      (e.includes(neg) && l.includes(pos))
    ) {
      const severity = detectSeverityFromKeywords(e, l);
      return { severity: severity ?? 'moderate' };
    }
  }

  // Check for major severity keywords
  for (const kw of SEVERITY_KEYWORDS.major) {
    if (e.includes(kw) !== l.includes(kw)) {
      return { severity: 'major' };
    }
  }

  return { severity: null };
}

function detectSeverityFromKeywords(
  earlier: string,
  later: string
): Contradiction['severity'] | null {
  const combined = earlier + ' ' + later;

  for (const kw of SEVERITY_KEYWORDS.major) {
    if (combined.includes(kw)) return 'major';
  }
  for (const kw of SEVERITY_KEYWORDS.moderate) {
    if (combined.includes(kw)) return 'moderate';
  }
  return 'minor';
}

/**
 * Extract a shared topic keyword from two statements.
 * Returns null if no meaningful shared topic is found.
 */
function extractSharedTopic(earlier: string, later: string): string | null {
  const TOPIC_KEYWORDS = [
    'management', 'leadership', 'team', 'project', 'budget',
    'experience', 'years', 'skills', 'education', 'degree',
    'role', 'responsibilities', 'achievement', 'performance',
    'technology', 'tools', 'languages', 'certification',
    'teaching', 'students', 'curriculum', 'classroom',
    'research', 'publications', 'analysis', 'data',
  ];

  const e = earlier.toLowerCase();
  const l = later.toLowerCase();

  for (const kw of TOPIC_KEYWORDS) {
    if (e.includes(kw) && l.includes(kw)) {
      return kw;
    }
  }

  return null;
}

function generateContradictionId(
  earlierIndex: number,
  laterIndex: number,
  topic: string
): string {
  return `contradiction_${earlierIndex}_${laterIndex}_${topic.replace(/\s+/g, '_')}`;
}

function truncateStatement(content: string, maxLength = 200): string {
  const cleaned = content.trim();
  return cleaned.length > maxLength
    ? cleaned.slice(0, maxLength) + '…'
    : cleaned;
}

// ─── Semantic Internal Helpers ──────────────────────────────────────────────────

const SEMANTIC_JUDGE_SYSTEM = [
  'You are a contradiction detector for a job interview assessment engine.',
  "Your ONLY task: decide whether the candidate's LATEST statement logically",
  'contradicts any of their earlier statements.',
  '',
  'A contradiction means the two statements cannot both be true, or one',
  'undermines a claim the other depends on. Examples: claiming not to do',
  'something, then describing a result that requires doing it; giving',
  'incompatible numbers, timelines, or scope for the same thing.',
  '',
  'NOT contradictions: elaboration, changing topic, adding nuance, vague',
  'answers, or simply weak responses.',
  '',
  'You do NOT write interview questions. You do NOT manage the interview.',
  'You do NOT decide what happens next. You ONLY judge and report.',
  '',
  'Respond with a SINGLE JSON object and NOTHING else (no markdown, no prose).',
  'If a contradiction exists:',
  '{"contradiction":true,"sourceClaim":"<earlier statement, verbatim or close>",',
  '"conflictingClaim":"<the latest conflicting statement>",',
  '"type":"logical|factual|temporal|numerical|scope",',
  '"confidence":<0-100 integer>,',
  '"suggestedProbe":"<one neutral clarifying question>","topic":"<2-4 word label>"}',
  'If no contradiction:',
  '{"contradiction":false}',
].join('\n');

function buildSemanticJudgeUser(
  priors: Array<{ content: string }>,
  latest: string
): string {
  const priorLines = priors
    .map((p, i) => `[${i + 1}] ${p.content.trim()}`)
    .join('\n');
  return [
    'EARLIER CANDIDATE STATEMENTS:',
    priorLines,
    '',
    'LATEST CANDIDATE STATEMENT:',
    latest.trim(),
    '',
    'Judge the LATEST statement against the earlier ones. Return JSON only.',
  ].join('\n');
}

/**
 * Extract the first balanced JSON object from raw model text and validate it.
 * Returns null on any failure. Never throws.
 */
function parseSemanticJudgeResult(raw: string): SemanticJudgeResult | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.contradiction !== 'boolean') return null;

  return {
    contradiction: obj.contradiction,
    sourceClaim: typeof obj.sourceClaim === 'string' ? obj.sourceClaim : undefined,
    conflictingClaim:
      typeof obj.conflictingClaim === 'string' ? obj.conflictingClaim : undefined,
    type: typeof obj.type === 'string' ? obj.type : undefined,
    confidence: typeof obj.confidence === 'number' ? obj.confidence : undefined,
    suggestedProbe:
      typeof obj.suggestedProbe === 'string' ? obj.suggestedProbe : undefined,
    topic: typeof obj.topic === 'string' ? obj.topic : undefined,
  };
}

/** Map judge confidence to the existing severity scale. Conservative. */
function severityFromConfidence(confidence: number): Contradiction['severity'] {
  if (confidence >= 85) return 'major';
  return 'moderate';
}

function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Stable id from the conflicting pair, so the same pair is not re-added. */
function semanticContradictionId(source: string, conflicting: string): string {
  const key = normalizeForId(source) + '||' + normalizeForId(conflicting);
  return `contradiction_sem_${djb2(key)}`;
}

function normalizeForId(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 160);
}

function djb2(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** Best-effort message index for the earlier statement; falls back to default. */
function locateStatementIndex(
  priors: Array<{ content: string; index: number }>,
  claim: string,
  fallback: number
): number {
  const needle = claim.toLowerCase().trim().slice(0, 40);
  if (!needle) return fallback;
  for (let i = priors.length - 1; i >= 0; i--) {
    if (priors[i].content.toLowerCase().includes(needle)) return priors[i].index;
  }
  return fallback;
}

/** Derive a topic label for byTopic grouping; reuse type when no label given. */
function deriveSemanticTopic(judged: SemanticJudgeResult): string {
  const t = (judged.topic ?? '').trim();
  if (t) return t.toLowerCase();
  const ct = (judged.type ?? '').trim();
  return ct ? ct.toLowerCase() : 'consistency';
}
