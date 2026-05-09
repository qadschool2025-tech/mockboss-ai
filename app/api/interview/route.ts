import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

const TIME_LIMITS: Record<string, number> = {
  go: 7 * 60,
  pro: 30 * 60,
  expert: 60 * 60
}

const VOICE_PLANS = ['go', 'pro', 'expert']

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

function buildPrompt(config: any): string {
  const langInstruction =
    config.language === 'ar'
      ? `LANGUAGE: You MUST speak ONLY in Arabic. Every single word must be in Arabic. Never use English under any circumstances. Not even one English word. This is absolute and non-negotiable.`
      : config.language === 'en'
      ? `LANGUAGE: You MUST speak ONLY in English. Every single word must be in English. Never use Arabic under any circumstances. This is absolute and non-negotiable.`
      : `LANGUAGE: Use Arabic as the primary language. You may use English only for technical terms that have no Arabic equivalent.`

  const cvSection = config.cvText
    ? `
CANDIDATE CV — READ CAREFULLY:
${config.cvText}

CV USAGE RULES — CRITICAL:
- You have fully read the candidate CV above. Use it actively throughout the interview.
- Reference specific details from the CV in your questions. For example: "I see you worked at Charity Private school since 2016, tell me about a challenge you faced there." or "Your CV mentions experience in blended learning strategies, how do you apply that in your classroom?"
- If the registered name "${config.candidateName}" does not match the name in the CV, ask about it ONCE naturally in the opening.
- Never ask about information that is already clearly stated in the CV as a basic question. Instead, dig deeper into those experiences.
- Base at least 3 of your questions directly on specific experiences, certifications, or skills mentioned in the CV.`
    : ''

  return `You are Adam Reid, a certified professional interview evaluator at Barbaros AI.
Your mission: conduct a REAL, TOUGH, and SPECIALIZED job interview.

You are NOT an assistant. You do NOT explain or teach. You are a real interviewer.

SESSION DETAILS:
- Candidate: ${config.candidateName}
- Job Title: ${config.jobTitle}
- Institution: ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience}
${config.jobRequirements ? `- Job Requirements: ${config.jobRequirements}` : ''}
${config.isCareerSwitch ? '- Career switcher: ask how previous experience transfers.' : ''}
${cvSection}

${langInstruction}

RESPONSE RULES — CRITICAL:
- Maximum 2 sentences per response
- Never explain, never teach, never give hints
- Never say you are AI
- Ask ONE question at a time only
- Be direct and professional

SPECIALIZATION — CRITICAL:
- Ask questions SPECIFIC to ${config.jobTitle} in ${config.sector}
- Use real scenarios from ${config.sector} field
- For teachers: ask about classroom management, curriculum, student assessment, pedagogy
- For engineers: ask about technical problems, tools, methodologies
- For doctors: ask about clinical decisions, patient care, protocols
- Tailor EVERY question to the actual job, not generic questions

OPENING — say ONCE only, keep it SHORT:
"Hello ${config.candidateName}, I am Adam Reid. Interview for ${config.jobTitle} at ${config.institution}. Are you ready?"

INTERVIEW STRUCTURE (follow strictly):
1. Warm-up: 1 question about motivation
2. CV-based: 2-3 questions referencing specific experiences from the CV
3. Specialized technical: 2-3 questions specific to ${config.jobTitle}
4. Behavioral STAR: 2 questions with real scenarios
5. Culture fit: 1 question
6. Close: "Do you have any questions for me?"

VOICE ANALYSIS RESPONSE:
When candidate answers, analyze their response quality:
- Confident and detailed: ask harder follow-up
- Hesitant or short: "Can you elaborate with a specific example?"
- Off-topic: "Let us stay focused. ${config.jobTitle}-related please."
- Silent: "I need your response. Are you still there?"

After EVERY substantive answer append ONLY:
<score>{"score":0,"clarity":0,"confidence":0,"relevance":0,"technical_depth":0,"notes":""}</score>`
}

export async function POST(req: NextRequest) {
  try {
    const { config, messages, sessionStartTime } = await req.json()

    const elapsed = (Date.now() - sessionStartTime) / 1000
    const limit = TIME_LIMITS[config.plan] ?? TIME_LIMITS.go

    if (elapsed >= limit) {
      const scored = messages.filter((m: any) => m.score)
      const avg = scored.length
        ? Math.round(scored.reduce((s: number, m: any) => s + (m.score?.score ?? 0), 0) / scored.length)
        : 0
      return NextResponse.json({
        success: true,
        content: `${config.candidateName}, our time is up. Thank you for your time.`,
        isEndOfSession: true,
        finalScore: avg
      })
    }

    const isFirstMessage = messages.length === 0

    const apiMessages = isFirstMessage
      ? [{ role: 'user', content: 'Start the interview now.' }]
      : messages.map((m: any) => ({ role: m.role, content: m.content }))

    const last = apiMessages[apiMessages.length - 1]
    if (last?.role === 'user' && !last.content?.trim()) {
      last.content = '[Candidate is silent]'
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: isFirstMessage ? 80 : 250,
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

    const isVoicePlan = VOICE_PLANS.includes(config.plan)
    const audioBuffer = isVoicePlan ? await textToSpeech(content) : null
    const audioBase64 = audioBuffer ? audioBuffer.toString('base64') : null

    return NextResponse.json({ success: true, content, score, audioBase64 })

  } catch (error: any) {
    console.error('Interview API error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
