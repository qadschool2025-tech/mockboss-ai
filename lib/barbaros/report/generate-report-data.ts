// lib/barbaros/report/generate-report-data.ts
// Barbaros report data generator (Next-independent, reusable).

import Anthropic from '@anthropic-ai/sdk'
import {
  ESSENTIAL_AXIS_ORDER,
  type EssentialAxis,
} from '../scoring/coverage-resolver'
import { ESSENTIAL_AXIS_LABELS } from '../prompt/personality'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ReportConfig {
  candidateName: string
  jobTitle: string
  institution: string
  sector: string
  yearsExperience: string
  language: string
  plan: string
}

export interface GenerateReportInput {
  messages: IncomingMessage[]
  config: ReportConfig
  coveredAreas?: unknown
}

export interface AssessmentCoverage {
  title: string
  summary: string
  coveredAreaKeys: EssentialAxis[]
  coveredAreas: string[]
  recommendedForDeeperAssessment: string[]
  upgradeNote: string
}

export class ReportGenerationError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ReportGenerationError'
    this.status = status
  }
}

// ─── Assessment coverage ─────────────────────────────────────────────────────

export type PlanTier = 'go' | 'pro' | 'expert'

export function resolvePlanTier(plan: string): PlanTier {
  const key = (plan || '').toLowerCase()
  if (key.includes('expert') || key.includes('executive')) return 'expert'
  if (key.includes('professional') || key.includes('pro')) return 'pro'
  return 'go'
}

const DEEPER_ASSESSMENT_LABELS: Record<'en' | 'ar', string[]> = {
  en: [
    'Behavioral Consistency',
    'Competency Mapping',
    'Pressure Response',
    'Leadership Judgment',
    'Strategic Thinking',
    'Panel Role Simulation',
  ],
  ar: [
    'الاتساق السلوكي',
    'خريطة الكفاءات',
    'الاستجابة للضغط',
    'الحُكم القيادي',
    'التفكير الاستراتيجي',
    'محاكاة أدوار لجنة المقابلة',
  ],
}

const AR_READINESS_LEVELS: Record<string, string> = {
  'Strong Readiness': 'جاهزية قوية',
  'Moderate Readiness': 'جاهزية متوسطة',
  'Developing Readiness': 'جاهزية قيد التطوير',
  'Limited Readiness': 'جاهزية محدودة',
  'Interview Incomplete': 'المقابلة غير مكتملة',

  // Legacy values remain readable for previously generated reports.
  'Strong Hire': 'جاهز بقوة',
  'Maybe Hire': 'قابل للتوصية بحذر',
  'Risky Candidate': 'مخاطرة عالية',
  'Not Recommended': 'غير جاهز حالياً',
}

const REPORT_COMPETENCY_ORDER = [
  'Communication',
  'Confidence',
  'Domain Expertise',
  'Structure',
  'Problem Solving',
  'Clarity',
] as const

type ReportCompetencyName = (typeof REPORT_COMPETENCY_ORDER)[number]
type ReadinessLevel =
  | 'Limited Readiness'
  | 'Developing Readiness'
  | 'Moderate Readiness'
  | 'Strong Readiness'

// V1 product rule for internal consistency only.
// These equal weights are not calibrated against real hiring outcomes.
const REPORT_COMPETENCY_WEIGHTS_V1: Record<ReportCompetencyName, number> = {
  Communication: 1,
  Confidence: 1,
  'Domain Expertise': 1,
  Structure: 1,
  'Problem Solving': 1,
  Clarity: 1,
}

// Keys are pre-normalized with normalizeReplyText.
const REPORT_COMPETENCY_ALIASES: Record<string, ReportCompetencyName> = {
  communication: 'Communication',
  التواصل: 'Communication',
  'التواصل المهني': 'Communication',

  confidence: 'Confidence',
  الثقه: 'Confidence',
  'الحضور والاتزان': 'Confidence',

  'domain expertise': 'Domain Expertise',
  'الخبره في المجال': 'Domain Expertise',
  'التمكن المهني في المجال': 'Domain Expertise',

  structure: 'Structure',
  'تنظيم الاجابه': 'Structure',
  'بنيه الطرح': 'Structure',

  'problem solving': 'Problem Solving',
  'حل المشكلات': 'Problem Solving',

  clarity: 'Clarity',
  الوضوح: 'Clarity',
  'وضوح الاجابه': 'Clarity',
}

const THIN_EVIDENCE_MAX_ANSWERS = 4
const REPLAY_FUZZY_MIN_CHARS = 120
const REPLAY_DUPLICATE_SIMILARITY = 0.94

function reportLang(language: string): 'en' | 'ar' {
  return language === 'ar' ? 'ar' : 'en'
}

function normalizeCoveredAreas(value: unknown): EssentialAxis[] {
  if (!Array.isArray(value)) return []

  const allowed = new Set<EssentialAxis>(ESSENTIAL_AXIS_ORDER)
  const received = new Set<EssentialAxis>()

  for (const item of value) {
    if (typeof item !== 'string') continue
    const axis = item as EssentialAxis
    if (allowed.has(axis)) received.add(axis)
  }

  return ESSENTIAL_AXIS_ORDER.filter(axis => received.has(axis))
}

function joinEn(parts: string[]): string {
  if (parts.length === 0) return 'the core readiness areas covered in this session'
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

function joinAr(parts: string[]): string {
  if (parts.length === 0) return 'المحاور الأساسية التي تم تناولها في هذه الجلسة'
  if (parts.length === 1) return parts[0]
  const [first, ...rest] = parts
  return [first, ...rest.map(part => `و${part}`)].join('، ')
}

function buildAssessmentCoverage(
  coveredAreas: EssentialAxis[],
  language: string,
  plan: string,
  evidenceSufficient: boolean
): AssessmentCoverage {
  const lang = reportLang(language)
  const tier = resolvePlanTier(plan)
  const essentialLabels = coveredAreas.map(axis => ESSENTIAL_AXIS_LABELS[axis][lang])
  const title =
    lang === 'ar' ? 'نطاق التقييم في هذه الجلسة' : 'Assessment coverage for this session'

  if (!evidenceSufficient) {
    return {
      title,
      summary:
        lang === 'ar'
          ? 'لم تُعتمد محاور كمقاسة لأن الجلسة لم تتضمن ثلاث إجابات جوهرية على الأقل.'
          : 'No dimensions are presented as measured because the session did not include at least three substantive answers.',
      coveredAreaKeys: [],
      coveredAreas: [],
      recommendedForDeeperAssessment:
        tier === 'go' ? DEEPER_ASSESSMENT_LABELS[lang] : [],
      upgradeNote:
        lang === 'ar'
          ? 'هذه حالة جلسة غير مكتملة وليست حكماً على قدراتك. أكمل مقابلة كاملة للحصول على قراءة موثوقة ضمن باقتك.'
          : 'This is an incomplete-session status, not a judgment of your ability. Complete a full interview to receive a reliable reading within your plan.',
    }
  }

  const hasVerifiedCoverage = essentialLabels.length > 0
  const summary = hasVerifiedCoverage
    ? lang === 'ar'
      ? `يعرض هذا القسم فقط المحاور التي تدعم بيانات التغطية الفعلية أنها قِيست في هذه الجلسة: ${joinAr(essentialLabels)}.`
      : `This section lists only the dimensions supported as measured by the session coverage data: ${joinEn(essentialLabels)}.`
    : lang === 'ar'
      ? 'استند التقرير إلى إجاباتك الفعلية في هذه الجلسة. لا نعرض محوراً محدداً على أنه قِيس بصورة مستقلة دون بيانات تغطية موثقة.'
      : 'The report is based on your actual answers in this session. No specific dimension is presented as independently measured without verified coverage data.'

  const upgradeNote =
    tier === 'go'
      ? lang === 'ar'
        ? 'تقيس باقة Go الجاهزية الأساسية. المحاور المتقدمة المدرجة أدناه متاحة بعمق أكبر في الباقات الأعلى، ولم تُحتسب كمحاور مقاسة في هذه الجلسة.'
        : 'The Go plan measures baseline readiness. The advanced areas listed below are available in greater depth in higher plans and were not counted as measured dimensions in this session.'
      : tier === 'pro'
        ? lang === 'ar'
          ? 'تتيح باقة Pro تحليلاً أعمق للاتساق السلوكي والكفاءات والاستجابة للضغط وأولويات التحسين. يعرض هذا القسم فقط المحاور التي تثبت بيانات الجلسة أنها قِيست فعلياً.'
          : 'The Pro plan supports deeper analysis of behavioral consistency, competencies, pressure response, and improvement priorities. This section lists only dimensions verified as measured by the session data.'
        : lang === 'ar'
          ? 'تتيح باقة Expert التحليل التنفيذي ومحاكاة أدوار اللجنة والضغط والتفكير الاستراتيجي. يعرض هذا القسم فقط المحاور التي تثبت بيانات الجلسة أنها قِيست فعلياً.'
          : 'The Expert plan supports executive analysis, panel-role simulation, pressure testing, and strategic thinking. This section lists only dimensions verified as measured by the session data.'

  return {
    title,
    summary,
    coveredAreaKeys: coveredAreas,
    coveredAreas: essentialLabels,
    recommendedForDeeperAssessment:
      tier === 'go' ? DEEPER_ASSESSMENT_LABELS[lang] : [],
    upgradeNote,
  }
}

// ─── Minimum evidence gate ───────────────────────────────────────────────────

const MIN_SUBSTANTIVE_ANSWERS = 3
const MIN_SUBSTANTIVE_WORDS = 4
const MIN_SHORT_ANSWER_WORDS = 2
const MIN_SHORT_ANSWER_CHARS = 12

const CONTEXT_PAYLOAD_PATTERN =
  /^\s*(?:cv|resume|curriculum vitae|cv ?summary|job requirements?|job description|jd|system|context|onboarding|profile|السيرة الذاتية|ملخص السيرة|متطلبات الوظيفة|الوصف الوظيفي)\s*[:\-–—]/i

function normalizeReplyText(content: string): string {
  return content
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}


function canonicalCompetencyName(value: unknown): ReportCompetencyName | null {
  if (typeof value !== 'string') return null
  return REPORT_COMPETENCY_ALIASES[normalizeReplyText(value)] ?? null
}

function canonicalizeCompetencies(
  value: unknown
): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value) || value.length !== REPORT_COMPETENCY_ORDER.length) {
    return null
  }

  const items: Array<Record<string, unknown>> = []

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null

    const competency = item as Record<string, unknown>
    if (!isScoreNumber(competency.score) || !isNonEmptyString(competency.why)) {
      return null
    }

    items.push(competency)
  }

  const resolvedNames = items.map(item => canonicalCompetencyName(item.name))
  const allResolved = resolvedNames.every(
    (name): name is ReportCompetencyName => name !== null
  )

  if (allResolved && new Set(resolvedNames).size === REPORT_COMPETENCY_ORDER.length) {
    const byName = new Map<ReportCompetencyName, Record<string, unknown>>()
    items.forEach((item, index) => {
      byName.set(resolvedNames[index], { ...item, name: resolvedNames[index] })
    })
    return REPORT_COMPETENCY_ORDER.map(name => byName.get(name)!)
  }

  const hasConflictingKnownName = resolvedNames.some(
    (name, index) => name !== null && name !== REPORT_COMPETENCY_ORDER[index]
  )

  if (hasConflictingKnownName) return null

  console.warn('[report] competency names recovered by prompt-defined order')

  return items.map((item, index) => ({
    ...item,
    name: REPORT_COMPETENCY_ORDER[index],
  }))
}

function computeFinalScore(
  competencies: Array<Record<string, unknown>>
): number {
  let weightedTotal = 0
  let totalWeight = 0

  for (const competency of competencies) {
    const name = canonicalCompetencyName(competency.name)
    if (!name || !isScoreNumber(competency.score)) {
      throw new ReportGenerationError(
        'Cannot compute final score from invalid competency data',
        502
      )
    }

    const weight = REPORT_COMPETENCY_WEIGHTS_V1[name]
    weightedTotal += competency.score * weight
    totalWeight += weight
  }

  if (totalWeight <= 0) {
    throw new ReportGenerationError('Invalid report competency weights', 500)
  }

  return Math.round(weightedTotal / totalWeight)
}

function deriveReadinessLevel(
  finalScore: number,
  capAtModerate: boolean
): ReadinessLevel {
  const rawLevel: ReadinessLevel =
    finalScore >= 80
      ? 'Strong Readiness'
      : finalScore >= 65
        ? 'Moderate Readiness'
        : finalScore >= 45
          ? 'Developing Readiness'
          : 'Limited Readiness'

  return capAtModerate && rawLevel === 'Strong Readiness'
    ? 'Moderate Readiness'
    : rawLevel
}

function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigrams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const pair = a.slice(i, i + 2)
    bigrams.set(pair, (bigrams.get(pair) ?? 0) + 1)
  }

  let overlap = 0
  for (let i = 0; i < b.length - 1; i++) {
    const pair = b.slice(i, i + 2)
    const count = bigrams.get(pair) ?? 0
    if (count <= 0) continue
    overlap++
    bigrams.set(pair, count - 1)
  }

  return (2 * overlap) / (a.length + b.length - 2)
}

function isRepeatedReplayAnswer(
  normalizedAnswer: string,
  previousAnswers: string[]
): boolean {
  if (!normalizedAnswer) return false

  return previousAnswers.some(previous => {
    if (normalizedAnswer === previous) return true
    if (
      normalizedAnswer.length < REPLAY_FUZZY_MIN_CHARS ||
      previous.length < REPLAY_FUZZY_MIN_CHARS
    ) {
      return false
    }

    return diceSimilarity(normalizedAnswer, previous) >= REPLAY_DUPLICATE_SIMILARITY
  })
}

function markReplayPathCounts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []

  const countedAnswers: string[] = []

  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { countsTowardPath: false }
    }

    const replayItem = item as Record<string, unknown>
    const normalizedAnswer =
      typeof replayItem.answer === 'string'
        ? normalizeReplyText(replayItem.answer)
        : ''
    const duplicate = isRepeatedReplayAnswer(normalizedAnswer, countedAnswers)

    if (!duplicate && normalizedAnswer) countedAnswers.push(normalizedAnswer)

    return {
      ...replayItem,
      countsTowardPath: !duplicate,
    }
  })
}


const GENERIC_REPLY_WORDS = new Set(
  [
    'نعم', 'اجل', 'ايوه', 'ايوا', 'اي', 'اها', 'تمام', 'طيب', 'حاضر', 'ماشي',
    'زين', 'مستعد', 'مستعدة', 'جاهز', 'جاهزة', 'اوك', 'اوكي', 'اوكيه', 'يلا',
    'هيا', 'ابدأ', 'ابدئي', 'نبدا', 'تفضل', 'تفضلي', 'اكيد', 'طبعا', 'بالتاكيد',
    'موافق', 'موافقة', 'حسنا', 'صح', 'ممتاز', 'رائع', 'جميل', 'كويس', 'انا',
    'نحن', 'تماما', 'جدا', 'فعلا', 'خلاص', 'يعني', 'شكرا', 'مشكور', 'مشكورة',
    'مرحبا', 'اهلا', 'هلا', 'سلام', 'السلام', 'عليكم', 'وعليكم', 'صباح', 'مساء',
    'الخير', 'النور', 'تحياتي', 'عفوا', 'لا', 'ما', 'مش', 'مو', 'اعرف', 'ادري',
    'اعلم', 'متاكد', 'متاكدة', 'اعد', 'اعيد', 'تعيد', 'كرر', 'تكرر', 'السؤال',
    'سؤال', 'تجاوز', 'التالي', 'التاليه', 'بعدين', 'لاحقا', 'ممكن', 'نكمل',
    'اكمل', 'استمر', 'ok', 'okay', 'k', 'kk', 'yes', 'yeah', 'yep', 'yup',
    'ya', 'sure', 'ready', 'fine', 'good', 'great', 'cool', 'alright', 'right',
    'done', 'go', 'start', 'begin', 'lets', 'let', 'now', 'totally', 'absolutely',
    'definitely', 'course', 'of', 'im', 'i', 'am', 'we', 'so', 'well', 'perfect',
    'nice', 'thanks', 'thank', 'you', 'please', 'hi', 'hello', 'hey', 'sorry',
    'welcome', 'no', 'not', 'dont', 'didnt', 'doesnt', 'cant', 'know', 'idk',
    'skip', 'next', 'pass', 'repeat', 'again', 'question', 'can', 'maybe', 'later',
    'wait', 'hmm', 'umm', 'uh', 'ah', 'oh', 'mm',
  ].map(normalizeReplyText)
)

const GENERIC_REPLY_PHRASES = new Set(
  [
    'نعم مستعد', 'انا مستعد', 'انا جاهز', 'نعم جاهز', 'تمام ابدا', 'اعد السؤال',
    'ممكن تعيد السؤال', 'ممكن تعيد', 'السؤال التالي', 'ننتقل للسؤال التالي',
    'im ready', 'i am ready', 'lets go', 'lets start', 'go ahead', 'sounds good',
    'of course', 'repeat the question', 'can you repeat', 'next question',
  ].map(normalizeReplyText)
)

const AVOIDANCE_PATTERNS: RegExp[] = [
  /^(?:انا\s+)?(?:لا|ما|مش|مو)\s+(?:اعرف|ادري|اعلم)(?:\s+(?:الاجابه|اجابه|الجواب|هذا|ذلك|عن\s+هذا|حاليا|الان|بالضبط|بصراحه))*$/,
  /^(?:انا\s+)?(?:لا|ما|مش|مو)\s+(?:املك|عندي|لدي)\s+(?:اجابه|الاجابه|جواب|فكره)(?:\s+(?:واضحه|حاليا|الان|عن\s+هذا))*$/,
  /^(?:انا\s+)?(?:لا|ما|مش|مو)\s+(?:استطيع|اقدر)\s+(?:الاجابه|اجابه|الرد)(?:\s+(?:علي|على|عن)\s+(?:هذا\s+السؤال|هذا|السؤال))?$/,
  /^(?:انا\s+)?(?:لا|ما|مش|مو)\s+(?:اتذكر|متذكر)(?:\s+(?:الان|حاليا|هذا|ذلك))*$/,
  /^(?:انا\s+)?(?:غير|مش|مو|لست)\s+متاكد(?:ه)?(?:\s+(?:من\s+)?(?:الاجابه|اجابه|الجواب|هذا))*$/,
  /^(?:ما\s+)?(?:عندي|لدي)\s+(?:فكره|اجابه|جواب)(?:\s+(?:واضحه|حاليا|الان))*$/,
  /^(?:i\s+)?(?:do\s+not|dont)\s+know(?:\s+(?:the\s+)?(?:answer|question|this|that))?$/,
  /^(?:i\s+)?(?:cannot|cant)\s+answer(?:\s+(?:this|the\s+question))?$/,
  /^(?:i\s+)?(?:have|ive)\s+no\s+(?:idea|answer)(?:\s+(?:about\s+this|right\s+now))?$/,
  /^(?:i\s+)?(?:am|im)\s+not\s+sure(?:\s+(?:about|of)\s+(?:the\s+)?(?:answer|question|this))?$/,
  /^no\s+idea$/,
]

function isGenericWord(word: string): boolean {
  if (GENERIC_REPLY_WORDS.has(word)) return true
  if (word.length > 2 && (word.startsWith('و') || word.startsWith('ف'))) {
    return GENERIC_REPLY_WORDS.has(word.slice(1))
  }
  return false
}

function isCandidateSpeech(message: IncomingMessage): boolean {
  if (message.role !== 'user' || !message.content) return false
  const content = message.content.trim()
  if (!content || content.startsWith('[')) return false
  return !CONTEXT_PAYLOAD_PATTERN.test(content)
}

function isSubstantiveAnswer(content: string): boolean {
  const normalized = normalizeReplyText(content)
  if (!normalized) return false
  const words = normalized.split(' ')

  if (GENERIC_REPLY_PHRASES.has(normalized)) return false
  if (words.every(isGenericWord)) return false
  if (AVOIDANCE_PATTERNS.some(pattern => pattern.test(normalized))) return false

  if (words.length >= MIN_SUBSTANTIVE_WORDS) return true
  return words.length >= MIN_SHORT_ANSWER_WORDS && normalized.length >= MIN_SHORT_ANSWER_CHARS
}

function countSubstantiveAnswers(messages: IncomingMessage[]): number {
  return messages.filter(
    message => isCandidateSpeech(message) && isSubstantiveAnswer(message.content)
  ).length
}

// ─── Transcript and incomplete report ────────────────────────────────────────

function buildTranscript(messages: IncomingMessage[]): string {
  const clean = messages.filter(message =>
    message.role === 'user'
      ? isCandidateSpeech(message)
      : Boolean(message.content) && !message.content.trim().startsWith('[')
  )

  return clean
    .map(message => {
      const speaker =
        message.role === 'assistant' ? 'INTERVIEWER (Barbaros)' : 'CANDIDATE'
      return `${speaker}: ${message.content.trim()}`
    })
    .join('\n\n')
}

function truncateText(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text
  const slice = text.slice(0, max - 1)
  const lastSpace = slice.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`
}

function buildIncompleteReplay(
  messages: IncomingMessage[],
  language: string
): Array<Record<string, unknown>> {
  const isArabic = language === 'ar'
  const replay: Array<Record<string, unknown>> = []
  let lastAssistant = ''

  for (const message of messages) {
    if (message.role === 'assistant') {
      const content = message.content?.trim()
      if (content && !content.startsWith('[')) lastAssistant = content
      continue
    }

    if (!isCandidateSpeech(message)) continue

    replay.push({
      question: truncateText(
        lastAssistant || (isArabic ? 'إجابة ضمن الجلسة' : 'Response recorded in the session'),
        700
      ),
      answer: truncateText(message.content, 900),
      score: 0,
      analysis: isArabic
        ? 'تم تسجيل هذا التبادل كما حدث، دون منحه درجة أو استخدامه للحكم على الأداء لأن الجلسة غير مكتملة.'
        : 'This exchange is recorded as it occurred, without a score or performance judgment because the session is incomplete.',
      weakened: '',
      stronger: '',
    })

    if (replay.length === 3) break
  }

  return replay
}

function buildIncompleteReport(
  messages: IncomingMessage[],
  config: ReportConfig,
  assessmentCoverage: AssessmentCoverage
): Record<string, unknown> {
  const isArabic = config.language === 'ar'
  const competencyNames = isArabic
    ? ['التواصل', 'الثقة', 'الخبرة في المجال', 'تنظيم الإجابة', 'حل المشكلات', 'الوضوح']
    : ['Communication', 'Confidence', 'Domain Expertise', 'Structure', 'Problem Solving', 'Clarity']

  const why = isArabic
    ? 'لم يُقيَّم هذا البعد لأن الجلسة لم تتضمن ثلاث إجابات فعلية على الأقل.'
    : 'This dimension was not assessed because the session did not include at least three substantive answers.'

  return {
    finalScore: 0,
    readinessLevel: isArabic ? 'المقابلة غير مكتملة' : 'Interview Incomplete',
    verdict: isArabic
      ? 'لم يصدر حكم مهني على أدائك لأن الجلسة لم تتضمن أدلة كافية. هذه الحالة تعني أن المقابلة غير مكتملة، ولا تعني ضعفاً في الكفاءة.'
      : 'No professional verdict was issued because the session did not contain enough evidence. This status means the interview is incomplete; it does not indicate weak ability.',
    barbarosAssessment: isArabic
      ? 'لا أستطيع إصدار تقييم موثوق من هذه الجلسة القصيرة. يلزم إكمال مقابلة تتضمن ثلاث إجابات فعلية على الأقل.'
      : 'I cannot issue a reliable assessment from this short session. Complete an interview with at least three substantive answers.',
    assessmentCoverage,
    competencies: competencyNames.map(name => ({ name, score: 0, why })),
    hiddenWeakness: isArabic
      ? 'لا يمكن تحديد نقطة ضعف موثوقة من جلسة غير مكتملة.'
      : 'No reliable weakness can be identified from an incomplete session.',
    behavioralPatterns: isArabic
      ? 'لا يمكن استنتاج نمط سلوكي موثوق من الأدلة المتاحة في هذه الجلسة.'
      : 'No reliable behavioral pattern can be inferred from the evidence available in this session.',
    replay: buildIncompleteReplay(messages, config.language),
    recommendation: isArabic
      ? 'ابدأ مقابلة جديدة وأكمل ثلاث إجابات فعلية على الأقل للحصول على تقييمك الكامل ضمن الباقة المختارة.'
      : 'Start a new interview and complete at least three substantive answers to receive the full assessment included in your selected plan.',
    interviewIncomplete: true,
  }
}

// ─── Report localization ─────────────────────────────────────────────────────

function localizeReportLabels(
  report: Record<string, unknown>,
  language: string
): Record<string, unknown> {
  if (language !== 'ar') return report

  const localized: Record<string, unknown> = { ...report }

  if (typeof localized.readinessLevel === 'string') {
    localized.readinessLevel =
      AR_READINESS_LEVELS[localized.readinessLevel] ?? localized.readinessLevel
  }

  return localized
}

// ─── Prompt builder for complete interviews only ─────────────────────────────

function buildReportPrompt(
  config: ReportConfig,
  assessmentCoverage: AssessmentCoverage
): string {
  const isArabic = config.language === 'ar'
  const planTier = resolvePlanTier(config.plan)

  const languageRule = isArabic
    ? 'Write ALL human-readable text fields in clear, professional Modern Standard Arabic. Keep JSON keys in English exactly as specified.'
    : 'Write ALL human-readable text fields in clear, professional English. Keep JSON keys in English exactly as specified.'

  const coverageRule = isArabic
    ? `تم تحديد نطاق التقييم مسبقاً من بيانات الجلسة. لا تدّعِ قياس أي محور غير موجود في هذا الكائن:\n${JSON.stringify(assessmentCoverage, null, 2)}`
    : `Assessment coverage has already been resolved from the session data. Do not claim that any dimension was measured unless it appears in this object:\n${JSON.stringify(assessmentCoverage, null, 2)}`

  const coverageIntegrityRule =
    planTier === 'go'
      ? 'The advanced areas in recommendedForDeeperAssessment are available in higher plans. Do not describe them as measured in this session.'
      : 'Do not expand measured coverage from package capabilities. Package capabilities are not proof that a dimension was measured in this session.'

  const audienceRule = isArabic
    ? `هذا التقرير يُعرض مباشرة لك، وليس لصاحب العمل.
- خاطبك بصيغة مباشرة مثل: أظهرت، قدّمت، تحتاج إلى، لم تتمكن خلال هذه الجلسة.
- لا تستخدم: المرشح، ${config.candidateName || 'اسم الشخص'} يعتمد، لا يُنصح بتوظيفه، أو أي قرار توظيف.
- كن حازماً وصادقاً، لكن لا تستخدم لغة جارحة أو مهينة.`
    : `This report is shown directly to you, not to an employer.
- Address you directly using second-person language.
- Never refer to "the candidate", use the candidate's name in third person, or issue an employment decision.
- Be firm and honest without using humiliating or hurtful language.`

  const competencyOutput = isArabic
    ? `[
    { "name": "التواصل", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" },
    { "name": "الثقة", "score": <0-100>, "why": "<سبب مبني على سلوك ملحوظ في المقابلة>" },
    { "name": "الخبرة في المجال", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" },
    { "name": "تنظيم الإجابة", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" },
    { "name": "حل المشكلات", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" },
    { "name": "الوضوح", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" }
  ]`
    : `[
    { "name": "Communication", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Confidence", "score": <0-100>, "why": "<reason based only on observable interview behavior>" },
    { "name": "Domain Expertise", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Structure", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Problem Solving", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Clarity", "score": <0-100>, "why": "<evidence-based reason>" }
  ]`

  return `You are Barbaros, an elite AI interview evaluator who has completed a job-interview simulation. Write a serious, candidate-facing performance report.

CANDIDATE CONTEXT:
- Name: ${config.candidateName}
- Role: ${config.jobTitle}
- Organization: ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience}
- Package: ${config.plan}

CORE EVIDENCE RULES:
- Every observation must be anchored to the candidate's actual answers in this session.
- Reference real questions, answer fragments, contradictions, ownership, avoidance, or role evidence.
- Never invent experience, achievements, qualifications, quotes, questions, motives, or behavior.
- Reject generic HR filler. If a sentence could apply to another candidate, rewrite it.
- Evaluate a real human under interview pressure, not an ideal AI answer.
- Concise, honest evidence can score strongly; do not require perfect STAR structure.
- Penalize only real deficiencies in evidence, consistency, ownership, role readiness, or domain understanding.
- Describe observable behavior and evidence. Never attribute intent or character.
- Forbidden meanings include: deliberately evaded, tried to exaggerate, lacks transparency, claims expertise, dishonest, or not recommended for hiring.
- Use evidence language instead, such as: the answer did not provide enough evidence, an inconsistency appeared, or the required technical depth was not demonstrated in this session.

AUDIENCE & VOICE:
${audienceRule}

FIRM BUT CONSTRUCTIVE:
- Do not hide weaknesses or soften scores with false praise.
- State the weakness, the supporting evidence, its likely interview impact, and the practical training priority.
- Frame every judgment as limited to this simulated session, not as a fixed judgment of ability.
- The recommendation must invite the candidate to train again and compare measurable improvement in a future session.
- Do not promise a specific score increase, hiring outcome, or acceptance result.

OVERALL JUDGMENT RESTRICTION:
- Do not produce or mention finalScore, hireProbability, readinessLevel, overall readiness, hiring probability, or an employment recommendation.
- Do not write phrases equivalent to "strongly ready", "low chance of hiring", or "not recommended for employment" in verdict, barbarosAssessment, or recommendation.
- Application code will compute and display the overall score and session-readiness category.

CONFIDENCE SCORING:
- Score Confidence only from observable behavior in this session, such as answer stability, clarity under pressure, unexplained retreat, or ability to maintain a supported position.
- Do not infer confidence from accent, culture, personality type, quietness, speaking style, or fluency alone.

ASSESSMENT COVERAGE:
${coverageRule}
${coverageIntegrityRule}

SCORING:
- Competency and replay scores are 0-100 and must feel earned.
- 90+ is extremely rare; 75-89 strong; 55-74 acceptable; 35-54 weak; below 35 poor.
- Every competency why must reference actual interview evidence.

REPLAY:
- Select only the 3-5 most important questions; more than 5 is invalid.
- Use a short representative excerpt for long answers.
- The same answer or incident may support more than one analytical observation, but do not present it as two independent pieces of evidence.
- If one incident serves two purposes, keep the distinction in analysis rather than duplicating the evidence.
- analysis: 1-2 sentences.
- weakened: 1-2 sentences, or empty if the answer was strong.
- stronger: realistic improved answer, 3-5 sentences maximum, or empty if already strong.
- Never label answers correct or wrong.

LENGTH:
- verdict: 2-3 sentences describing the current session performance without an overall readiness label.
- barbarosAssessment: 2-3 evidence-based sentences in Barbaros's voice without an overall readiness label.
- hiddenWeakness: 2-3 sentences.
- behavioralPatterns: 2-4 sentences.
- recommendation: 2-3 direct next-step sentences based only on this session.
- Do not add keys or repeat the same observation across fields.

LANGUAGE:
${languageRule}

OUTPUT:
Return ONLY one valid JSON object, with no markdown or text before or after:
{
  "verdict": "<2-3 candidate-facing sentences about this session>",
  "barbarosAssessment": "<2-3 first-person sentences in Barbaros's voice>",
  "competencies": ${competencyOutput},
  "hiddenWeakness": "<single most important recurring performance weakness>",
  "behavioralPatterns": "<2-4 sentences on recurring observable patterns>",
  "replay": [
    {
      "question": "<actual interviewer question>",
      "answer": "<actual answer, lightly trimmed>",
      "score": <0-100>,
      "analysis": "<specific interviewer observation>",
      "weakened": "<specific weakness or empty string>",
      "stronger": "<realistic stronger response or empty string>"
    }
  ],
  "recommendation": "<2-3 direct training and return-session sentences>"
}`
}

// ─── JSON extraction ─────────────────────────────────────────────────────────

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function extractFencedBlock(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match ? match[1].trim() : null
}

function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

function cleanupJsonText(text: string): string {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  let result = tryParseObject(trimmed)
  if (result) return result

  const fenced = extractFencedBlock(trimmed)
  if (fenced) {
    result = tryParseObject(fenced) ?? tryParseObject(cleanupJsonText(fenced))
    if (result) return result
  }

  const stripped = trimmed.replace(/```json/gi, '').replace(/```/g, '')
  const balanced = extractBalancedObject(stripped)
  if (balanced) {
    result = tryParseObject(balanced) ?? tryParseObject(cleanupJsonText(balanced))
    if (result) return result
  }

  const cleaned = cleanupJsonText(stripped)
  result = tryParseObject(cleaned)
  if (result) return result

  const cleanedBalanced = extractBalancedObject(cleaned)
  return cleanedBalanced ? tryParseObject(cleanedBalanced) : null
}

// ─── Validation ──────────────────────────────────────────────────────────────

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isScoreNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  )
}

const MAX_FIELD_CHARS: Record<string, number> = {
  verdict: 900,
  barbarosAssessment: 900,
  hiddenWeakness: 900,
  behavioralPatterns: 1200,
  recommendation: 900,
}

const MAX_REPLAY_ITEM_CHARS: Record<string, number> = {
  question: 700,
  answer: 900,
  analysis: 800,
  weakened: 800,
  stronger: 1400,
}

function validateReportData(
  report: Record<string, unknown>,
  evidenceSufficient: boolean,
  requireDerivedFields = true
): string[] {
  const problems: string[] = []

  if (requireDerivedFields) {
    if (!isScoreNumber(report.finalScore)) problems.push('finalScore')
    if (!isNonEmptyString(report.readinessLevel)) problems.push('readinessLevel')
  }

  if (!isNonEmptyString(report.verdict)) problems.push('verdict')
  if (!isNonEmptyString(report.barbarosAssessment)) problems.push('barbarosAssessment')
  if (!isNonEmptyString(report.hiddenWeakness)) problems.push('hiddenWeakness')
  if (!isNonEmptyString(report.behavioralPatterns)) problems.push('behavioralPatterns')
  if (!isNonEmptyString(report.recommendation)) problems.push('recommendation')

  if (!canonicalizeCompetencies(report.competencies)) {
    problems.push('competencies (six unique valid competencies required)')
  }

  if (!Array.isArray(report.replay)) {
    problems.push('replay')
  } else if (evidenceSufficient && report.replay.length === 0) {
    problems.push('replay')
  } else if (evidenceSufficient && report.replay.length > 5) {
    problems.push('replay (more than 5 items)')
  } else if (!evidenceSufficient && report.replay.length > 3) {
    problems.push('replay (more than 3 items for incomplete session)')
  }

  for (const [field, max] of Object.entries(MAX_FIELD_CHARS)) {
    const value = report[field]
    if (typeof value === 'string' && value.length > max) {
      problems.push(`${field} too long`)
    }
  }

  if (Array.isArray(report.replay)) {
    report.replay.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        problems.push(`replay[${index}]`)
        return
      }

      const replayItem = item as Record<string, unknown>
      if (!isNonEmptyString(replayItem.question)) problems.push(`replay[${index}].question`)
      if (!isNonEmptyString(replayItem.answer)) problems.push(`replay[${index}].answer`)
      if (!isScoreNumber(replayItem.score)) problems.push(`replay[${index}].score`)
      if (!isNonEmptyString(replayItem.analysis)) problems.push(`replay[${index}].analysis`)
      if (typeof replayItem.weakened !== 'string') problems.push(`replay[${index}].weakened`)
      if (typeof replayItem.stronger !== 'string') problems.push(`replay[${index}].stronger`)
      if (
        replayItem.countsTowardPath !== undefined &&
        typeof replayItem.countsTowardPath !== 'boolean'
      ) {
        problems.push(`replay[${index}].countsTowardPath`)
      }

      for (const [field, max] of Object.entries(MAX_REPLAY_ITEM_CHARS)) {
        const value = replayItem[field]
        if (typeof value === 'string' && value.length > max) {
          problems.push(`replay[${index}].${field} too long`)
        }
      }
    })
  }

  return problems
}

// ─── Safe logging and repair ─────────────────────────────────────────────────

function logRawSafely(stage: string, raw: string): void {
  const head = raw.slice(0, 120)
  const tail = raw.length > 240 ? raw.slice(-120) : ''
  console.error(
    `[report] ${stage}: raw.length=${raw.length}` +
      ` head=${JSON.stringify(head)}` +
      (tail ? ` tail=${JSON.stringify(tail)}` : '')
  )
}

const REPORT_MAX_TOKENS = 16000

const REPAIR_SYSTEM_PROMPT = `You are a strict JSON repair tool.
The user message contains a model output that should be one valid JSON object.
Fix syntax only. Preserve every key and value exactly. Do not add, remove, translate, shorten, or rewrite content.
Output only the JSON object.`

async function repairJson(raw: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: REPORT_MAX_TOKENS,
      system: REPAIR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: raw }],
    })

    const repairedRaw =
      response.content[0]?.type === 'text' ? response.content[0].text : ''

    if (response.stop_reason === 'max_tokens') {
      logRawSafely('repair_output_truncated', repairedRaw)
      return null
    }

    return extractJson(repairedRaw)
  } catch (err) {
    console.error(
      '[report] repair pass failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }
}

// ─── Core ────────────────────────────────────────────────────────────────────

export async function generateReportData(
  input: GenerateReportInput
): Promise<Record<string, unknown>> {
  const { messages, config } = input

  const rawCoveredAreas =
    input.coveredAreas ??
    (config as ReportConfig & { coveredAreas?: unknown })?.coveredAreas

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ReportGenerationError('No interview messages provided', 400)
  }

  if (!config || typeof config !== 'object') {
    throw new ReportGenerationError('Missing config', 400)
  }

  const substantiveAnswerCount = countSubstantiveAnswers(messages)
  const evidenceSufficient = substantiveAnswerCount >= MIN_SUBSTANTIVE_ANSWERS

  console.info(
    `[report] evidence gate: substantiveAnswers=${substantiveAnswerCount}` +
      ` min=${MIN_SUBSTANTIVE_ANSWERS} sufficient=${evidenceSufficient}` +
      ` tier=${resolvePlanTier(config.plan)}`
  )

  const normalizedCoveredAreas = normalizeCoveredAreas(rawCoveredAreas)
  const coveredAreas = evidenceSufficient ? normalizedCoveredAreas : []

  const assessmentCoverage = buildAssessmentCoverage(
    coveredAreas,
    config.language,
    config.plan,
    evidenceSufficient
  )

  if (!evidenceSufficient) {
    const incompleteReport = buildIncompleteReport(messages, config, assessmentCoverage)
    const problems = validateReportData(incompleteReport, false)

    if (problems.length > 0) {
      throw new ReportGenerationError(
        `Incomplete report validation failed: ${problems.join(', ')}`,
        500
      )
    }

    return incompleteReport
  }

  const transcript = buildTranscript(messages)
  if (transcript.trim().length < 20) {
    throw new ReportGenerationError('Interview too short to evaluate', 400)
  }

  const systemPrompt = buildReportPrompt(config, assessmentCoverage)
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: REPORT_MAX_TOKENS,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Here is the full interview transcript. Produce the JSON hiring report now.\n\n${transcript}`,
      },
    ],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''

  if (response.stop_reason === 'max_tokens') {
    logRawSafely('output_truncated', raw)
    throw new ReportGenerationError(
      'Report output truncated (max_tokens reached)',
      502
    )
  }

  let report = extractJson(raw)
  if (!report) {
    logRawSafely('parse_failed_trying_repair', raw)
    report = await repairJson(raw)
  }

  if (!report) {
    logRawSafely('repair_failed', raw)
    throw new ReportGenerationError('Could not parse report output', 502)
  }

  const modelProblems = validateReportData(report, true, false)
  if (modelProblems.length > 0) {
    console.error(
      `[report] model validation failed: ${modelProblems.join(', ')}`
    )
    throw new ReportGenerationError(
      `Report validation failed: ${modelProblems.join(', ')}`,
      502
    )
  }

  const competencies = canonicalizeCompetencies(report.competencies)
  if (!competencies) {
    throw new ReportGenerationError(
      'Report validation failed: invalid competency matrix',
      502
    )
  }

  const finalScore = computeFinalScore(competencies)
  const evidenceThin =
    substantiveAnswerCount >= MIN_SUBSTANTIVE_ANSWERS &&
    substantiveAnswerCount <= THIN_EVIDENCE_MAX_ANSWERS
  const readinessLevel = deriveReadinessLevel(finalScore, evidenceThin)

  const enrichedReport: Record<string, unknown> = {
    ...report,
    finalScore,
    readinessLevel,
    competencies,
    replay: markReplayPathCounts(report.replay),
    assessmentCoverage,
    interviewIncomplete: false,
  }

  delete enrichedReport.hireProbability

  const finalProblems = validateReportData(enrichedReport, true, true)
  if (finalProblems.length > 0) {
    throw new ReportGenerationError(
      `Derived report validation failed: ${finalProblems.join(', ')}`,
      502
    )
  }

  return localizeReportLabels(enrichedReport, config.language)
}
