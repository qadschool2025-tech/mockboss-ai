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

export interface NamedCompetency {
  name: string;
  data: CompetencyCoverage;
}

export interface CompetencyPriority {
  name: string;
  priority: number;
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
  coverageRatio: number;
  averageCoverage: number;
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

export function getWeakCompetencies(
  state: InterviewState,
  coverageThreshold: number = 40
): NamedCompetency[] {
  return getAllCompetencies(state).filter(
    (c) => c.data.evidenceCount > 0 && c.data.coverage < coverageThreshold
  );
}

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

export function estimateEvidenceDelta(userResponse: string): number {
  const text = userResponse.trim();
  if (text.length === 0) return -0.1;

  const wordCount = text.split(/\s+/).length;
  if (wordCount < 10) return -0.05;

  let delta = 0;

  if (wordCount >= 30) delta += 0.10;
  if (wordCount >= 60) delta += 0.05;
  if (wordCount >= 100) delta += 0.05;

  const hasNumbers = /\b\d+\b/.test(text);
  if (hasNumbers) delta += 0.05;

  const lower = text.toLowerCase();
  const exampleMarkers = [
    "for example", "for instance", "e.g.", "such as",
    "specifically", "in particular",
    "على سبيل المثال", "مثلاً", "مثلا", "بالتحديد",
  ];
  if (exampleMarkers.some((m) => lower.includes(m.toLowerCase()))) {
    delta += 0.08;
  }

  const starMarkers = [
    "result", "outcome", "achieved", "led to", "resulted in",
    "النتيجة", "أدى إلى", "حققت", "أنجزت",
  ];
  if (starMarkers.some((m) => lower.includes(m.toLowerCase()))) {
    delta += 0.05;
  }

  return Math.max(-0.15, Math.min(0.25, delta));
}

// ─────────────────────────────────────────────────────────────
// SECTION 7 — COMPETENCY MATCHING (text → competency names)
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// SECTION 9 — SAFE APPLY HELPER
// ─────────────────────────────────────────────────────────────

/**
 * Safe helper: estimates delta and applies it directly to a competency.
 * Handles the 0-1 → 0-100 scale conversion internally.
 * Prefer this over calling estimateEvidenceDelta + probeCompetency separately.
 */
export function applyEvidenceDelta(
  state: InterviewState,
  competencyName: string,
  userResponse: string,
  now: number
): InterviewState {
  const delta01 = estimateEvidenceDelta(userResponse);
  const delta100 = delta01 * 100;

  const existing = state.competencyCoverage[competencyName];
  if (!existing) return state;

  const updated: CompetencyCoverage = {
    coverage: Math.max(0, Math.min(100, existing.coverage + delta100)),
    evidenceCount: existing.evidenceCount + (delta01 > 0 ? 1 : 0),
    lastUpdated: now,
  };

  return {
    ...state,
    competencyCoverage: {
      ...state.competencyCoverage,
      [competencyName]: updated,
    },
  };
}
