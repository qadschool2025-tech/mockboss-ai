// lib/barbaros/state/readiness.ts
// Barbaros — Opening readiness detection (deterministic, pure).
//
// SCOPE: recognise a candidate's readiness confirmation to the opening
// "are you ready to begin?" question (e.g. "نعم مستعد", "yes", "ready") so the
// engine advances to the first real interview question instead of re-asking the
// readiness prompt. No LLM, no I/O, no mutation. Type-only imports.
//
// A confirmation is recognised only when EVERY token of the normalised answer is
// an affirmation/readiness token (1–4 tokens). This keeps substantive answers
// such as "نعم لدي خبرة في التدريس" out — they carry non-readiness tokens.

// Normalised readiness/affirmation tokens. Arabic forms are post-normalisation
// (tashkeel/tatweel stripped, أإآ→ا, ة→ه), English forms are lowercased with
// punctuation removed.
const READINESS_TOKENS = new Set<string>([
  // Arabic
  'نعم', 'اجل', 'مستعد', 'مستعده', 'مستعدون', 'مستعدين',
  'جاهز', 'جاهزه', 'جاهزون', 'جاهزين',
  'انا', 'نبدا', 'لنبدا', 'ابدا', 'هيا', 'يلا', 'تمام', 'اكيد', 'طبعا',
  // English
  'yes', 'yep', 'yeah', 'ready', 'sure', 'ok', 'okay',
  'i', 'am', 'im', 'lets', 'let', 'us', 'to', 'begin', 'start',
])

function normalizeReadiness(text: string): string {
  return text
    .replace(/[ً-ْـ]/g, '')        // tashkeel + tatweel
    .replace(/[أإآ]/g, 'ا')   // أ إ آ → ا
    .replace(/ة/g, 'ه')                 // ة → ه
    .toLowerCase()
    .replace(/['’`ʼ]/g, '')             // drop apostrophes so "I'm" → "im"
    .replace(/[^a-z؀-ۿ\s]/g, ' ') // keep Latin + Arabic letters + space
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pure. True when the answer is a short, pure readiness confirmation to the
 * opening readiness question. False for empty input, substantive answers, or
 * anything longer than four tokens.
 */
export function isReadinessAffirmation(text: unknown): boolean {
  if (typeof text !== 'string') return false

  const tokens = normalizeReadiness(text).split(' ').filter(Boolean)
  if (tokens.length === 0 || tokens.length > 4) return false

  return tokens.every(token => READINESS_TOKENS.has(token))
}
