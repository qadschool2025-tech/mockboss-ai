// lib/barbaros/scoring/coverage-resolver.ts
// Barbaros V4, Essential Assessment coverage resolver.
//
// PURPOSE:
// Decides which of the 6 Essential Assessment axes were genuinely covered.
// This result is the single source of truth for:
// 1. the closing message
// 2. the report Assessment Coverage section
//
// DESIGN:
// Coverage is based on real evidence inside the session.
// It does not rely on phase position alone.
//
// STAR RULE:
// STAR is not an EssentialAxis.
// STAR is an Evidence Quality lens for the report:
// Situation, Task, Action, Result.
// It should improve evidence quality scoring later, but it must not create a
// separate covered area.

import type { InterviewConfig, Message } from '../types'
import type { SessionState } from '../state/session-state'
import { UNIVERSAL_COMPETENCIES } from '../constants'

export type EssentialAxis =
  | 'role_fit'
  | 'cv_consistency'
  | 'job_requirement_match'
  | 'domain_expertise'
  | 'communication_clarity'
  | 'ownership_level'

export const ESSENTIAL_AXIS_ORDER: readonly EssentialAxis[] = [
  'role_fit',
  'cv_consistency',
  'job_requirement_match',
  'domain_expertise',
  'communication_clarity',
  'ownership_level',
] as const

const COVERAGE_THRESHOLD = 50
const MIN_ANSWERS_FOR_ROLE_FIT = 1
const MIN_ANSWERS_FOR_CV_CHECK = 2
const MIN_SECTOR_EVIDENCE_FOR_DOMAIN = 2

const UNIVERSAL_COMPETENCY_SET = new Set<string>(UNIVERSAL_COMPETENCIES)

const CV_SOURCE_CUES = [
  'cv',
  'resume',
  'your cv',
  'your resume',
  'your background',
  'your timeline',
  'timeline gap',
  'career gap',
  'employment gap',
  'your previous role',
  'your current role',
  'your listed role',
  'your experience shows',
  'your background shows',
  'your cv shows',
  'your resume shows',
  'help me understand the level of ownership',
  'level of ownership',
  'role mismatch',
  'gap between',
  'in your cv',
  'in your resume',

  'السيرة',
  'السيرة الذاتية',
  'سيرتك',
  'خلفيتك',
  'خبرتك',
  'الفجوة',
  'فجوة',
  'المسمى',
  'الدور السابق',
  'دورك السابق',
  'مسؤوليتك',
  'مستوى المسؤولية',
  'ترخيص',
  'مرخص',
  'مرخصة',
]

const JOB_REQUIREMENT_STOPWORDS = new Set([
  'and',
  'or',
  'the',
  'a',
  'an',
  'to',
  'for',
  'of',
  'in',
  'on',
  'with',
  'by',
  'from',
  'as',
  'at',
  'is',
  'are',
  'be',
  'will',
  'must',
  'should',
  'required',
  'requirement',
  'requirements',
  'candidate',
  'role',
  'job',
  'work',
  'team',
  'skills',
  'skill',
  'ability',
  'experience',
  'knowledge',

  'و',
  'أو',
  'في',
  'من',
  'على',
  'إلى',
  'عن',
  'مع',
  'هذا',
  'هذه',
  'ذلك',
  'تلك',
  'يجب',
  'مطلوب',
  'المطلوب',
  'متطلبات',
  'الوظيفة',
  'الدور',
  'المرشح',
  'المرشحة',
  'خبرة',
  'مهارة',
  'مهارات',
])

export function resolveCoveredAreas(
  state: SessionState,
  config: InterviewConfig,
  messages: Message[]
): EssentialAxis[] {
  const userAnswers = countUserAnswers(messages)
  const transcript = normalizeText(messages.map(m => m.content).join(' '))
  const assistantTranscript = normalizeText(
    messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .join(' ')
  )

  const hasCv = deriveHasCv(config)
  const hasJobRequirements = hasUsefulJobRequirements(config)
  const sectorKeys = sectorCompetencyKeys(state)
  const domainKeys = [...sectorKeys, 'problem_solving']

  const signals: Record<EssentialAxis, boolean> = {
    role_fit:
      userAnswers >= MIN_ANSWERS_FOR_ROLE_FIT,

    cv_consistency:
      hasCv &&
      userAnswers >= MIN_ANSWERS_FOR_CV_CHECK &&
      cvWasActuallyUsed(config, transcript, assistantTranscript),

    job_requirement_match:
      hasJobRequirements &&
      jobRequirementsWereActuallyUsed(config, transcript) &&
      sectorKeys.some(key => evidenceCountOf(state, key) > 0),

    domain_expertise:
      domainExpertiseWasCovered(state, domainKeys, sectorKeys),

    communication_clarity:
      coverageOf(state, 'communication') >= COVERAGE_THRESHOLD,

    ownership_level:
      coverageOf(state, 'ownership') >= COVERAGE_THRESHOLD,
  }

  return ESSENTIAL_AXIS_ORDER.filter(axis => signals[axis])
}

function deriveHasCv(config: InterviewConfig): boolean {
  return Boolean(
    config.cvText?.trim() ||
    config.cvSummary?.trim() ||
    config.parsedCv
  )
}

function hasUsefulJobRequirements(config: InterviewConfig): boolean {
  return (config.jobRequirements ?? '').trim().length > 0
}

function countUserAnswers(messages: Message[]): number {
  return messages.filter(m => m.role === 'user' && m.content.trim()).length
}

function sectorCompetencyKeys(state: SessionState): string[] {
  return Object.keys(state.competencyCoverage).filter(
    key => !UNIVERSAL_COMPETENCY_SET.has(key)
  )
}

function coverageOf(state: SessionState, key: string): number {
  return state.competencyCoverage[key]?.coverage ?? 0
}

function evidenceCountOf(state: SessionState, key: string): number {
  return state.competencyCoverage[key]?.evidenceCount ?? 0
}

function domainExpertiseWasCovered(
  state: SessionState,
  domainKeys: string[],
  sectorKeys: string[]
): boolean {
  const strongCoverage = domainKeys.some(
    key => coverageOf(state, key) >= COVERAGE_THRESHOLD
  )

  const sectorEvidenceCount = sectorKeys.filter(
    key => evidenceCountOf(state, key) > 0
  ).length

  return strongCoverage || sectorEvidenceCount >= MIN_SECTOR_EVIDENCE_FOR_DOMAIN
}

function cvWasActuallyUsed(
  config: InterviewConfig,
  transcript: string,
  assistantTranscript: string
): boolean {
  const staticCueHit = CV_SOURCE_CUES.some(cue =>
    transcript.includes(normalizeText(cue))
  )

  if (staticCueHit) return true

  const cvTerms = extractCvEvidenceTerms(config)
  if (cvTerms.length === 0) return false

  return cvTerms.some(term =>
    assistantTranscript.includes(normalizeText(term))
  )
}

function extractCvEvidenceTerms(config: InterviewConfig): string[] {
  const parsedCv = config.parsedCv
  const terms: string[] = []

  if (!parsedCv) return terms

  pushIfUseful(terms, parsedCv.candidateName)
  pushIfUseful(terms, parsedCv.currentTitle)
  pushIfUseful(terms, parsedCv.currentCompany)

  parsedCv.roles?.slice(0, 5).forEach(role => {
    pushIfUseful(terms, role.title)
    pushIfUseful(terms, role.company)
  })

  parsedCv.skills?.slice(0, 12).forEach(skill => {
    pushIfUseful(terms, skill)
  })

  parsedCv.certifications?.slice(0, 6).forEach(certification => {
    pushIfUseful(terms, certification)
  })

  return uniqueUsefulTerms(terms)
}

function jobRequirementsWereActuallyUsed(
  config: InterviewConfig,
  transcript: string
): boolean {
  const keywords = extractJobRequirementKeywords(config.jobRequirements ?? '')
  if (keywords.length === 0) return false

  const hits = keywords.filter(keyword =>
    transcript.includes(normalizeText(keyword))
  )

  return hits.length > 0
}

function extractJobRequirementKeywords(text: string): string[] {
  const normalized = normalizeText(text)
  const words = normalized.match(/[a-z0-9+#.ء-ي]+/gi) ?? []

  const candidates = words
    .map(word => word.trim().toLowerCase())
    .filter(word => word.length >= 4)
    .filter(word => !JOB_REQUIREMENT_STOPWORDS.has(word))

  return uniqueUsefulTerms(candidates).slice(0, 24)
}

function pushIfUseful(target: string[], value?: string): void {
  if (!value) return

  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length < 3) return

  target.push(clean)
}

function uniqueUsefulTerms(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || normalized.length < 3) continue
    if (seen.has(normalized)) continue

    seen.add(normalized)
    result.push(value.trim())
  }

  return result
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[^\p{L}\p{N}+#.\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
