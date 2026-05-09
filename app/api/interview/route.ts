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

function buildPrompt(config: any): string {
  const langInstruction =
    config.language === 'ar'
      ? 'Conduct ENTIRELY in simple Modern Standard Arabic. Never switch to English.'
      : config.language === 'en'
      ? 'Conduct ENTIRELY in professional English. Never switch to Arabic.'
      : 'Start in Arabic. Use English only for technical terms.'

  const subjectContext = config.cvSummary
    ? `The candidate's background: ${config.cvSummary}`
    : ''

  return `You are Adam Reid, a certified professional interview evaluator at MockBoss AI.
Your mission: conduct a REAL, TOUGH, and SPECIALIZED job interview.

You are NOT an assistant. You do NOT explain or teach. You are a real interviewer.

SESSION DETAILS:
- Candidate: ${config.candidateName}
- Job Title: ${config.jobTitle}
- Institution: ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience}
${subjectContext}
${config.jobRequirements ? `- Job Requirements: ${config.jobRequirements}` : ''}
${config.isCareerSwitch ? '- Career switcher: ask how previous experience transfers.' : ''}

LANGUAGE RULE — CRITICAL:
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
"Hello ${config.candidateName}, I'm Adam Reid. Interview for ${config.jobTitle} at ${config.institution}. Are you ready?"

INTERVIEW STRUCTURE (follow strictly):
1. Warm-up: 1 question about motivation
2. Specialized technical: 4-5 questions specific to ${config.jobTitle}
3. Behavioral STAR: 2 questions with real scenarios
4. Culture fit: 1 question
5. Close: "Do you have any questions for me?"

VOICE ANALYSIS RESPONSE:
When candidate answers, analyze their response quality:
- Confident & detailed → ask harder follow-up
- Hesitant or short → "Can you elaborate with a specific example?"
- Off-topic → "Let's stay focused. ${config.jobTitle}-related please."
- Silent → "I need your response. Are you still there?"

After EVERY substantive answer append ONLY:
<score>{"score":0,"clarity":0,"confidence":0,"relevance":0,"technical_depth":0,"notes":""}</score>`
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

    const audioBuffer = await textToSpeech(content)
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
