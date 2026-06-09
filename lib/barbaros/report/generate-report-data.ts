
// lib/barbaros/report/generate-report-data.ts
// Barbaros report data generator (Next-independent, reusable).
// Logic extracted verbatim from app/api/generate-report/route.ts.

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

// ─── Assessment Coverage ─────────────────────────────────────────────────────

const DEEPER_ASSESSMENT_LABELS: Record<'en' | 'ar', string[]> = {
  en: [
    'Advanced technical depth',
    'Leadership judgment',
    'Scenario-based pressure',
    'Strategic thinking',
    'Long-form behavioral analysis',
    'Multiple role simulations',
  ],
  ar: [
    'عمق تقني متقدّم',
    'حُكم قيادي',
    'ضغط قائم على السيناريوهات',
    'تفكير استراتيجي',
    'تحليل سلوكي مطوّل',
    'محاكاة أدوار متعددة',
  ],
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
    if (allowed.has(axis)) {
      received.add(axis)
    }
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
  language: string
): AssessmentCoverage {
  const lang = reportLang(language)
  const coveredLabels = coveredAreas.map(axis => ESSENTIAL_AXIS_LABELS[axis][lang])

  const upgradeNote =
    lang === 'ar'
      ? `ركّز تقييمك الحالي ضمن باقة Essential على المحاور الأساسية الأكثر تأثيراً في الجاهزية المبدئية للمقابلة: ${joinAr(coveredLabels)}. للحصول على تقييم أعمق, تمنحك الباقات الأعلى تغطية أوسع تشمل العمق التقني المتقدم، الحكم القيادي، الضغط القائم على السيناريوهات، التفكير الاستراتيجي، التحليل السلوكي المطوّل، ومحاكاة أدوار متعددة.`
      : `Your current Essential Assessment focused on the core areas most important for baseline interview readiness: ${joinEn(coveredLabels)}. For a deeper evaluation, higher packages expand the assessment into advanced technical depth, leadership judgment, scenario-based pressure, strategic thinking, long-form behavioral analysis, and multiple role simulations.`

  return {
    title: lang === 'ar' ? 'نطاق التقييم' : 'Assessment Coverage',
    summary:
      lang === 'ar'
        ? 'يقدّم التقييم الأساسي تقييماً مركّزاً عالي الإشارة للمحاور الجوهرية التي تحدّد الجاهزية المبدئية.'
        : 'This Essential Assessment delivers a focused, high-signal evaluation of the core areas that determine baseline readiness.',
    coveredAreaKeys: coveredAreas,
    coveredAreas: coveredLabels,
    recommendedForDeeperAssessment: DEEPER_ASSESSMENT_LABELS[lang],
    upgradeNote,
  }
}

// ─── Transcript builder ──────────────────────────────────────────────────────

function buildTranscript(messages: IncomingMessage[]): string {
  const clean = messages.filter(
    message => message.content && !message.content.trim().startsWith('[')
  )

  return clean
    .map(message => {
      const speaker = message.role === 'assistant'
        ? 'INTERVIEWER (Barbaros)'
        : 'CANDIDATE'

      return `${speaker}: ${message.content.trim()}`
    })
    .join('\n\n')
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildReportPrompt(
  config: ReportConfig,
  assessmentCoverage: AssessmentCoverage
): string {
  const isArabic = config.language === 'ar'

  const languageRule = isArabic
    ? 'Write ALL human-readable text fields in clear, professional Modern Standard Arabic. Keep JSON keys in English exactly as specified.'
    : 'Write ALL human-readable text fields in clear, professional English. Keep JSON keys in English exactly as specified.'

  const coverageRule = isArabic
    ? `Assessment Coverage تم تحديده مسبقاً من محرك المقابلة. لا تضف محاور، لا تحذف محاور، لا تغيّر الأسماء، ولا تعيد تفسيرها. استخدم هذا الكائن كما هو:\n${JSON.stringify(assessmentCoverage, null, 2)}`
    : `Assessment Coverage has already been resolved by the interview engine. Do not add, remove, rename, or reinterpret covered areas. Use this exact object:\n${JSON.stringify(assessmentCoverage, null, 2)}`

  return `You are Barbaros, an elite AI hiring evaluator who has just finished conducting a real, live job interview. You are now writing a private, serious hiring review.

CANDIDATE CONTEXT:
- Name: ${config.candidateName}
- Role: ${config.jobTitle}
- Organization: ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience}
- Package: ${config.plan}

═══════════════════════════════
CORE RULES
═══════════════════════════════
- Every observation MUST be based on evidence from the candidate's actual answers.
- If a sentence could apply to any other candidate, it is INVALID. Rewrite it to be specific to THIS interview.
- Reference real moments and the actual content of the candidate's answers.
- Do NOT use generic HR filler: "strong candidate", "good communication", "solid understanding", "well-rounded", or "demonstrates potential".
- Be honest and realistic. If an answer was weak, explain precisely why.
- Sound like a senior interviewer making a real hiring decision, not like a supportive AI assistant.
- Do not invent experience, licensing, achievements, or qualifications that the candidate did not prove.

═══════════════════════════════
EVIDENCE ANCHORING
═══════════════════════════════
- Every evaluative field MUST be anchored to specific evidence from THIS interview.
- This applies to: verdict, barbarosAssessment, each competencies[].why,
  hiddenWeakness, behavioralPatterns, each replay[].analysis,
  each replay[].weakened, and recommendation.
- Acceptable evidence is ONE of:
  (a) a short quoted fragment from the candidate's actual answer,
  (b) a clear reference to a specific question that was asked, or
  (c) a specific behavior observed during the interview
      (e.g. avoided the question, shifted ownership, contradicted an earlier claim).
- Do NOT quote in every sentence. Heavy quoting makes the report unreadable.
  Anchor each evaluative passage to at least one concrete piece of evidence;
  the surrounding analysis can then be in your own words.
- If a sentence carries no anchor to this specific interview, it is INVALID.
  Rewrite it until it could only have been written about THIS candidate.
- Never fabricate a quote, a question, or a behavior. If the evidence does not
  exist in the transcript, do not assert the claim.
- The static product text (assessmentCoverage, upgradeNote) is exempt from this
  rule. It is intentionally identical for every candidate and must NOT be altered.

═══════════════════════════════
HUMAN CALIBRATION
═══════════════════════════════
- The candidate is a real human under interview pressure, not an AI model.
- Do NOT expect perfect, long, polished, textbook answers.
- Do NOT penalize a candidate just because an answer is short, imperfect, or not fully structured.
- Minor hesitation, natural stress, simple wording, and partial structure are normal in a live interview.
- Evaluate whether the answer gives enough real evidence for hiring judgment, not whether it sounds like an ideal AI-generated answer.
- A concise honest answer with a real example can score higher than a long polished answer with no evidence.
- STAR structure is useful, but do not require a perfect STAR response every time.
- Scores should reflect real-world interview performance, not perfection.
- A human, practical, partially structured answer can still be acceptable or strong if it contains real evidence.
- Penalize when the answer lacks evidence, avoids the question, contradicts prior claims, exaggerates ownership, or fails to show baseline role readiness.
- Do not compare the candidate to an ideal AI-generated response.

═══════════════════════════════
ASSESSMENT COVERAGE
═══════════════════════════════
${coverageRule}

The assessmentCoverage object must appear in the final JSON exactly with the same values.
The upgradeNote is intentional. Keep it professional, not pushy.

═══════════════════════════════
SCORING RULES
═══════════════════════════════
- Scores are 0–100 and must feel earned and evidence-based.
- 90+ is extremely rare.
- 75–89 means strong.
- 55–74 means acceptable.
- 35–54 means weak.
- Below 35 means poor.
- For every competency, the "why" must explain what behavior raised or lowered the score, referencing the actual interview.
- Strong scoring requires real evidence, not perfect language.
- Weak scoring requires a real problem in evidence, consistency, ownership, role readiness, or domain understanding.

═══════════════════════════════
REPLAY REVIEW RULES
═══════════════════════════════
- Select only the 3–5 MOST important questions.
- Choose the questions that reveal strength, weakness, contradiction, role fit, or readiness risk.
- Do NOT review every question.
- Never label answers "correct" or "wrong".
- Use interviewer framing.
- "stronger" must sound realistic and human, not like a perfect textbook answer.
- When suggesting a stronger answer, improve structure and evidence without making the candidate sound artificial.

═══════════════════════════════
LANGUAGE
═══════════════════════════════
${languageRule}

═══════════════════════════════
OUTPUT FORMAT
═══════════════════════════════
Respond with ONLY a single valid JSON object.
No markdown.
No backticks.
No preamble.
No text before or after.

The JSON must match this exact shape:

{
  "finalScore": <number 0-100>,
  "readinessLevel": "<one of: Strong Hire | Maybe Hire | Risky Candidate | Not Recommended>",
  "hireProbability": <number 0-100>,
  "verdict": "<2-3 sentence hiring verdict, specific to this candidate>",
  "barbarosAssessment": "<2-3 sentence first-person assessment in Barbaros's voice>",
  "assessmentCoverage": ${JSON.stringify(assessmentCoverage, null, 2)},
  "competencies": [
    { "name": "Communication", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Confidence", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Domain Expertise", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Structure", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Problem Solving", "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Clarity", "score": <0-100>, "why": "<evidence-based reason>" }
  ],
  "hiddenWeakness": "<the single most important recurring weakness, described specifically>",
  "behavioralPatterns": "<2-4 sentences on recurring behavioral patterns observed across the interview>",
  "replay": [
    {
      "question": "<the interviewer's actual question>",
      "answer": "<the candidate's actual answer, lightly trimmed>",
      "score": <0-100>,
      "analysis": "<interviewer observation about this specific answer>",
      "weakened": "<what specifically weakened this answer; empty string if the answer was strong>",
      "stronger": "<a realistic stronger response; empty string if the answer was already strong>"
    }
  ],
  "recommendation": "<2-3 sentences on what the candidate should do next>"
}

Remember: if the report feels reusable or generic, it is wrong. Make it specific to THIS candidate.`
}

// ─── JSON extraction ─────────────────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()

  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')

  if (first === -1 || last === -1 || last <= first) return null

  cleaned = cleaned.slice(first, last + 1)

  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

// ─── Core (Next-independent, reusable by Trigger worker) ─────────────────────

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

  const transcript = buildTranscript(messages)

  if (transcript.trim().length < 20) {
    throw new ReportGenerationError('Interview too short to evaluate', 400)
  }

  const normalizedCoveredAreas = normalizeCoveredAreas(rawCoveredAreas)

  const coveredAreas =
    normalizedCoveredAreas.length > 0
      ? normalizedCoveredAreas
      : [...ESSENTIAL_AXIS_ORDER]

  const assessmentCoverage = buildAssessmentCoverage(
    coveredAreas,
    config.language
  )

  const systemPrompt = buildReportPrompt(config, assessmentCoverage)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Here is the full interview transcript. Produce the JSON hiring report now.\n\n${transcript}`,
      },
    ],
  })

  const raw =
    response.content[0]?.type === 'text' ? response.content[0].text : ''

  const report = extractJson(raw)

  if (!report) {
    throw new ReportGenerationError('Could not parse report output', 502)
  }

  return {
    ...report,
    assessmentCoverage,
  }
}
