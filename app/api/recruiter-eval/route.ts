import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const {
      config, overallScore, criteria,
      strongestAnswer, weakestAnswer,
      hiringRisks, repeatedMistakes
    } = await req.json()

    const isArabic = config.language === 'ar'
    const lang = isArabic ? 'Arabic' : 'English'

    // ── Recruiter Evaluation ─────────────────────────────────────────────────
    const evalPrompt = `You are a senior HR director writing a confidential internal recruiter note after a job interview.

CANDIDATE:
- Name: ${config.candidateName}
- Applying for: ${config.jobTitle} at ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience || config.experienceLevel || 'Not specified'}
- Country: ${config.country || 'Not specified'}

INTERVIEW PERFORMANCE:
- Overall Score: ${overallScore}/100
- Clarity: ${criteria.clarity}/100
- Confidence: ${criteria.confidence}/100
- Relevance: ${criteria.relevance}/100
- Technical Depth: ${criteria.technical_depth}/100
- Structure: ${criteria.structure}/100
- Communication: ${criteria.communication}/100
- Problem Solving: ${criteria.problem_solving}/100
- Leadership: ${criteria.leadership}/100

STRONGEST MOMENT (score: ${strongestAnswer.score}/100):
Q: "${(strongestAnswer.question || '').slice(0, 120)}"
A: "${(strongestAnswer.answer || '').slice(0, 180)}"

WEAKEST MOMENT (score: ${weakestAnswer.score}/100):
Q: "${(weakestAnswer.question || '').slice(0, 120)}"
A: "${(weakestAnswer.answer || '').slice(0, 180)}"

IDENTIFIED RISKS: ${hiringRisks.join(' | ')}
REPEATED PATTERNS: ${repeatedMistakes.length ? repeatedMistakes.join(', ') : 'None detected'}

TASK: Write exactly 3 sentences as a confidential recruiter evaluation note.
- Sentence 1: This candidate's overall presentation and most notable quality shown in THIS interview — be specific to their role and sector.
- Sentence 2: The one weakness that most concerned you — reference actual scores.
- Sentence 3: Clear hiring recommendation with one specific condition or next step.

RULES:
- Use the candidate's first name, never "the candidate"
- Reference their actual job title and sector
- Use specific numbers from scores when relevant
- Be direct — this is a private internal note
- Write in ${lang}
- Output 3 sentences only — no quotes, no labels, no extra text`

    // ── Improvement Plan ─────────────────────────────────────────────────────
    const weakCriteria = Object.entries(criteria)
      .filter(([, v]) => (v as number) < 60)
      .map(([k, v]) => `${k}: ${v}/100`)
      .join(', ')

    const planPrompt = `You are a professional interview coach. Write a personalized improvement plan for this candidate.

CANDIDATE:
- Name: ${config.candidateName}
- Job Title: ${config.jobTitle}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience || config.experienceLevel || 'Not specified'}

WEAK AREAS (below 60): ${weakCriteria || 'None — all areas above 60'}
OVERALL SCORE: ${overallScore}/100
REPEATED PATTERNS: ${repeatedMistakes.length ? repeatedMistakes.join(', ') : 'None'}

TASK: Write exactly 4 to 6 improvement tips. Each tip must be:
- Specific to THIS candidate's job title and sector
- Actionable — something they can do this week
- Not generic — a ${config.jobTitle} in ${config.sector} tip, not a generic interview tip

EXAMPLES OF WHAT NOT TO WRITE:
- "Practice the STAR method" ← too generic
- "Record yourself" ← too generic

EXAMPLES OF WHAT TO WRITE (for a Teacher):
- "Prepare 2 real classroom scenarios showing how you handled a struggling student — include what you tried, what failed, and what worked"
- "Practice explaining your assessment strategy in under 60 seconds using a real example from your last class"

RULES:
- Write in ${lang}
- Output numbered list only: 1. tip 2. tip etc.
- No intro, no conclusion, no labels
- Each tip maximum 2 sentences`

    const [evalResponse, planResponse] = await Promise.all([
      client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 220,
        messages: [{ role: 'user', content: evalPrompt }]
      }),
      client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: planPrompt }]
      })
    ])

    const evaluation = evalResponse.content[0].type === 'text'
      ? evalResponse.content[0].text.trim()
      : ''

    const rawPlan = planResponse.content[0].type === 'text'
      ? planResponse.content[0].text.trim()
      : ''

    const improvementPlan = rawPlan
      .split('\n')
      .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(line => line.length > 10)

    return NextResponse.json({ success: true, evaluation, improvementPlan })

  } catch (error: any) {
    console.error('Recruiter eval error:', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
