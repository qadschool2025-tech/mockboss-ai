
// ============================================================================
// Barbaros V4 — Sanitization Utilities
// Clean and normalize raw user input before it enters the engine.
// Pure functions. No side effects.
// ============================================================================

import type { CoreSector, Sector, InterviewConfig } from '../types'
import { CORE_SECTORS, SECTOR_ALIASES, LIMITS } from '../constants'
import { normalizeWhitespace, truncate } from './text'

// ============================================================================
// SECTOR NORMALIZATION
// ============================================================================

/**
 * Normalize a free-form sector string into a canonical CoreSector.
 *
 * Strategy:
 *  1. Lowercase + trim
 *  2. Direct match against CORE_SECTORS
 *  3. Direct match against SECTOR_ALIASES
 *  4. Substring match against alias keys (longest first)
 *  5. Fallback to 'general'
 */
export function normalizeSector(raw: Sector | string | undefined | null): CoreSector {
  if (!raw) return 'general'

  const key = String(raw).toLowerCase().trim()
  if (!key) return 'general'

  // Direct match against core sectors
  if ((CORE_SECTORS as readonly string[]).includes(key)) {
    return key as CoreSector
  }

  // Direct alias match
  if (SECTOR_ALIASES[key]) {
    return SECTOR_ALIASES[key]
  }

  // Substring match (longest alias first to prefer specific over generic)
  const aliasKeys = Object.keys(SECTOR_ALIASES).sort((a, b) => b.length - a.length)
  for (const alias of aliasKeys) {
    if (key.includes(alias)) {
      return SECTOR_ALIASES[alias]
    }
  }

  return 'general'
}

// ============================================================================
// STRING CLEANING
// ============================================================================

/**
 * Strip control characters (except newlines and tabs).
 * Prevents prompt-injection vectors via zero-width or control codes.
 */
export function stripControlChars(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/**
 * Remove zero-width and bidi-override characters.
 * Defense against hidden injection in pasted content.
 */
export function stripInvisibleChars(text: string): string {
  return text.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
}

/**
 * Full sanitization pass for user-supplied text:
 *  - strip control + invisible chars
 *  - normalize whitespace
 *  - truncate to max length
 */
export function sanitizeUserText(
  text: string,
  maxLength: number = LIMITS.MAX_MESSAGE_LENGTH
): string {
  if (!text) return ''
  const cleaned = stripInvisibleChars(stripControlChars(text))
  return truncate(normalizeWhitespace(cleaned), maxLength)
}

/**
 * Sanitize a short identifier-like field (name, job title, institution).
 * Stricter than sanitizeUserText — no newlines, capped shorter.
 */
export function sanitizeShortField(text: string, maxLength: number = 200): string {
  if (!text) return ''
  const cleaned = stripInvisibleChars(stripControlChars(text)).replace(/[\r\n]+/g, ' ')
  return truncate(normalizeWhitespace(cleaned), maxLength)
}

// ============================================================================
// CONFIG SANITIZATION
// ============================================================================

/**
 * Sanitize an entire InterviewConfig object.
 * Returns a new object — does not mutate the input.
 * Sector is normalized to a CoreSector here as well.
 */
export function sanitizeConfig(config: InterviewConfig): InterviewConfig {
  return {
    ...config,
    candidateName: sanitizeShortField(config.candidateName, 100),
    jobTitle: sanitizeShortField(config.jobTitle, 150),
    institution: sanitizeShortField(config.institution, 200),
    country: config.country ? sanitizeShortField(config.country, 100) : undefined,
    sector: normalizeSector(config.sector),
    yearsExperience: sanitizeShortField(config.yearsExperience, 50),
    cvSummary: config.cvSummary ? sanitizeUserText(config.cvSummary, 6000) : undefined,
    jobRequirements: config.jobRequirements
      ? sanitizeUserText(config.jobRequirements, 4000)
      : undefined,
    subject: config.subject ? sanitizeShortField(config.subject, 150) : undefined,
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * True if a string contains anything substantive after sanitization.
 */
export function hasContent(text: string | undefined | null): boolean {
  if (!text) return false
  return sanitizeUserText(text).length > 0
}
