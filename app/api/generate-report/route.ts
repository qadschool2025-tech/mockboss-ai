// app/api/generate-report/route.ts
// Barbaros — AI-powered interview report generator.
// Takes the full transcript + config + coveredAreas, then asks Claude to produce
// a structured, candidate-specific hiring evaluation as strict JSON.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import {
  ESSENTIAL_AXIS_ORDER,
  type EssentialAxis,
} from '@/lib/barbaros/scoring/coverage-resolver'
import { ESSENTIAL_AXIS_LABELS } from '@/lib/barbaros/prompt/personality'

export const maxDuration = 60

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ─── Types ───────────────────────────────────────────────────────────────────

interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ReportConfig {
  candidateName: string
  jobTitle: string
  institution: string
  sector: string
  yearsExperience: string
  language: string
  plan: string
}

interface AssessmentCoverage {
  title: string
  summary: string
  coveredAreaKeys: EssentialAxis[]
  coveredAreas: string[]
  recommendedForDeeperAssessment: string[]
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

  const allowed = new Set<EssentialAxis>(ESSENTIAL_AXIS_ORDER as readonly EssentialAxis[])
  const received = new Set<EssentialAxis>()

  for (const item of value) {
    if (typeof item !== 'string') continue
    if (allowed.has(item as EssentialAxis)) {
      received.add(item as EssentialAxis)
    }
  }

  return ESSENTIAL_AXIS_ORDER.filter(axis => received.has(axis))
}

function buildAssessmentCoverage(
  coveredAreas: EssentialAxis[],
  language: string
): AssessmentCoverage {
  const lang = reportLang(language)

  const coveredLabels = coveredAreas.map(axis => ESSENTIAL_AXIS_LABELS[axis][lang])

  return {
    title: lang === 'ar' ? 'نطاق التقييم' : 'Assessment Coverage',
    summary:
      lang === 'ar'
        ? 'يقدّم التقييم الأساسي تقييماً مركّزاً عالي الإشارة للمحاور الجوهرية التي تحدّد الجاهزية المبدئية.'
        : 'This Essential Assessment delivers a focused, high-signal evaluation of the core areas that determine baseline readiness.',
    coveredAreaKeys: coveredAreas,
    coveredAreas: coveredLabels,
    recommendedForDeeperAssessment: DEEPER_ASSESSMENT_LABELS[lang],
  }
}

// ─── Transcript builder ──────────────────────────────────────────────────────

function buildTranscript(messages: IncomingMessage[]): string {
  const clean = messages.filter(
    (m) => m.content && !m.content.trim().startsWith('[')
  )

  return clean
    .map((m) => {
      const speaker = m.role === 'assistant' ? 'INTERVIEWER (Barbaros)' : 'CANDIDATE'
      return `${speaker}: ${m.content.trim()}`
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
    ? 'Write ALL human-readable text fields (verdict, why, hiddenWeakness, behavioralPatterns, analysis, weakened, stronger, recommendation) in clear, professional Modern Standard Arabic. Keep JSON keys in English exactly as specified.'
    : 'Write ALL human-readable text fields in clear, professional English. Keep JSON keys in English exactly as specified.'

  const coverageRule = isArabic
    ? `Assessment Coverage is already resolved by the interview engine. Do NOT add, remove, rename, or reinterpret covered areas. Use this exact coverage object:\n${JSON.stringify(assessmentCoverage, null, 2)}`
    : `Assessment Coverage has already been resolved by the interview engine. Do NOT add, remove, rename, or reinterpret covered areas. Use this exact coverage object:\n${JSON.stringify(assessmentCoverage, null, 2)}`

  return `You are Barbaros, an elite AI hiring evaluator who has just finished conducting a real, live job interview. You are now writing a private, serious hiring review.

CANDIDATE CONTEXT:
- Name: ${config.candidateName}
- Role: ${config.jobTitle}
- Organization: ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience}

═══════════════════════════════
CORE RULES
═══════════════════════════════
- Every observation MUST be based on evidence from the candidate's actual answers.
- If a sentence could apply to any other candidate, it is INVALID — rewrite it to be specific to THIS interview.
- Reference real moments and the actual content of the candidate's answers.
- Do NOT use generic HR filler: "strong candidate", "good communication", "solid understanding", "well-rounded", "demonstrates potential", etc. are BANNED.
- Be honest and realistic. Do not protect the candidate emotionally. If an answer was weak, explain precisely why.
- Sound like a senior interviewer making a real hiring decision — NOT like a supportive AI assistant.

═══════════════════════════════
ASSESSMENT COVERAGE
═══════════════════════════════
${coverageRule}

═══════════════════════════════
SCORING RULES
═══════════════════════════════
- Scores are 0–100 and must feel earned and evidence-based.
- 90+ is extremely rare. 75–89 = strong. 55–74 = acceptable. 35–54 = weak. Below 35 = poor.
- For every competency, the "why" must explain what behavior raised or lowered the score, referencing the actual interview.

═══════════════════════════════
REPLAY REVIEW RULES
═══════════════════════════════
- Select only the 3–5 MOST important questions (strongest, weakest, or most revealing). Do NOT review every question.
- For each, never label answers "correct" or "wrong". Use interviewer framing.
- "stronger" must sound realistic and human — better structure/depth/clarity, NOT a perfect textbook answer.

═══════════════════════════════
LANGUAGE
═══════════════════════════════
${languageRule}

═══════════════════════════════
OUTPUT FORMAT — CRITICAL
═══════════════════════════════
Respond with ONLY a single valid JSON object. No markdown, no backticks, no preamble, no text before or after.

The JSON must match this exact shape:

{
  "finalScore": <number 0-100>,
  "readinessLevel": "<one of: Strong Hire | Maybe Hire | Risky Candidate | Not Recommended>",
  "hireProbability": <number 0-100>,
  "verdict": "<2-3 sentence hiring verdict, specific to this candidate, the kind of sentence worth repeating>",
  "barbarosAssessment": "<2-3 sentence first-person assessment in Barbaros's voice>",
  "assessmentCoverage": ${JSON.stringify(assessmentCoverage, null, 2)},
  "competencies": [
    { "name": "Communication",     "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Confidence",        "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Domain Expertise",  "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Structure",         "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Problem Solving",   "score": <0-100>, "why": "<evidence-based reason>" },
    { "name": "Clarity",           "score": <0-100>, "why": "<evidence-based reason>" }
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

Remember: if the report feels reusable or generic, it is wrong. Make it psychologically specific to THIS candidate.`
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

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, config } = body as {
      messages: IncomingMessage[]
      config: ReportConfig
      coveredAreas?: EssentialAxis[]
    }

    const rawCoveredAreas =
      (body as { coveredAreas?: unknown }).coveredAreas ??
      (config as ReportConfig & { coveredAreas?: unknown }).coveredAreas

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No interview messages provided' },
        { status: 400 }
      )
    }

    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Missing config' },
        { status: 400 }
      )
    }

    const transcript = buildTranscript(messages)

    if (transcript.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: 'Interview too short to evaluate' },
        { status: 400 }
      )
    }

    const coveredAreas = normalizeCoveredAreas(rawCoveredAreas)
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
      return NextResponse.json(
        { success: false, error: 'Could not parse report output' },
        { status: 502 }
      )
    }

    const reportWithCoverage = {
      ...report,
      assessmentCoverage,
    }

    return new NextResponse(
      JSON.stringify({ success: true, report: reportWithCoverage }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate-report] error:', message)

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
