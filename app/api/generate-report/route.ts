// app/api/generate-report/route.ts
// Barbaros — AI-powered interview report generator.
// Standalone path: takes the full transcript + config, asks Claude to produce
// a structured, candidate-specific hiring evaluation as strict JSON.
//
// Does NOT touch lib/barbaros/ or engine.ts. Fully independent.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60 // allow up to 60s for the model to respond

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ─── Types (mirror the report page's expectations) ──────────────────────────

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

// ─── Transcript builder ─────────────────────────────────────────────────────

function buildTranscript(messages: IncomingMessage[]): string {
  // Skip system/silence markers like "[Candidate is silent]"
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

// ─── Prompt builder ─────────────────────────────────────────────────────────

function buildReportPrompt(config: ReportConfig): string {
  const isArabic = config.language === 'ar'

  const languageRule = isArabic
    ? 'Write ALL human-readable text fields (verdict, why, hiddenWeakness, behavioralPatterns, analysis, weakened, stronger, recommendation) in clear, professional Modern Standard Arabic. Keep JSON keys in English exactly as specified.'
    : 'Write ALL human-readable text fields in clear, professional English. Keep JSON keys in English exactly as specified.'

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

// ─── JSON extraction (defensive) ─────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  // Strip code fences if the model added them despite instructions
  let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()

  // Grab the outermost { ... } block
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

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, config } = body as {
      messages: IncomingMessage[]
      config: ReportConfig
    }

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

    const systemPrompt = buildReportPrompt(config)

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

    return new NextResponse(
      JSON.stringify({ success: true, report }),
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
