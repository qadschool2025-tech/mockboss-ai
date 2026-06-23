// lib/barbaros/state/source-consistency.ts
// Barbaros — Source Consistency (Group A: detection + persistence ONLY).
//
// SCOPE: deterministic onboarding↔CV mismatch detection (name, years of
// experience) + persistence into state.sourceConsistencyIssues. No probe, no
// prompt, no director, no report/scoring. `addressed` is ALWAYS false here and
// is NEVER flipped — it may only become true elsewhere AFTER the candidate
// answers a verification question (a path that does not exist yet).
//
// PURITY: deterministic, no LLM, no I/O. Imports are TYPE-ONLY (erased at
// runtime) so this module can be exercised by a plain `node` script.

import type {
  InterviewConfig,
  InterviewPhase,
  SourceConsistencyIssue,
} from '../types'

const ISSUE_ID_NAME = 'source_consistency:name_mismatch'
const ISSUE_ID_EXPERIENCE = 'source_consistency:experience_mismatch'

// Onboarding-side placeholders that must NOT seed a name issue (compared
// against the NORMALIZED onboarding name). 'candidate' is the interview-page
// buildConfig fallback; the Arabic generics are common placeholders.
const NAME_PLACEHOLDERS = new Set(['candidate', 'المستخدم', 'المرشح'])

// The only literal single-year value '3 years' is the interview-page fallback
// (buildConfig: yearsExperience ?? '3 years'). Onboarding emits ranges, never
// '3 years', so this value carries no provenance ⇒ untrusted ⇒ skipped.
const EXPERIENCE_FALLBACK_DEFAULT = '3 years'

// CV-text headings (normalized) that must never be read as a person name.
const CV_HEADINGS = new Set([
  'cv', 'resume', 'curriculum vitae', 'curriculum', 'vitae',
  'السيره الذاتيه', 'سيره ذاتيه', 'الذاتيه',
])

// Professional-title tokens that must never be read as a person name (cvText).
const TITLE_WORDS = new Set([
  'senior', 'junior', 'lead', 'principal', 'head', 'chief', 'manager', 'director',
  'officer', 'intern', 'expert', 'engineer', 'developer', 'analyst', 'specialist',
  'consultant', 'teacher', 'accountant', 'designer', 'architect', 'administrator',
  'coordinator', 'supervisor', 'nurse', 'doctor', 'employee',
  'مدرس', 'معلم', 'مهندس', 'مدير', 'محلل', 'اخصائي', 'أخصائي', 'مطور', 'مستشار',
  'رئيس', 'مشرف', 'منسق', 'خبير', 'محاسب', 'ممرض', 'طبيب', 'موظف',
])

// Arabic number phrases 1–20 (1- or 2-token keys; matched LONGEST-first so
// "خمسة عشر" ⇒ 15, not 5). NOT a general numeral parser.
const NUM_PHRASES: Record<string, number> = {
  'واحد': 1, 'واحده': 1, 'احد': 1, 'احدى': 1,
  'اثنان': 2, 'اثنين': 2, 'اثنتان': 2, 'اثنتين': 2, 'عامان': 2, 'عامين': 2, 'سنتان': 2, 'سنتين': 2,
  'ثلاث': 3, 'ثلاثه': 3, 'اربع': 4, 'اربعه': 4, 'خمس': 5, 'خمسه': 5, 'ست': 6, 'سته': 6,
  'سبع': 7, 'سبعه': 7, 'ثمان': 8, 'ثماني': 8, 'ثمانيه': 8, 'تسع': 9, 'تسعه': 9, 'عشر': 10, 'عشره': 10,
  'احد عشر': 11, 'احدى عشره': 11, 'اثنا عشر': 12, 'اثني عشر': 12, 'اثنتا عشره': 12,
  'ثلاثه عشر': 13, 'ثلاث عشره': 13, 'اربعه عشر': 14, 'اربع عشره': 14, 'خمسه عشر': 15, 'خمس عشره': 15,
  'سته عشر': 16, 'ست عشره': 16, 'سبعه عشر': 17, 'سبع عشره': 17, 'ثمانيه عشر': 18, 'ثمان عشره': 18,
  'تسعه عشر': 19, 'تسع عشره': 19, 'عشرون': 20, 'عشرين': 20,
}

// Experience units (normalized) used to anchor the conservative cvText phrase.
const EXP_UNITS = new Set([
  'years', 'year', 'yrs', 'yr', 'سنه', 'سنوات', 'سنين', 'عام', 'عاما', 'اعوام',
])

// Exact canonical onboarding values whose integer-year range the generic parser
// cannot infer. Parser works in whole years, so both map to {0, 0}.
const ONBOARDING_EXACT_RANGES: Record<string, { min: number; max: number }> = {
  'fresh-graduate': { min: 0, max: 0 },
  'fresh graduate': { min: 0, max: 0 },
  'less than 1 year': { min: 0, max: 0 },
}

export interface SourceConsistencyInput {
  config: InterviewConfig
  phase: InterviewPhase
  now: number
}

/**
 * Pure. Returns the MERGED issue list: pre-existing issues preserved untouched,
 * new issues appended only when no issue with the same stable id exists.
 * Never mutates inputs. Never sets addressed = true.
 */
export function detectSourceConsistencyIssues(
  input: SourceConsistencyInput,
  existing: SourceConsistencyIssue[] = []
): SourceConsistencyIssue[] {
  const merged = [...existing]
  const seen = new Set(
    existing
      .map(issue => issue.id)
      .filter((id): id is string => typeof id === 'string')
  )

  const candidates = [
    detectNameMismatch(input),
    detectExperienceMismatch(input),
  ].filter((issue): issue is SourceConsistencyIssue => issue !== null)

  for (const candidate of candidates) {
    if (candidate.id && seen.has(candidate.id)) continue // preserve existing
    merged.push(candidate)
    if (candidate.id) seen.add(candidate.id)
  }

  return merged
}

// ─── Name mismatch ──────────────────────────────────────────────────────────

function detectNameMismatch(
  input: SourceConsistencyInput
): SourceConsistencyIssue | null {
  const { config, phase, now } = input

  const onboardingRaw =
    typeof config.candidateName === 'string' ? config.candidateName.trim() : ''
  if (!onboardingRaw) return null

  const onboardingNorm = normalizeName(onboardingRaw)
  if (!onboardingNorm || NAME_PLACEHOLDERS.has(onboardingNorm)) return null // placeholder guard

  const cv = resolveCvName(config)
  if (!cv) return null

  const onboardingTokens = nameTokens(onboardingNorm)
  const cvTokens = nameTokens(normalizeName(cv.name))
  if (onboardingTokens.size === 0 || cvTokens.size === 0) return null

  for (const token of onboardingTokens) {
    if (cvTokens.has(token)) return null // shared token ⇒ same person ⇒ no issue
  }

  return {
    id: ISSUE_ID_NAME,
    source: 'onboarding_vs_cv',
    topic: 'candidate_name',
    issueType: 'name_mismatch',
    severity: cv.fromCvText ? 'moderate' : 'major',
    confidence: cv.fromCvText ? 60 : 90,
    cvEvidence: cv.name,
    candidateStatement: onboardingRaw,
    addressed: false,
    detectedAt: now,
    phase,
  }
}

// ─── Experience mismatch (range vs range; conflict only on NO overlap) ─────────

function detectExperienceMismatch(
  input: SourceConsistencyInput
): SourceConsistencyIssue | null {
  const { config, phase, now } = input

  const onboardingRaw =
    typeof config.yearsExperience === 'string' ? config.yearsExperience.trim() : ''
  if (!onboardingRaw) return null

  // Provenance guard: '3 years' is only the interview-page fallback (untrusted).
  if (onboardingRaw.toLowerCase().replace(/\s+/g, ' ').trim() === EXPERIENCE_FALLBACK_DEFAULT) {
    return null
  }

  const onboardingRange = parseExperienceRange(onboardingRaw)
  if (!onboardingRange) return null

  const cv = resolveCvExperience(config)
  if (!cv) return null

  const a = onboardingRange
  const b = cv.range
  const noOverlap = a.max < b.min || b.max < a.min
  if (!noOverlap) return null

  return {
    id: ISSUE_ID_EXPERIENCE,
    source: 'onboarding_vs_cv',
    topic: 'years_experience',
    issueType: 'experience_mismatch',
    severity: cv.fromCvText ? 'minor' : 'moderate',
    confidence: cv.fromCvText ? 50 : 70,
    cvEvidence: rangeLabel(b),
    candidateStatement: onboardingRaw,
    addressed: false,
    detectedAt: now,
    phase,
  }
}

// ─── CV signal resolution (parsedCv first, conservative cvText fallback) ────────

function resolveCvName(
  config: InterviewConfig
): { name: string; fromCvText: boolean } | null {
  const p = config.parsedCv?.candidateName
  if (typeof p === 'string' && p.trim()) return { name: p.trim(), fromCvText: false }
  const t = extractNameFromCvText(config.cvText)
  return t ? { name: t, fromCvText: true } : null
}

function resolveCvExperience(
  config: InterviewConfig
): { range: { min: number; max: number }; fromCvText: boolean } | null {
  const p = parseExperienceRange(config.parsedCv?.totalYearsExperience)
  if (p) return { range: p, fromCvText: false }

  const phrase = extractExperiencePhrase(config.cvText)
  if (phrase) {
    const r = parseExperienceRange(phrase)
    if (r) return { range: r, fromCvText: true }
  }
  return null
}

// First ≤2 non-empty lines; accept only a clear, name-like line.
function extractNameFromCvText(text: unknown): string | null {
  if (typeof text !== 'string' || !text.trim()) return null
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 2)
  for (const line of lines) {
    if (isPlausibleNameLine(line)) return line
  }
  return null
}

export function isPlausibleNameLine(line: string): boolean {
  if (!line) return false
  if (/[0-9٠-٩۰-۹]/.test(line)) return false // any digits
  if (line.includes('@')) return false                          // email
  if (line.includes('+')) return false                          // phone marker
  const lettersOnly = line.replace(/[ً-ْـ]/g, '')
  if (!/^[A-Za-z؀-ۿ\s]+$/.test(lettersOnly)) return false // letters + spaces only
  const norm = normalizeName(line)
  if (!norm || CV_HEADINGS.has(norm)) return false
  const words = norm.split(/\s+/).filter(Boolean)
  if (words.length < 1 || words.length > 4) return false
  if (words.some(w => TITLE_WORDS.has(w))) return false // professional titles are not names
  return true
}

// Conservative cvText experience phrase: only the expression DIRECTLY tied to an
// experience unit (years/سنوات/…). Avoids picking up graduation years or stray
// dates (4-digit numbers are never matched as a count).
function extractExperiencePhrase(text: unknown): string | null {
  if (typeof text !== 'string' || !text.trim()) return null
  const norm = normalizeNum(text).replace(/[-–—]/g, ' - ').replace(/\+/g, ' + ')
  const toks = norm.split(/\s+/).filter(Boolean)
  for (let i = 0; i < toks.length; i++) {
    if (!EXP_UNITS.has(toks[i])) continue
    const window = toks.slice(Math.max(0, i - 4), i) // tokens immediately before the unit
    const phrase = window.join(' ')
    if (extractNumbers(phrase).length > 0) return phrase
  }
  return null
}

// ─── Helpers (deterministic) ────────────────────────────────────────────────────

export function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[ً-ْـ]/g, '')      // tashkeel + tatweel
    .replace(/[أإآ]/g, 'ا') // أ إ آ → ا
    .replace(/ة/g, 'ه')               // ة → ه
    .toLowerCase()
    .replace(/[^a-z؀-ۿ\s]/g, ' ')     // strip punctuation/digits/symbols
    .replace(/\s+/g, ' ')
    .trim()
}

function nameTokens(normalized: string): Set<string> {
  return new Set(normalized.split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2))
}

function normalizeNum(value: unknown): string {
  return String(value ?? '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0)) // Persian digits
    .replace(/[ً-ْـ]/g, '')                             // tashkeel + tatweel
    .replace(/[أإآ]/g, 'ا')                        // alef forms → ا
    .replace(/ة/g, 'ه')                                      // ة → ه
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Ordered numbers via LONGEST-phrase matching (2-token Arabic phrases first).
function extractNumbers(norm: string): number[] {
  const toks = norm.split(/\s+/).filter(Boolean)
  const out: number[] = []
  for (let i = 0; i < toks.length; ) {
    const two = i + 1 < toks.length ? `${toks[i]} ${toks[i + 1]}` : ''
    if (two && NUM_PHRASES[two] !== undefined) { out.push(NUM_PHRASES[two]); i += 2; continue }
    if (/^\d{1,2}$/.test(toks[i])) { out.push(parseInt(toks[i], 10)); i++; continue }
    if (NUM_PHRASES[toks[i]] !== undefined) { out.push(NUM_PHRASES[toks[i]]); i++; continue }
    i++
  }
  return out
}

// Parses any experience text to an integer-year range [min, max].
export function parseExperienceRange(text: unknown): { min: number; max: number } | null {
  if (typeof text !== 'string' || !text.trim()) return null

  const canon = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (ONBOARDING_EXACT_RANGES[canon]) return ONBOARDING_EXACT_RANGES[canon]

  let norm = normalizeNum(text)
  const openEnded = norm.includes('+') || /\bاكثر\b/.test(norm) || /\bplus\b/.test(norm)
  const lessThan = norm.includes('<') || /\bاقل\b/.test(norm) || /\bless\b/.test(norm) || /\bunder\b/.test(norm)
  norm = norm.replace(/[-–—+]/g, ' ')

  const nums = extractNumbers(norm)
  if (nums.length === 0) return null
  if (lessThan) return { min: 0, max: Math.max(0, Math.max(...nums) - 1) }
  if (openEnded) return { min: Math.min(...nums), max: Number.POSITIVE_INFINITY }
  if (nums.length >= 2) return { min: Math.min(...nums), max: Math.max(...nums) }
  return { min: nums[0], max: nums[0] }
}

function rangeLabel(r: { min: number; max: number }): string {
  if (r.min === r.max) return String(r.min)
  return r.max === Number.POSITIVE_INFINITY ? `${r.min}+` : `${r.min}-${r.max}`
}
