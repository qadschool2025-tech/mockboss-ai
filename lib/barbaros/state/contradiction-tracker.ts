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
