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

const AR_READINESS_LEVELS: Record<string, string> = {
  'Strong Hire': 'جاهز بقوة',
  'Maybe Hire': 'قابل للتوصية بحذر',
  'Risky Candidate': 'مخاطرة عالية',
  'Not Recommended': 'غير جاهز حالياً',
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
      ? `ضمن هذه الباقة، تم تقييم المحاور الأساسية التالية فقط: ${joinAr(coveredLabels)}. أمّا المحاور المتقدمة الظاهرة أدناه فلم يتم قياسها ضمن هذه الجلسة، وهي متاحة بتفصيل أعمق في الباقات الأعلى. مهنياً، هذا لا يعني أن تقريرك ناقص؛ بل يعني أن هذه الباقة تقيس جاهزيتك الأساسية للمقابلة، بينما تكشف الباقات الأعلى صورة أوسع عن أدائك، وحكمك القيادي، وتفكيرك الاستراتيجي، وقدرتك على الثبات تحت ضغط أقرب للمقابلات الحقيقية.`
      : `In this package, only the following core areas were assessed: ${joinEn(coveredLabels)}. The advanced areas listed below were not measured in this session; they are available in greater depth in higher-tier plans. Professionally, this does not mean your report is incomplete; it means this package measures your baseline interview readiness, while higher-tier plans reveal a fuller picture of your performance, leadership judgment, strategic thinking, and ability to perform under realistic interview pressure.`

  return {
    title: lang === 'ar' ? 'نطاق التقييم في هذه الباقة' : 'Assessment scope for this package',
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

// ─── Transcript builder ──────────────────────────────────────────────────────

function buildTranscript(messages: IncomingMessage[]): string {
  const clean = messages.filter(
    message => message.content && !message.content.trim().startsWith('[')
  )

  return clean
    .map(message => {
      const speaker =
        message.role === 'assistant'
          ? 'INTERVIEWER (Barbaros)'
          : 'CANDIDATE'

      return `${speaker}: ${message.content.trim()}`
    })
    .join('\n\n')
}

// ─── Report output localization guard ────────────────────────────────────────

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
      if (!item || typeof item !== 'object') return item

      const competency = item as Record<string, unknown>

      if (typeof competency.name !== 'string') {
        return competency
      }

      return {
        ...competency,
        name: AR_COMPETENCY_NAMES[competency.name] ?? competency.name,
      }
    })
  }

  return localized
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

  const audienceRule = isArabic
    ? `هذا التقرير يُعرض مباشرة للمرشح، وليس لصاحب العمل. اكتب بصيغة تخاطب المرشح مباشرة: "أداؤك"، "إجابتك"، "تحتاج إلى"، "قبل مقابلتك القادمة". لا تستخدم "المرشح" أو "المرشحة" كصياغة أساسية داخل verdict أو hiddenWeakness أو behavioralPatterns أو recommendation. كن صارماً وواضحاً، لكن اجعل التقرير موجهاً لصاحب الأداء نفسه.`
    : `This report is shown directly to the candidate, not to the employer. Write in a candidate-facing voice: "your answer", "your performance", "you need to", "before your next interview". Do not mainly write "the candidate" in verdict, hiddenWeakness, behavioralPatterns, or recommendation. Stay direct and rigorous, but address the person who took the interview.`

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

  return `You are Barbaros, an elite AI hiring evaluator who has just finished conducting a real, live job interview. You are now writing a private, serious candidate-facing interview performance report.

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
- Sound like a senior interviewer giving a direct private debrief after a real interview, not like a supportive AI assistant.
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
AUDIENCE & VOICE
═══════════════════════════════
${audienceRule}

═══════════════════════════════
ASSESSMENT COVERAGE
═══════════════════════════════
${coverageRule}

The assessmentCoverage object must appear in the final JSON exactly with the same values.
The upgradeNote is intentional. Keep it professional, clear, and not pushy.
Make it clear that the advanced areas listed in recommendedForDeeperAssessment were NOT measured in this package.

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
  "readinessLevel": "<one of: ${readinessLevelOptions}>",
  "hireProbability": <number 0-100>,
  "verdict": "<2-3 sentence candidate-facing verdict, specific to this interview>",
  "barbarosAssessment": "<2-3 sentence first-person assessment in Barbaros's voice>",
  "assessmentCoverage": ${JSON.stringify(assessmentCoverage, null, 2)},
  "competencies": ${competencyOutput},
  "hiddenWeakness": "<the single most important recurring weakness, written directly to the candidate>",
  "behavioralPatterns": "<2-4 sentences on recurring behavioral patterns observed across the interview, written directly to the candidate>",
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
  "recommendation": "<2-3 direct sentences on what the candidate should do next>"
}

Remember: if the report feels reusable or generic, it is wrong. Make it specific to THIS candidate.`
}

// ─── JSON extraction (4-step ladder) ─────────────────────────────────────────
// Step 1: direct JSON.parse.
// Step 2: extract a fenced ```json block.
// Step 3: string-aware balanced-brace scan for the first complete object
//         (a blind first-{ / last-} slice breaks on braces inside strings).
// Step 4: cleanup pass (smart quotes, trailing commas) and re-parse.

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function extractFencedBlock(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match ? match[1].trim() : null
}

// Scans from the first '{' tracking string state and escape characters.
// Returns the first COMPLETE object, or null if the object never closes —
// which is exactly what truncated output looks like.
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
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

function cleanupJsonText(text: string): string {
  return text
    .replace(/[\u201C\u201D]/g, '"')   // smart double quotes
    .replace(/[\u2018\u2019]/g, "'")   // smart single quotes
    .replace(/,\s*([}\]])/g, '$1')     // trailing commas
    .trim()
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()

  // Step 1: direct parse
  let result = tryParseObject(trimmed)
  if (result) return result

  // Step 2: fenced block
  const fenced = extractFencedBlock(trimmed)
  if (fenced) {
    result = tryParseObject(fenced) ?? tryParseObject(cleanupJsonText(fenced))
    if (result) return result
  }

  // Step 3: balanced-brace scan (on fence-stripped text)
  const stripped = trimmed.replace(/```json/gi, '').replace(/```/g, '')
  const balanced = extractBalancedObject(stripped)
  if (balanced) {
    result = tryParseObject(balanced) ?? tryParseObject(cleanupJsonText(balanced))
    if (result) return result
  }

  // Step 4: cleanup on the whole text, then one more balanced scan
  const cleaned = cleanupJsonText(stripped)
  result = tryParseObject(cleaned)
  if (result) return result

  const cleanedBalanced = extractBalancedObject(cleaned)
  if (cleanedBalanced) {
    result = tryParseObject(cleanedBalanced)
    if (result) return result
  }

  return null
}

// ─── Validation ──────────────────────────────────────────────────────────────
// A report missing a core field must NEVER be persisted as report_data.
// assessmentCoverage is excluded: it is engine-resolved and force-attached
// after generation, so the model copy is not the source of truth.

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isScoreNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateReportData(report: Record<string, unknown>): string[] {
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

  if (!Array.isArray(report.replay) || report.replay.length === 0) {
    problems.push('replay')
  }

  return problems
}

// ─── Safe logging ────────────────────────────────────────────────────────────
// NEVER persist raw model output to Supabase. Trigger/Vercel logs only,
// and only length + small head/tail slices.

function logRawSafely(stage: string, raw: string): void {
  const head = raw.slice(0, 120)
  const tail = raw.length > 240 ? raw.slice(-120) : ''
  console.error(
    `[report] ${stage}: raw.length=${raw.length}` +
    ` head=${JSON.stringify(head)}` +
    (tail ? ` tail=${JSON.stringify(tail)}` : '')
  )
}

// ─── Repair pass ─────────────────────────────────────────────────────────────
// Internal second chance for COMPLETE but badly formatted output only.
// NEVER called for truncated output (stop_reason === 'max_tokens'): repairing
// a truncated report means the model INVENTS the missing tail, which is
// fabricated evaluative content and violates evidence anchoring.

const REPAIR_SYSTEM_PROMPT = `You are a strict JSON repair tool.
The user message contains the output of another model that was supposed to be a single valid JSON object but has formatting problems (extra text, markdown fences, bad quotes, trailing commas, unescaped characters).

Your ONLY job:
- Output the SAME object as a single valid JSON object.
- Fix syntax only: quoting, escaping, commas, brackets, surrounding noise.
- Preserve every key and every value EXACTLY. Do not add, remove, translate, shorten, or rewrite ANY content.
- Output ONLY the JSON object. No markdown. No backticks. No explanation.`

async function repairJson(
  raw: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: REPORT_MAX_TOKENS,
      system: REPAIR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: raw }],
    })

    if (response.stop_reason === 'max_tokens') {
      logRawSafely('repair_output_truncated', raw)
      return null
    }

    const repairedRaw =
      response.content[0]?.type === 'text' ? response.content[0].text : ''

    return extractJson(repairedRaw)
  } catch (err) {
    console.error(
      '[report] repair pass failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }
}

// ─── Core (Next-independent, reusable by Trigger worker) ─────────────────────

// claude-sonnet-4-5 supports far larger outputs; 16000 gives an Arabic report
// with a full replay section real headroom, especially for Arabic reports.
// Raising the cap costs nothing unless the tokens are actually generated.
const REPORT_MAX_TOKENS = 16000

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
    max_tokens: REPORT_MAX_TOKENS,
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

  // Truncated output is NEVER repaired — it is regenerated (worker retry).
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

  const missingFields = validateReportData(report)

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
