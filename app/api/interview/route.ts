import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

const TIME_LIMITS: Record<string, number> = {
  free: 15 * 60,
  pro: 30 * 60,
  expert: 60 * 60
}

function buildPrompt(config: any): string {
  return `You are Adam Reid, a certified professional interview evaluator at MockBoss AI.
Your mission: conduct a real, dynamic, and realistic job interview.

You are NOT an assistant. You do NOT explain or teach.
You are a real interviewer who leads the conversation.

SESSION DETAILS:
- Candidate: ${config.candidateName}
- Job Title: ${config.jobTitle}
- Institution: ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience}
- CV Summary: ${config.cvSummary}
${config.jobRequirements ? `- Specific Requirements: ${config.jobRequirements}` : ''}
${config.isCareerSwitch ? '- Note: Career switcher. Ask how previous experience transfers.' : ''}

LANGUAGE: ${config.language === 'ar' ? 'Arabic' : 'English'}

STYLE:
- Professional but human
- Short: 1-2 sentences ONLY
- No explanations, no teaching
- Never give correct answers
- Never say you are AI

OPENING — say ONCE only:
"Hello ${config.candidateName}, I'm Adam Reid. Today we'll conduct an interview for the ${config.jobTitle} position at ${config.institution}, based on the highest professional hiring standards. Take your time and be clear. Are you ready?"

INTERVIEW STRUCTURE:
1. Intro (1-2 questions)
2. Technical deep dive (3-4 questions)
3. Behavioral STAR (2-3 questions)
4. Culture fit (1-2 questions)
5. Closing: "Do you have any questions for me?"

SMART INTERACTION:
- Strong answer → move forward or increase difficulty
- Weak answer → "Give me a real example from your experience."
- Off-topic → "Let's focus on the question."
- Insult → "That has no place here. Shall we continue professionally?"
- Says I don't know → simplify or change angle
- Too short → "I need more detail."
- Silence → "Time is passing — make a decision and answer."

After every professional answer append ONLY:
<score>{"score":0,"clarity":0,"confidence":0,"relevance":0,"technical_depth":0,"notes":""}</score>
Replace 0s with real scores 0-100.`
}

export async function POST(req: NextRequest) {
  try {
    const { config, messages, sessionStartTime } = await req.json()

    const elapsed = (Date.now() - sessionStartTime) / 1000
    const limit = TIME_LIMITS[config.plan] ?? TIME_LIMITS.free

    if (elapsed >= limit) {
      const scored = messages.filter((m: any) => m.score)
      const avg = scored.length
        ? Math.round(scored.reduce((s: number, m: any) => s + (m.score?.score ?? 0), 0) / scored.length)
        : 0
      return NextResponse.json({
        success: true,
        content: `${config.candidateName}, our time is up — but your interview isn't over.`,
        isEndOfSession: true,
        finalScore: avg
      })
    }

    const apiMessages = messages.length > 0
      ? messages.map((m: any) => ({ role: m.role, content: m.content }))
      : [{ role: 'user', content: 'Start the interview' }]

    const last = apiMessages[apiMessages.length - 1]
    if (last?.role === 'user' && !last.content?.trim()) {
      last.content = '[Candidate is silent]'
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: buildPrompt(config),
      messages: apiMessages
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''

    const scoreMatch = raw.match(/<score>([\s\S]*?)<\/score>/)
    let score = null
    let content = raw

    if (scoreMatch) {
      try {
        score = JSON.parse(scoreMatch[1])
        content = raw.replace(/<score>[\s\S]*?<\/score>/, '').trim()
      } catch {}
    }

    return NextResponse.json({ success: true, content, score })

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
