
// lib/barbaros/state/competency-tracker.ts
// Tracks competency probing, evidence strength, and prioritization.
//
// CONTRACT CHECK (against types.ts v3):
//   InterviewState fields used: competencyCoverage, config.sector
//   CompetencyCoverage fields used: coverage (0-100), evidenceCount, lastUpdated
//   constants used: UNIVERSAL_COMPETENCIES, SECTOR_COMPETENCIES
//
// KEY DESIGN NOTE:
//   In types.ts v3, the competency NAME is the KEY of the Record,
//   not a field inside CompetencyCoverage. Helpers that return
//   "competencies" return { name, data } pairs or just the names.
//
// SCALE CONVENTIONS:
//   - CompetencyCoverage.coverage: 0-100 (percentage)
//   - estimateEvidenceDelta returns 0-1 scale (caller multiplies by 100
//     before passing to probeCompetency in session-state.ts)
//
// ARCHITECTURAL RULES:
//   - Pure functions. No mutation. No LLM calls.
//   - All time-sensitive operations accept `now` as a parameter.

import type {
  InterviewState,
  CompetencyCoverage,
} from "../types";
import {
  UNIVERSAL_COMPETENCIES,
  SECTOR_COMPETENCIES,
} from "../constants";
import { normalizeSector } from "../utils/sanitization";

// ─────────────────────────────────────────────────────────────
// SECTION 1 — TYPES (local — for clarity in this module's API)
// ─────────────────────────────────────────────────────────────

/**
 * A competency entry paired with its name (since the name lives
 * in the Record key, not inside the CompetencyCoverage value).
 */
export interface NamedCompetency {
  name: string;
  data: CompetencyCoverage;
}

export interface CompetencyPriority {
  name: string;
  priority: number; // 0-1
  reason:
    | "unprobed"
    | "weak_evidence"
    | "moderate_evidence"
    | "well_covered";
}

export interface CompetencyStats {
  total: number;
  probed: number;
  unprobed: number;
  weak: number;
  strong: number;
  coverageRatio: number;        // 0-1
  averageCoverage: number;      // 0-100
}

// ─────────────────────────────────────────────────────────────
// SECTION 2 — COMPETENCY QUERIES (named pairs)
// ─────────────────────────────────────────────────────────────

export function getAllCompetencies(
  state: InterviewState
): NamedCompetency[] {
  return Object.entries(state.competencyCoverage).map(
    ([name, data]) => ({ name, data })
  );
}

export function getCompetency(
  state: InterviewState,
  name: string
): CompetencyCoverage | null {
  return state.competencyCoverage[name] ?? null;
}

export function getExpectedCompetencies(sector: string): string[] {
  const normalizedSector = normalizeSector(sector);
  const sectorComps = SECTOR_COMPETENCIES[normalizedSector] ?? [];
  return [...UNIVERSAL_COMPETENCIES, ...sectorComps];
}

// ─────────────────────────────────────────────────────────────
// SECTION 3 — COVERAGE STATUS
// ─────────────────────────────────────────────────────────────

export function getUnprobedCompetencies(
  state: InterviewState
): NamedCompetency[] {
  return getAllCompetencies(state).filter((c) => c.data.evidenceCount === 0);
}

export function getProbedCompetencies(
  state: InterviewState
): NamedCompetency[] {
  return getAllCompetencies(state).filter((c) => c.data.evidenceCount > 0);
}

/**
 * Weak: has been probed but coverage is still below threshold (default 40/100).
 */
export function getWeakCompetencies(
  state: InterviewState,
  coverageThreshold: number = 40
): NamedCompetency[] {
  return getAllCompetencies(state).filter(
    (c) => c.data.evidenceCount > 0 && c.data.coverage < coverageThreshold
  );
}

/**
 * Strong: coverage at or above threshold (default 60/100).
 */
export function getStrongCompetencies(
  state: InterviewState,
  coverageThreshold: number = 60
): NamedCompetency[] {
  return getAllCompetencies(state).filter(
    (c) => c.data.coverage >= coverageThreshold
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION 4 — METRICS
// ─────────────────────────────────────────────────────────────

export function getCoverageRatio(state: InterviewState): number {
  const all = getAllCompetencies(state);
  if (all.length === 0) return 1;
  const probed = all.filter((c) => c.data.evidenceCount > 0).length;
  return probed / all.length;
}

export function getAverageCoverage(state: InterviewState): number {
  const probed = getProbedCompetencies(state);
  if (probed.length === 0) return 0;
  const sum = probed.reduce((acc, c) => acc + c.data.coverage, 0);
  return sum / probed.length;
}

export function getCompetencyStats(state: InterviewState): CompetencyStats {
  const all = getAllCompetencies(state);
  const probed = all.filter((c) => c.data.evidenceCount > 0);

  return {
    total: all.length,
    probed: probed.length,
    unprobed: all.length - probed.length,
    weak: getWeakCompetencies(state).length,
    strong: getStrongCompetencies(state).length,
    coverageRatio: getCoverageRatio(state),
    averageCoverage: getAverageCoverage(state),
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 5 — PRIORITIZATION (what to probe next)
// ─────────────────────────────────────────────────────────────

/**
 * Rank competencies by probe priority:
 *   - Unprobed (evidenceCount === 0)        → priority 1.0
 *   - Weak (coverage < 40)                  → priority 0.7
 *   - Moderate (40 ≤ coverage < 60)         → priority 0.4
 *   - Well covered (coverage ≥ 60)          → priority 0.1
 *
 * Recency boost (+0.05) if last probed > 5 minutes ago (and not max).
 *
 * Returns top `limit` competencies above priority floor (0.2).
 */
export function getNextCompetenciesToProbe(
  state: InterviewState,
  now: number,
  limit: number = 3
): CompetencyPriority[] {
  const all = getAllCompetencies(state);
  const ranked: CompetencyPriority[] = all.map(({ name, data }) => {
    let priority: number;
    let reason: CompetencyPriority["reason"];

    if (data.evidenceCount === 0) {
      priority = 1.0;
      reason = "unprobed";
    } else if (data.coverage < 40) {
      priority = 0.7;
      reason = "weak_evidence";
    } else if (data.coverage < 60) {
      priority = 0.4;
      reason = "moderate_evidence";
    } else {
      priority = 0.1;
      reason = "well_covered";
    }

    // Recency boost: if last probed long ago, slight bump
    if (data.lastUpdated > 0 && data.evidenceCount > 0) {
      const elapsed = now - data.lastUpdated;
      const fiveMinutes = 5 * 60 * 1000;
      if (elapsed > fiveMinutes && priority < 0.9) {
        priority += 0.05;
      }
    }

    return { name, priority, reason };
  });

  return ranked
    .filter((r) => r.priority > 0.2)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────
// SECTION 6 — EVIDENCE ASSESSMENT
// ─────────────────────────────────────────────────────────────

/**
 * Estimate evidence delta from a user response.
 * Returns a value in the range [-0.15, 0.25] on a 0-1 scale.
 *
 * IMPORTANT: CompetencyCoverage.coverage is 0-100.
 * The caller (engine.ts) must multiply this result by 100
 * before passing to probeCompetency() in session-state.ts.
 *
 * Example:
 *   const delta01 = estimateEvidenceDelta(userText);   // 0.15
 *   probeCompetency(state, "leadership", now, delta01 * 100);  // +15
 */
export function estimateEvidenceDelta(userResponse: string): number {
  const text = userResponse.trim();
  if (text.length === 0) return -0.1;

  const wordCount = text.split(/\s+/).length;

  // Too short → negative evidence
  if (wordCount < 10) return -0.05;

  let delta = 0;

  // Base reward for substantive length
  if (wordCount >= 30) delta += 0.10;
  if (wordCount >= 60) delta += 0.05;
  if (wordCount >= 100) delta += 0.05;

  // Specificity markers (numbers, named entities, concrete examples)
  const hasNumbers = /\b\d+\b/.test(text);
  if (hasNumbers) delta += 0.05;

  // Example markers in English & Arabic
  const lower = text.toLowerCase();
  const exampleMarkers = [
    "for example", "for instance", "e.g.", "such as",
    "specifically", "in particular",
    "على سبيل المثال", "مثلاً", "مثلا", "بالتحديد",
  ];
  if (exampleMarkers.some((m) => lower.includes(m.toLowerCase()))) {
    delta += 0.08;
  }

  // STAR-pattern hints (situation/task/action/result)
  const starMarkers = [
    "result", "outcome", "achieved", "led to", "resulted in",
    "النتيجة", "أدى إلى", "حققت", "أنجزت",
  ];
  if (starMarkers.some((m) => lower.includes(m.toLowerCase()))) {
    delta += 0.05;
  }

  // Cap the per-turn delta
  return Math.max(-0.15, Math.min(0.25, delta));
}

// ─────────────────────────────────────────────────────────────
// SECTION 7 — COMPETENCY MATCHING (text → competency names)
// ─────────────────────────────────────────────────────────────

/**
 * Simple lexical matcher: returns names of competencies referenced
 * by a piece of text. Used to credit evidence to the right competencies
 * when no LLM-driven attribution is available.
 *
 * Matches either:
 *   - the full competency phrase (e.g. "classroom_management"
 *     OR "classroom management")
 *   - the first word of a multi-word competency (≥5 chars)
 */
export function matchCompetenciesInText(
  state: InterviewState,
  text: string
): string[] {
  const lower = text.toLowerCase();
  const matches: string[] = [];

  for (const competency of Object.keys(state.competencyCoverage)) {
    const compLower = competency.toLowerCase();
    const compSpaced = compLower.replace(/_/g, " ");

    if (lower.includes(compLower) || lower.includes(compSpaced)) {
      matches.push(competency);
      continue;
    }

    const firstWord = compSpaced.split(/\s+/)[0];
    if (firstWord.length >= 5 && lower.includes(firstWord)) {
      matches.push(competency);
    }
  }

  return matches;
}

// ─────────────────────────────────────────────────────────────
// SECTION 8 — SUMMARY (for prompt context)
// ─────────────────────────────────────────────────────────────

export function getCompetencySummary(state: InterviewState): {
  unprobed: string[];
  weak: string[];
  strong: string[];
} {
  return {
    unprobed: getUnprobedCompetencies(state).map((c) => c.name),
    weak: getWeakCompetencies(state).map((c) => c.name),
    strong: getStrongCompetencies(state).map((c) => c.name),
  };
}
