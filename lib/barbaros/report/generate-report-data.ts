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

const TIER_EXTENDED_COVERAGE: Record<PlanTier, Record<'en' | 'ar', string[]>> = {
  go: { en: [], ar: [] },
  pro: {
    en: [
      'Behavioral Consistency',
      'Competency Mapping',
      'Pressure Response',
      'Leadership Judgment',
      'Improvement Priorities',
    ],
    ar: [
      'الاتساق السلوكي',
      'خريطة الكفاءات',
      'الاستجابة للضغط',
      'الحُكم القيادي',
      'أولويات التحسين',
    ],
  },
  expert: {
    en: [
      'Behavioral Analysis',
      'Competency Mapping',
      'Scenario-Based Pressure',
      'Leadership Judgment',
      'Strategic Thinking',
      'Executive Judgment',
      'Panel Role Simulation',
      'Long-Form Behavioral Analysis',
      'Decision-Grade Recommendations',
    ],
    ar: [
      'التحليل السلوكي',
      'خريطة الكفاءات',
      'الضغط القائم على السيناريوهات',
      'الحُكم القيادي',
      'التفكير الاستراتيجي',
      'الحُكم التنفيذي',
      'محاكاة أدوار لجنة المقابلة',
      'التحليل السلوكي المُطوَّل',
      'توصيات بمستوى قرار التوظيف',
    ],
  },
}

const AR_READINESS_LEVELS: Record<string, string> = {
  'Strong Hire': 'جاهز بقوة',
  'Maybe Hire': 'قابل للتوصية بحذر',
  'Risky Candidate': 'مخاطرة عالية',
  'Not Recommended': 'غير جاهز حالياً',
  'Interview Incomplete': 'المقابلة غير مكتملة',
}

const AR_COMPETENCY_NAMES: Record<string, string> = {
  Communication: 'التواصل',
  Confidence: 'الثقة',
  'Domain Expertise': 'الخبرة في المجال',
  Structure: 'تنظيم الإجابة',
  'Problem Solving': 'حل المشكلات',
  Clarity: 'الوضوح',
}

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
    lang === 'ar' ? 'نطاق التقييم في هذه الباقة' : 'Assessment scope for this package'

  if (!evidenceSufficient) {
    const summary =
      lang === 'ar'
        ? 'لم تُعتمد أي محاور كمقاسة في هذه الجلسة لعدم اكتمال المقابلة.'
        : 'No dimensions are presented as measured in this session because the interview is incomplete.'

    if (tier === 'pro') {
      return {
        title,
        summary,
        coveredAreaKeys: [],
        coveredAreas: [],
        recommendedForDeeperAssessment: [],
        upgradeNote:
          lang === 'ar'
            ? 'صُمِّمت باقة Pro لقياس الاتساق السلوكي، وخريطة الكفاءات، والاستجابة للضغط، والحُكم القيادي، وأولويات التحسين. لم توفّر هذه الجلسة ثلاث إجابات فعلية على الأقل، لذلك لم يُعتمد أي محور كمقاس. هذا قيد على الجلسة، لا على باقتك ولا على أدائك. أكمل مقابلة كاملة للحصول على النطاق المهني الكامل.'
            : 'The Pro plan is built to measure behavioral consistency, competency mapping, pressure response, leadership judgment, and improvement priorities. This session did not provide at least three substantive answers, so no dimension is presented as measured. This is a limitation of the session, not of your plan or ability. Complete a full interview to receive the full professional scope.',
      }
    }

    if (tier === 'expert') {
      return {
        title,
        summary,
        coveredAreaKeys: [],
        coveredAreas: [],
        recommendedForDeeperAssessment: [],
        upgradeNote:
          lang === 'ar'
            ? 'صُمِّمت باقة Expert لتقديم التقييم التنفيذي الأشمل، بما يشمل محاكاة أدوار اللجنة، والضغط، والتفكير الاستراتيجي، والحُكم التنفيذي، وتوصيات بمستوى قرار التوظيف. لم توفّر هذه الجلسة ثلاث إجابات فعلية على الأقل، لذلك لم يُعتمد أي محور كمقاس. هذا قيد على الجلسة، لا على باقتك ولا على أدائك. أكمل مقابلة كاملة للحصول على النطاق التنفيذي الكامل.'
            : 'The Expert plan is built to deliver the most comprehensive executive assessment, including panel simulation, pressure response, strategic thinking, executive judgment, and decision-grade recommendations. This session did not provide at least three substantive answers, so no dimension is presented as measured. This is a limitation of the session, not of your plan or ability. Complete a full interview to receive the full executive scope.',
      }
    }

    return {
      title,
      summary:
        lang === 'ar'
          ? 'لم تُعتمد أي محاور كمقاسة في هذه الجلسة لعدم اكتمال المقابلة، وتبقى المحاور المتقدمة المتاحة في الباقات الأعلى ظاهرة أدناه.'
          : 'No dimensions are presented as measured because the interview is incomplete; advanced areas available in higher-tier plans remain listed below.',
      coveredAreaKeys: [],
      coveredAreas: [],
      recommendedForDeeperAssessment: DEEPER_ASSESSMENT_LABELS[lang],
      upgradeNote:
        lang === 'ar'
          ? 'لم توفّر هذه الجلسة ثلاث إجابات فعلية على الأقل لقراءة جاهزيتك الأساسية، لذلك لم يُعتمد أي محور كمقاس. هذا قيد على الجلسة، لا على أدائك. أكمل مقابلة كاملة للحصول على تقييم جاهزيتك الأساسية.'
          : 'This session did not provide at least three substantive answers for a baseline readiness reading, so no dimension is presented as measured. This is a limitation of the session, not of your ability. Complete a full interview to receive your baseline readiness assessment.',
    }
  }

  if (tier === 'pro') {
    return {
      title,
      summary:
        lang === 'ar'
          ? 'يعرض هذا القسم النطاق المهني الكامل للتقييم المُنجز في هذه الباقة.'
          : 'This section outlines the full professional scope of evaluation completed in this plan.',
      coveredAreaKeys: coveredAreas,
      coveredAreas: [...essentialLabels, ...TIER_EXTENDED_COVERAGE.pro[lang]],
      recommendedForDeeperAssessment: [],
      upgradeNote:
        lang === 'ar'
          ? 'ضمن هذه الباقة، تم دمج المحاور المهنية الموسّعة أعلاه — الاتساق السلوكي، وخريطة الكفاءات، والاستجابة للضغط، والحُكم القيادي، وأولويات التحسين — مباشرةً في درجاتك وتوصياتك، وبالعمق المهني الذي صُمِّمت له باقة Pro. أمّا باقة Expert فتأخذ التقييم نفسه إلى المستوى التنفيذي، مضيفةً محاكاة أدوار لجنة المقابلة، والحُكم الاستراتيجي والتنفيذي، وتوصيات بمستوى قرار التوظيف.'
          : 'In this plan, the extended professional dimensions above — behavioral consistency, competency mapping, pressure response, leadership judgment, and improvement priorities — were integrated directly into your scoring and recommendations, at the professional depth Pro is designed for. The Expert plan carries the same evaluation further into executive territory, adding panel role simulation, strategic and executive judgment, and decision-grade recommendations.',
    }
  }

  if (tier === 'expert') {
    return {
      title,
      summary:
        lang === 'ar'
          ? 'يؤكد هذا القسم النطاق الشامل للتقييم التنفيذي المُنجز في هذه الباقة.'
          : 'This section confirms the comprehensive, executive-level scope of evaluation completed in this plan.',
      coveredAreaKeys: coveredAreas,
      coveredAreas: [...essentialLabels, ...TIER_EXTENDED_COVERAGE.expert[lang]],
      recommendedForDeeperAssessment: [],
      upgradeNote:
        lang === 'ar'
          ? 'هذا أشمل تقييم نقدّمه. كل المحاور أعلاه — من ملاءمة الدور الأساسية إلى محاكاة أدوار لجنة المقابلة والتفكير الاستراتيجي والحُكم التنفيذي — قِيست ضمن تقييم واحد بمستوى قرار التوظيف. لا توجد درجة تقييم أعلى من هذا التقرير.'
          : 'This is the most comprehensive assessment we produce. Every dimension above — from core role fit through panel role simulation, strategic thinking, and executive judgment — was measured within a single decision-grade evaluation. There is no higher assessment tier beyond this report.',
    }
  }

  const coveredLabels = essentialLabels
  const upgradeNote =
    lang === 'ar'
      ? `ضمن هذه الباقة، تم تقييم المحاور الأساسية التالية فقط: ${joinAr(coveredLabels)}. أمّا المحاور المتقدمة الظاهرة أدناه فلم يتم قياسها ضمن هذه الجلسة، وهي متاحة بتفصيل أعمق في الباقات الأعلى. مهنياً، هذا لا يعني أن تقريرك ناقص؛ بل يعني أن هذه الباقة تقيس جاهزيتك الأساسية للمقابلة، بينما تكشف الباقات الأعلى صورة أوسع عن أدائك، وحكمك القيادي، وتفكيرك الاستراتيجي، وقدرتك على الثبات تحت ضغط أقرب للمقابلات الحقيقية.`
      : `In this package, only the following core areas were assessed: ${joinEn(coveredLabels)}. The advanced areas listed below were not measured in this session; they are available in greater depth in higher-tier plans. Professionally, this does not mean your report is incomplete; it means this package measures your baseline interview readiness, while higher-tier plans reveal a fuller picture of your performance, leadership judgment, strategic thinking, and ability to perform under realistic interview pressure.`

  return {
    title,
    summary:
      lang === 'ar'
        ? 'يعرض هذا القسم نطاق التقييم المُنجز في هذه الباقة، والمحاور المتاحة بتفصيل أعمق في الباقات الأعلى.'
        : 'This section outlines the scope of evaluation completed in this package and the areas available in greater depth in higher-tier plans.',
    coveredAreaKeys: coveredAreas,
    coveredAreas: coveredLabels,
    recommendedForDeeperAssessment: DEEPER_ASSESSMENT_LABELS[lang],
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
    hireProbability: 0,
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

  if (Array.isArray(localized.competencies)) {
    localized.competencies = localized.competencies.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      const competency = item as Record<string, unknown>
      if (typeof competency.name !== 'string') return competency
      return {
        ...competency,
        name: AR_COMPETENCY_NAMES[competency.name] ?? competency.name,
      }
    })
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
    ? `Assessment Coverage تم تحديده مسبقاً من محرك المقابلة. لا تضف محاور، لا تحذف محاور، لا تغيّر الأسماء، ولا تعيد تفسيرها. استخدم هذا الكائن كما هو:\n${JSON.stringify(assessmentCoverage, null, 2)}`
    : `Assessment Coverage has already been resolved by the interview engine. Do not add, remove, rename, or reinterpret covered areas. Use this exact object:\n${JSON.stringify(assessmentCoverage, null, 2)}`

  const coverageIntegrityRule =
    planTier === 'go'
      ? `The upgradeNote is intentional. Keep it professional, clear, and not pushy.
Make it clear that the advanced areas listed in recommendedForDeeperAssessment were NOT measured in this package.`
      : `The upgradeNote is intentional. Keep it professional and confident.
Never describe any dimension listed in coveredAreas as unmeasured, missing, partial, or reserved for a higher plan.
recommendedForDeeperAssessment is intentionally empty for this plan; do not populate it.`

  const audienceRule = isArabic
    ? 'هذا التقرير يُعرض مباشرة للمرشح، وليس لصاحب العمل. اكتب بصيغة تخاطب المرشح مباشرة، وكن صارماً وواضحاً دون لغة آلية أو مجاملات عامة.'
    : 'This report is shown directly to the candidate, not to the employer. Address the candidate directly and stay rigorous, specific, and professional.'

  const readinessLevelOptions = isArabic
    ? 'جاهز بقوة | قابل للتوصية بحذر | مخاطرة عالية | غير جاهز حالياً'
    : 'Strong Hire | Maybe Hire | Risky Candidate | Not Recommended'

  const competencyOutput = isArabic
    ? `[
    { "name": "التواصل", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" },
    { "name": "الثقة", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" },
    { "name": "الخبرة في المجال", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" },
    { "name": "تنظيم الإجابة", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" },
    { "name": "حل المشكلات", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" },
    { "name": "الوضوح", "score": <0-100>, "why": "<سبب مبني على دليل من المقابلة>" }
  ]`
    : `[
    { "name": "Communication", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Confidence", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Domain Expertise", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Structure", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Problem Solving", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Clarity", "score": <0-100>, "why": "<evidence-based reason>" }
  ]`

  return `You are Barbaros, an elite AI hiring evaluator who has just completed a real job interview. Write a private, serious, candidate-facing performance report.

CANDIDATE CONTEXT:
- Name: ${config.candidateName}
- Role: ${config.jobTitle}
- Organization: ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience}
- Package: ${config.plan}

CORE RULES:
- Every observation must be anchored to the candidate's actual answers.
- Reference real moments, questions, answer fragments, contradictions, ownership, avoidance, or role evidence from this interview.
- Never invent experience, achievements, qualifications, quotes, questions, or behavior.
- Reject generic HR filler. If a sentence could apply to another candidate, rewrite it.
- Evaluate a real human under interview pressure, not an ideal AI answer.
- Concise, honest evidence can score strongly; do not require perfect STAR structure.
- Penalize only real deficiencies in evidence, consistency, ownership, role readiness, or domain understanding.

AUDIENCE & VOICE:
${audienceRule}

ASSESSMENT COVERAGE:
${coverageRule}
The assessmentCoverage object must appear in the final JSON with exactly the same values.
${coverageIntegrityRule}

SCORING:
- Scores are 0-100 and must feel earned.
- 90+ is extremely rare; 75-89 strong; 55-74 acceptable; 35-54 weak; below 35 poor.
- Every competency why must reference actual interview evidence.

REPLAY:
- Select only the 3-5 most important questions; more than 5 is invalid.
- Use a short representative excerpt for long answers.
- analysis: 1-2 sentences.
- weakened: 1-2 sentences, or empty if the answer was strong.
- stronger: realistic improved answer, 3-5 sentences maximum, or empty if already strong.
- Never label answers correct or wrong.

LENGTH:
- verdict: 2-3 sentences.
- barbarosAssessment: 2-3 sentences.
- hiddenWeakness: 2-3 sentences.
- behavioralPatterns: 2-4 sentences.
- recommendation: 2-3 sentences.
- Do not add keys or repeat the same observation across fields.

LANGUAGE:
${languageRule}

OUTPUT:
Return ONLY one valid JSON object, with no markdown or text before or after:
{
  "finalScore": <number 0-100>,
  "readinessLevel": "<one of: ${readinessLevelOptions}>",
  "hireProbability": <number 0-100>,
  "verdict": "<2-3 candidate-facing sentences>",
  "barbarosAssessment": "<2-3 first-person sentences in Barbaros's voice>",
  "assessmentCoverage": ${JSON.stringify(assessmentCoverage, null, 2)},
  "competencies": ${competencyOutput},
  "hiddenWeakness": "<single most important recurring weakness>",
  "behavioralPatterns": "<2-4 sentences on recurring patterns>",
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
  "recommendation": "<2-3 direct next-step sentences>"
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

function isScoreNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
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
  evidenceSufficient: boolean
): string[] {
  const problems: string[] = []

  if (!isScoreNumber(report.finalScore)) problems.push('finalScore')
  if (!isNonEmptyString(report.readinessLevel)) problems.push('readinessLevel')
  if (!isScoreNumber(report.hireProbability)) problems.push('hireProbability')
  if (!isNonEmptyString(report.verdict)) problems.push('verdict')
  if (!isNonEmptyString(report.barbarosAssessment)) problems.push('barbarosAssessment')
  if (!isNonEmptyString(report.hiddenWeakness)) problems.push('hiddenWeakness')
  if (!isNonEmptyString(report.behavioralPatterns)) problems.push('behavioralPatterns')
  if (!isNonEmptyString(report.recommendation)) problems.push('recommendation')

  if (!Array.isArray(report.competencies) || report.competencies.length === 0) {
    problems.push('competencies')
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
  const coveredAreas = !evidenceSufficient
    ? []
    : normalizedCoveredAreas.length > 0
      ? normalizedCoveredAreas
      : [...ESSENTIAL_AXIS_ORDER]

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

  const missingFields = validateReportData(report, true)
  if (missingFields.length > 0) {
    console.error(
      `[report] validation failed, missing/invalid fields: ${missingFields.join(', ')}`
    )
    throw new ReportGenerationError(
      `Report validation failed: ${missingFields.join(', ')}`,
      502
    )
  }

  const localizedReport = localizeReportLabels(report, config.language)
  return {
    ...localizedReport,
    assessmentCoverage,
  }
}
