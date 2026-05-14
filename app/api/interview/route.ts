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

async function textToSpeech(text: string): Promise<Buffer | null> {
  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID
    const apiKey = process.env.ELEVENLABS_API_KEY

    if (!voiceId || !apiKey) {
      console.error('ElevenLabs: MISSING env vars - voiceId:', !!voiceId, 'apiKey:', !!apiKey)
      return null
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true
          }
        })
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('ElevenLabs FAILED:', response.status, errText)
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    console.log('ElevenLabs: SUCCESS - bytes:', buffer.length)
    return buffer

  } catch (err) {
    console.error('ElevenLabs EXCEPTION:', err)
    return null
  }
}

function buildPrompt(config: any, elapsedSeconds: number, timeLimit: number): string {
  const langInstruction =
    config.language === 'ar'
      ? 'Conduct ENTIRELY in simple Modern Standard Arabic. Never switch to English.'
      : config.language === 'en'
      ? 'Conduct ENTIRELY in professional English. Never switch to Arabic.'
      : 'Start in Arabic. Use English only for technical terms.'

  const remaining = timeLimit - elapsedSeconds
  const remainingMinutes = Math.floor(remaining / 60)

  const cvContext = config.cvSummary
    ? `CV SUMMARY (use this to ask tailored questions):
${config.cvSummary}

CRITICAL — CV-BASED QUESTIONING:
- Reference specific roles, projects, or achievements from the CV
- Detect any employment gaps and ask about them professionally
- Ask about AI adoption in their field if relevant
- Ask about career progression and reasons for transitions`
    : `NO CV PROVIDED — build profile through questions:
- Ask about educational background and certifications
- Ask about years of experience and specific roles held
- Ask about any employment gaps and reasons
- Ask about relevant courses and skills acquired
- Ask about notable projects or achievements`

  const timingInstruction = remaining <= 90
    ? `FINAL MINUTE — CRITICAL:
- You have less than 90 seconds remaining.
- Ask ONE final question if not done, or wrap up gracefully.
- Thank the candidate warmly by name.
- Tell them their report is being generated.
- Mention that upgrading to a higher plan would give them more time and deeper feedback.
- End with: "Your Barbaros Report is ready. Best of luck, ${config.candidateName}."
- Keep it under 3 sentences total.`
    : remaining <= 180
    ? `APPROACHING END (${remainingMinutes} min left):
- Begin wrapping up. Ask final 1-2 questions only.
- Do not start new topics.`
    : `TIME REMAINING: ${remainingMinutes} minutes.
- Fill the session fully. Do not end early.
- If candidate is slow to answer, remind them: "Time is passing — please give your response."
- Aim for 6–8 strong, specialized questions total across the session.`

  return `You are Barbaros, a certified professional interview evaluator at MockBoss AI.
Your mission: conduct a REAL, TOUGH, and SPECIALIZED job interview.

You are NOT an assistant. You do NOT explain or teach. You are a real interviewer.
Never reveal you are AI. Never say "Adam" — your name is Barbaros.

SESSION DETAILS:
- Candidate: ${config.candidateName}
- Job Title: ${config.jobTitle}
- Institution: ${config.institution}
- Sector: ${config.sector || 'General'}
- Experience: ${config.yearsExperience || 'Not specified'}
${config.jobRequirements ? `- Job Requirements: ${config.jobRequirements}` : ''}
${config.isCareerSwitch ? '- Career switcher: ask how previous experience transfers.' : ''}

${cvContext}

LANGUAGE RULE — CRITICAL:
${langInstruction}

RESPONSE RULES — CRITICAL:
- Maximum 2 sentences per response
- Never explain, never teach, never give hints
- Ask ONE question at a time only
- Be direct and professional
- If candidate is silent or gives empty response: "Time is passing — I need your response, ${config.candidateName}."

SPECIALIZATION — CRITICAL:
- Ask questions SPECIFIC to ${config.jobTitle} in ${config.sector || 'their field'}
- Use real scenarios from the field
- For teachers: classroom management, curriculum design, differentiated instruction, student assessment, handling difficult students
- For engineers: technical problems, system design, debugging approaches, tools and methodologies
- For doctors: clinical decisions, patient care, diagnostic reasoning, protocols
- Tailor EVERY question to the actual job — no generic questions

INTERVIEW STRUCTURE (follow strictly):
1. Warm-up: 1 question about motivation or background
2. Specialized technical: 3–4 questions specific to the role
3. Behavioral STAR: 2 questions with real scenarios
4. CV/background deep-dive: 1–2 questions based on their experience
5. Culture fit: 1 question
6. Close: "Do you have any questions for me?" — then wrap up

OPENING — say ONCE only, keep it SHORT:
"Hello ${config.candidateName}, I'm Barbaros. This is your interview for ${config.jobTitle} at ${config.institution}. Are you ready?"

SCORING — after EVERY substantive candidate answer, append ONLY:
<score>{"score":0,"clarity":0,"confidence":0,"relevance":0,"technical_depth":0,"notes":"","question":"","answer_summary":""}</score>

Fill ALL fields:
- score: 0–100 overall
- clarity: 0–100
- confidence: 0–100  
- relevance: 0–100
- technical_depth: 0–100
- notes: specific weakness or strength (1 sentence)
- question: the exact question you just asked
- answer_summary: 1-sentence summary of candidate's answer

${timingInstruction}`
}

export async function POST(req: NextRequest) {
  try {
    const { config, messages, sessionStartTime } = await req.json()

    const elapsed = (Date.now() - sessionStartTime) / 1000
    const limit = TIME_LIMITS[config.plan] ?? TIME_LIMITS.free

    // Hard stop at time limit
    if (elapsed >= limit) {
      const scored = messages.filter((m: any) => m.score)
      const avg = scored.length
        ? Math.round(scored.reduce((s: number, m: any) => s + (m.score?.score ?? 0), 0) / scored.length)
        : 0

      // Build full report data
      const reportData = {
        candidateName: config.candidateName,
        jobTitle: config.jobTitle,
        institution: config.institution,
        finalScore: avg,
        scores: scored.map((m: any) => m.score),
        messages: messages
      }

      return NextResponse.json({
        success: true,
        content: `${config.candidateName}, our time is up. Thank you — your Barbaros Report is being prepared now.`,
        isEndOfSession: true,
        finalScore: avg,
        reportData
      })
    }

    const isFirstMessage = messages.length === 0

    const apiMessages = isFirstMessage
      ? [{ role: 'user', content: 'Start the interview now.' }]
      : messages.map((m: any) => ({ role: m.role, content: m.content }))

    const last = apiMessages[apiMessages.length - 1]
    if (last?.role === 'user' && !last.content?.trim()) {
      last.content = '[Candidate is silent — no response given]'
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: isFirstMessage ? 80 : 300,
      system: buildPrompt(config, elapsed, limit),
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

    // Check if Barbaros decided to end the session in his response
    const isEndSignal =
      content.toLowerCase().includes('barbaros report is ready') ||
      content.toLowerCase().includes('best of luck') ||
      (elapsed >= limit - 30)

    const audioBuffer = await textToSpeech(content)
    const audioBase64 = audioBuffer ? audioBuffer.toString('base64') : null

    // Build report data if ending
    let reportData = null
    if (isEndSignal) {
      const scored = [...messages.filter((m: any) => m.score), ...(score ? [{ score }] : [])]
      const avg = scored.length
        ? Math.round(scored.reduce((s: number, m: any) => s + (m.score?.score ?? 0), 0) / scored.length)
        : 0
      reportData = {
        candidateName: config.candidateName,
        jobTitle: config.jobTitle,
        institution: config.institution,
        finalScore: avg,
        scores: scored.map((m: any) => m.score),
        messages: [...messages, { role: 'assistant', content, score }]
      }
    }

    return NextResponse.json({
      success: true,
      content,
      score,
      audioBase64,
      isEndOfSession: isEndSignal,
      reportData
    })

  } catch (error: any) {
    console.error('Interview API error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
