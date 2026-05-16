
// ============================================================================
// Barbaros V4 — Language Utilities
// Detect language, build language instructions for the LLM.
// Pure functions. No side effects.
// ============================================================================

import type { Language } from '../types'

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Arabic Unicode ranges:
 *  - U+0600–U+06FF : Arabic
 *  - U+0750–U+077F : Arabic Supplement
 *  - U+08A0–U+08FF : Arabic Extended-A
 *  - U+FB50–U+FDFF : Arabic Presentation Forms-A
 *  - U+FE70–U+FEFF : Arabic Presentation Forms-B
 */
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

/**
 * Latin letters (English-ish).
 */
const LATIN_RE = /[A-Za-z]/

/**
 * Count characters matching a regex.
 */
function countMatches(text: string, re: RegExp): number {
  let count = 0
  for (const ch of text) {
    if (re.test(ch)) count++
  }
  return count
}

/**
 * Detect the language of a piece of text.
 * Returns 'mixed' when both scripts appear meaningfully.
 *
 * Heuristic:
 *  - If only Arabic letters present → 'ar'
 *  - If only Latin letters present → 'en'
 *  - If both present and the minority is at least 20% of the majority → 'mixed'
 *  - Otherwise, returns whichever dominates
 *  - Empty/unknown → 'en' (safe default)
 */
export function detectLanguage(text: string): Language {
  if (!text || !text.trim()) return 'en'

  const ar = countMatches(text, ARABIC_RE)
  const en = countMatches(text, LATIN_RE)

  if (ar === 0 && en === 0) return 'en'
  if (ar > 0 && en === 0) return 'ar'
  if (en > 0 && ar === 0) return 'en'

  const minority = Math.min(ar, en)
  const majority = Math.max(ar, en)
  const ratio = minority / majority

  if (ratio >= 0.2) return 'mixed'
  return ar > en ? 'ar' : 'en'
}

// ============================================================================
// DIRECTION
// ============================================================================

/**
 * Text direction for a given language.
 * Mixed defaults to LTR — UI is expected to handle bidi inline.
 */
export function getDirection(language: Language): 'ltr' | 'rtl' {
  return language === 'ar' ? 'rtl' : 'ltr'
}

// ============================================================================
// LLM INSTRUCTIONS
// ============================================================================

/**
 * Build the language directive injected into the system prompt.
 * Keeps phrasing tight — the prompt-builder owns surrounding context.
 */
export function getLanguageInstruction(language: Language): string {
  switch (language) {
    case 'ar':
      return [
        'Conduct the entire interview in Modern Standard Arabic.',
        'Do not switch to English unless the candidate switches first.',
        'Use professional, formal Arabic — never colloquial dialect.',
      ].join(' ')

    case 'mixed':
      return [
        'The candidate may mix Arabic and English freely.',
        'Match the candidate\'s language balance in each turn.',
        'If the candidate uses a technical English term, keep it in English.',
        'Otherwise mirror their dominant language for that turn.',
      ].join(' ')

    case 'en':
    default:
      return [
        'Conduct the entire interview in professional English.',
        'Do not switch to Arabic unless the candidate explicitly requests it.',
      ].join(' ')
  }
}

// ============================================================================
// DISPLAY LABELS
// ============================================================================

/**
 * Human-readable label for a language code. For UI / reports.
 */
export function getLanguageLabel(language: Language): string {
  switch (language) {
    case 'ar':
      return 'Arabic'
    case 'mixed':
      return 'Arabic + English'
    case 'en':
    default:
      return 'English'
  }
}
