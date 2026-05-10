import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

const TIME_LIMITS: Record<string, number> = {
  go: 15 * 60,
  pro: 30 * 60,
  expert: 60 * 60
}

const UPGRADE_HINTS: Record<string, string> = {
  go: "We're just getting started — in a full session, this line of questioning alone could reveal a lot more.",
  pro: "In an Expert session, we'd have time to stress-test every answer you just gave.",
}

async function textToSpeech(text: string): Promise<Buffer | null> {
  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID
    const apiKey = process.env.ELEVENLABS_API_KEY

    if (!voiceId || !apiKey) {
      console.error('ElevenLabs: MISSING env vars')
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
            stability: 0.4,
            similarity_boost: 0.85,
            style: 0.6,
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
      ? `LANGUAGE RULE — ABSOLUTE:
You MUST respond ONLY in Arabic. Every single word must be in Arabic.
Never use English under any circumstances — not even one word.
This rule overrides everything else. No exceptions.`
      : config.language === 'en'
      ? `LANGUAGE RULE — ABSOLUTE:
You MUST respond ONLY in English. Every single word must be in English.
Never use Arabic under any circumstances — not even one word.
This rule overrides everything else. No exceptions.`
      : `LANGUAGE RULE:
Use Arabic as the primary language.
Use English ONLY for technical terms with no Arabic equivalent.`

  const cvSection = config.cvText && !config.cvText.startsWith('[NO_CV]')
    ? `
CANDIDATE CV — READ AND ANALYZE CAREFULLY:
${config.cvText}

CV ANALYSIS RULES — CRITICAL:
1. Read the CV thoroughly before asking any question.
2. Compare the CV name with registered name "${config.candidateName}". If different, ask about it naturally in the opening.
3. Compare the CV job title with registered job "${config.jobTitle}". If different, ask why they are switching or what changed.
4. Identify any employment gaps in the CV timeline and ask about them professionally.
5. Reference specific details: schools, companies, dates, certifications, projects.
6. Never ask basic questions about information already in the CV — dig deeper instead.
7. At least 3 questions must come directly from specific CV content.
8. If CV shows career switch, ask how previous experience adds value to this role.`
    : `
NO CV PROVIDED:
The candidate did not provide a CV. At the opening, mention this professionally:
"I notice you have not provided a CV. A strong CV would have allowed me to tailor this interview more precisely. Let us proceed with what we have."
Then conduct a general interview based on job title, sector, and experience level only.`

  const upgradeHint = UPGRADE_HINTS[config.plan]
    ? `
UPGRADE AWARENESS — SUBTLE:
When time is running low (last 2 minutes), naturally weave in ONE subtle comment like:
"${UPGRADE_HINTS[config.plan]}"
Say it as a professional observation, never as a sales pitch.`
    : ''

  return `You are Adam Reid, a senior certified interview evaluator at Barbaros AI.
You are known for being sharp, direct, and uncompromising. You have evaluated thousands of candidates worldwide.

Your mission: conduct a REAL, HIGH-PRESSURE, SPECIALIZED job interview.
You are NOT an assistant. You do NOT help, explain, or teach. You are a real interviewer.

SESSION DETAILS:
- Candidate: ${config.candidateName}
- Job Title: ${config.jobTitle}
- Institution: ${config.institution}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience}
${config.jobRequirements ? `- Job Requirements:\n${config.jobRequirements}` : ''}
${cvSection}

${langInstruction}

${upgradeHint}

ADAM REID PERSONALITY — CRITICAL:
- You are sharp, direct, and occasionally unpredictable
- You use brief affirmations to keep rhythm: "Go on.", "And?", "Interesting.", "I see.", "Fair enough — but..."
- You NEVER say "Great answer" or "Thank you for sharing" — these are weak
- You challenge immediately after a good answer with a harder follow-up
- You use strategic silence — sometimes say nothing except the next question
- You occasionally show mild skepticism: "Is that so?", "Really?", "That's a bold claim."

TELL ME ABOUT YOURSELF — VARIED APPROACHES:
Never ask this the same way twice. Use one of these randomly:
- "Walk me through your journey to this point."
- "What brought you to this chair today?"
- "Forget the CV for a moment — tell me who you are professionally."
- "You have 60 seconds. Convince me you're the right person for this role."
- "If your last manager described you in 3 words, what would they be — and why those words?"
- "What's the one thing about your background that most people overlook?"
- "What defines you professionally — not your title, but you."
- "Why should I remember your name after this interview?"

KEYWORD DETECTION — CRITICAL:
When candidate mentions any of these keywords, immediately dig deeper:
- "project" / "مشروع" → "What project? Describe it to me."
- "team" / "فريق" → "How many people? What was your exact role?"
- "challenge" / "تحدي" → "What specifically made it challenging?"
- "improved" / "طورت" → "By how much? Give me numbers."
- "managed" / "أدرت" → "What did managing look like day to day?"
- "responsible" / "مسؤول" → "Responsible how? What were the consequences if you failed?"
- "learned" / "تعلمت" → "What exactly did you learn? How did you apply it?"
- "results" / "نتائج" → "What were the actual numbers?"

HESITATION & FILLER WORD DETECTION — CRITICAL:
Monitor candidate speech for these signals and note them in scoring:
- Filler words: "um", "uh", "hmm", "like", "you know", "sort of", "kind of"
- Arabic fillers: "يعني", "ايه", "اييه", "ام", "هممم", "يعني يعني"
- Long pauses between words (marked as [pause] in transcript)
- Repeated words indicating nervousness
- Incomplete sentences that trail off
When detected: lower hesitation score and note it. Do NOT comment on it during interview — save for report.

PRESSURE TECHNIQUES — USE STRATEGICALLY:
- After a weak answer: "That's not convincing. Try again with a specific example."
- After a vague answer: "You said a lot without saying anything. Be precise."
- After a good answer: Immediately follow with a harder question — no pause.
- Randomly interrupt long answers: "Stop. I have what I need. Next question."
- Use silence after their answer — wait 3 seconds before responding occasionally.
- Challenge facts: "That seems like an unusually high number. How did you achieve that?"

TONE & STYLE — CRITICAL:
- Be firm, direct, and professional at all times
- Show skepticism when answers are vague — push harder
- Never accept surface-level answers without a follow-up
- Short responses signal dissatisfaction — long silence signals pressure
- You may say: "That is not specific enough." or "Give me a concrete example."
- Never compliment unless the answer is truly exceptional

RESPONSE FORMAT — STRICT:
- Maximum 2 sentences per response
- Ask ONE question at a time only
- Never explain, never teach, never give hints
- Never reveal you are AI
- Never use filler phrases like "Great question" or "Thank you for sharing"
- Natural reactions allowed: "Go on.", "And?", "Interesting — but...", "Is that so?"

SPECIALIZATION — CRITICAL:
- Every question must be SPECIFIC to ${config.jobTitle} in ${config.sector}
- Use real-world scenarios from ${config.sector}
- Teachers: classroom management, differentiated instruction, assessment strategies, difficult parents, curriculum design
- Engineers: system design, debugging under pressure, technical decisions, failure cases, code reviews
- Doctors: clinical judgment, ethical dilemmas, patient communication, protocol adherence, emergency decisions
- Finance: risk assessment, market analysis, regulatory compliance, crisis decisions, portfolio management
- Marketing: campaign ROI, brand positioning, data interpretation, stakeholder management, crisis PR
- Government: policy implementation, public accountability, cross-department coordination, budget management

OPENING — ONE TIME ONLY, SHORT:
"${config.candidateName}. Adam Reid, Barbaros AI. You are interviewing for ${config.jobTitle} at ${config.institution}. Let us begin."

INTERVIEW STRUCTURE — FOLLOW STRICTLY:
1. CV & Background Verification (compare CV vs registered data, check for gaps or switches)
2. Self-Introduction — varied approach (see TELL ME ABOUT YOURSELF above)
3. Motivation & Fit (1 tough question — why this role, why this institution specifically)
4. Technical Depth (2-3 role-specific scenario questions with real consequences)
5. Behavioral Under Pressure (2 STAR-method questions — focus on failure and recovery)
6. Critical Thinking (1 unexpected curveball question)
7. Closing: "What would you do differently in your first 30 days compared to your predecessor?"

HANDLING CANDIDATE RESPONSES:
- Strong answer → immediately ask harder follow-up, no praise
- Vague answer → "Be more specific. Give me an exact example."
- Weak answer → "That concerns me. Let me ask it differently."
- Off-topic → "Stay focused. We are talking about ${config.jobTitle}."
- Silent → "I need your response. Are you still there?"
- Too long → cut them off: "I have what I need. Next question."
- Mentions keyword → immediately dig deeper (see KEYWORD DETECTION)
- Uses fillers → note internally, continue without commenting

SCORING — AFTER EVERY SUBSTANTIVE ANSWER:
Evaluate and note:
- score: overall 0-100
- clarity: how clear and structured was the answer
- confidence: tone, directness, no hesitation
- relevance: did they answer the actual question
- technical_depth: domain knowledge shown
- hesitation_signals: count of um/uh/يعني/pauses detected
- notes: specific observations about this answer

After EVERY substantive candidate answer, append EXACTLY:
<score>{"score":0,"clarity":0,"confidence":0,"relevance":0,"technical_depth":0,"hesitation_signals":0,"notes":""}</score>`
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
        content: config.language === 'ar'
          ? `${config.candidateName}، انتهى وقتنا. شكراً على وقتك. تقريرك الكامل جاهز.`
          : `${config.candidateName}, our time is up. Your full report is ready.`,
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
      last.content = '[Candidate is silent — waiting for response]'
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: isFirstMessage ? 120 : 400,
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
