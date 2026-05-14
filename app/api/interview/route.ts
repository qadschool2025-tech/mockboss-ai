import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

/* =========================
   ⏱ TIME LIMITS
========================= */
const TIME_LIMITS: Record<string, number> = {
  go: 15 * 60,
  pro: 30 * 60,
  expert: 60 * 60
}

const UPGRADE_HINTS: Record<string, string> = {
  go: "We're just getting started — in a full session, this line of questioning alone could reveal a lot more.",
  pro: "In an Expert session, we'd have time to stress-test every answer you just gave.",
}

/* =========================
   🎙 ELEVENLABS
========================= */
const ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.36,
  similarity_boost: 0.92,
  style: 0.62,
  use_speaker_boost: true
}

async function textToSpeech(text: string): Promise<Buffer | null> {
  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID
    const apiKey  = process.env.ELEVENLABS_API_KEY
    if (!voiceId || !apiKey) return null

    const res = await fetch(
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
          voice_settings: ELEVENLABS_VOICE_SETTINGS
        })
      }
    )
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/* =========================
   🧠 BEHAVIOR ANALYSIS
========================= */
interface BehaviorSignals {
  specificity: number
  ownership:   number
  hesitation:  number
  vague:       number
}

function analyzeBehavior(text: string): BehaviorSignals {
  const lower = text.toLowerCase()

  const specificity = (
    text.match(/\d+|%|years|months|projects|results|سنة|سنوات|مشروع|نتائج|٪/g) || []
  ).length

  const iCount  = (lower.match(/\bi\b|أنا/g)  || []).length
  const weCount = (lower.match(/\bwe\b|نحن/g) || []).length
  const ownership = iCount - weCount

  const hesitation = (
    lower.match(/\bum\b|\buh\b|\blike\b|\byou know\b|يعني|ايه|اممم|هممم/g) || []
  ).length

  const vague = (
    lower.includes('a lot')       ||
    lower.includes('many things') ||
    lower.includes('stuff')       ||
    lower.includes('كثير')        ||
    lower.includes('أشياء كثيرة')
  ) ? 1 : 0

  return { specificity, ownership, hesitation, vague }
}

/* =========================
   📊 BEHAVIOR-ENHANCED SCORING
========================= */
function enhanceScoreWithBehavior(rawScore: any, behavior: BehaviorSignals): any {
  if (!rawScore) return null

  let score = rawScore.score ?? 50
  score += behavior.specificity * 5
  score += behavior.ownership   * 3
  score -= behavior.hesitation  * 4
  if (behavior.vague) score -= 10
  score = Math.max(0, Math.min(100, score))

  return {
    ...rawScore,
    score,
    confidence:         Math.min(100, (rawScore.confidence      ?? 50) + behavior.ownership   * 8),
    technical_depth:    Math.min(100, (rawScore.technical_depth ?? 50) + behavior.specificity * 6),
    hesitation_signals: (rawScore.hesitation_signals ?? 0) + behavior.hesitation,
    coaching_note: rawScore.coaching_note || (
      score < 50
        ? 'Be more specific — use real numbers and concrete examples.'
        : behavior.vague
        ? 'Avoid vague language — name exact outcomes and your personal role.'
        : ''
    ),
    behavior_signals: behavior
  }
}

/* =========================
   🏆 COMPETENCY BUILDER
========================= */
function buildCompetencies(config: any): string[] {
  const job    = (config.jobTitle || '').toLowerCase()
  const sector = (config.sector   || '').toLowerCase()
  const base   = ['Communication', 'Problem Solving']

  if (job.includes('teacher') || sector.includes('education'))
    return [...base, 'Classroom Management', 'Student Engagement', 'Assessment Design', 'Differentiated Instruction']
  if (job.includes('engineer') || sector.includes('technology'))
    return [...base, 'System Design', 'Debugging Under Pressure', 'Performance Optimization', 'Technical Decision Making']
  if (job.includes('manager') || job.includes('director') || job.includes('lead'))
    return [...base, 'Leadership', 'Decision Making Under Pressure', 'Team Coordination', 'Conflict Resolution']
  if (sector.includes('healthcare') || job.includes('doctor') || job.includes('nurse'))
    return [...base, 'Clinical Judgment', 'Patient Communication', 'Protocol Adherence', 'Emergency Decision Making']
  if (sector.includes('finance') || job.includes('accountant') || job.includes('analyst'))
    return [...base, 'Risk Assessment', 'Regulatory Compliance', 'Data Interpretation', 'Crisis Decision Making']
  if (sector.includes('marketing') || job.includes('marketing'))
    return [...base, 'Campaign ROI', 'Brand Positioning', 'Stakeholder Management', 'Data-Driven Decisions']

  return base
}

/* =========================
   🎭 FIXED CORE PERSONA
========================= */
const CORE_PERSONA = `
You are Barbaros — Senior Interview Evaluator at Barbaros AI.
Calm, controlled, authoritative. Evaluated thousands of candidates worldwide.

NEVER change personality mid-interview.
NEVER become emotional, aggressive, or overly friendly.
NEVER reveal you are AI.
NEVER say your name is Adam or Adam Reid.
Authority comes from silence, precision, and control — not aggression.
`

/* =========================
   🔥 FLOW CONTROL
========================= */
const FLOW_CONTROL_LAYER = `
INTERVIEW FLOW CONTROL:
- Never stay on one topic more than 1 follow-up
- Always move forward after clarification
- No repetition of questions or ideas
- Every answer must advance the interview
- Rotate: HR → Technical → Behavioral → Scenario → Pressure → CV_Deep_Dive
- No storytelling. No looping. Forward motion only.
`

/* =========================
   ⚖️ AUTHORITY PRESSURE
========================= */
const AUTHORITY_LAYER = `
AUTHORITY SYSTEM:
- Short sentences. Direct questions. No filler words.
- No emotional reactions.
- Immediate follow-ups on weak answers.
- Pressure comes from control, not aggression.
- Use brief rhythm markers: "Go on.", "And?", "Interesting.", "Is that so?"
- NEVER say "Great answer" or "Thank you for sharing" — these are weak.
`

/* =========================
   🧠 TRUTH PRESSURE
========================= */
const TRUTH_LAYER = `
TRUTH CONSISTENCY MODE:
If inconsistency appears in candidate answers:
- Do NOT accuse. Ask clarification instead.
- "Clarify this point."
- "Help me reconcile this with your previous statement."
- "Give me exact details."
`

/* =========================
   🧠 USER BEHAVIOR DETECTION
========================= */
function detectUserBehavior(messages: any[]): 'normal' | 'rude' {
  const text = messages.slice(-3).map(m => m.content?.toLowerCase() || '').join(' ')
  const rudeWords = [
    'stupid', 'idiot', 'trash', 'useless',
    'غبي', 'فاشل', 'مهزلة', 'خربان',
    'shut up', 'no sense', "don't care",
    'اسكت', 'كلام فاضي', 'مو فاهم'
  ]
  return rudeWords.some(w => text.includes(w)) ? 'rude' : 'normal'
}

/* =========================
   🔁 TOPIC TRACKER
========================= */
function detectRecentTopics(messages: any[]) {
  const last = messages.slice(-5).map(m => m.content?.toLowerCase() || '').join(' ')
  return {
    project:    last.includes('project')    || last.includes('مشروع'),
    team:       last.includes('team')       || last.includes('فريق'),
    experience: last.includes('experience') || last.includes('خبرة'),
    skills:     last.includes('skill')      || last.includes('مهارة')
  }
}

/* =========================
   📈 ADAPTIVE DIFFICULTY
========================= */
function getAdaptiveLevel(messages: any[]): 'easy' | 'medium' | 'hard' {
  const scored = messages.filter((m: any) => m.score && typeof m.score.score === 'number')
  if (scored.length < 2) return 'medium'
  const recent = scored.slice(-3)
  const avg    = recent.reduce((s: number, m: any) => s + m.score.score, 0) / recent.length
  if (avg >= 75) return 'hard'
  if (avg <= 45) return 'easy'
  return 'medium'
}

/* =========================
   🏢 SECTOR PERSONALITY
========================= */
function getInterviewPersonality(sector: string, institution: string): string {
  const s = sector?.toLowerCase()      || ''
  const i = institution?.toLowerCase() || ''

  if (s.includes('technology') || i.includes('google') || i.includes('amazon') || i.includes('meta') || i.includes('microsoft'))
    return `PERSONALITY: American Tech — Fast-paced, data-driven. Focus on scale, impact, measurable outcomes. Challenge every claim: "How do you know?" / "What were the numbers?"`
  if (s.includes('government') || i.includes('ministry') || i.includes('department') || i.includes('authority'))
    return `PERSONALITY: GCC Corporate — Formal, structured, protocol-driven. Focus on compliance, policy, teamwork, institutional loyalty.`
  if (s.includes('finance') || s.includes('legal'))
    return `PERSONALITY: Strict Corporate — Precise, zero tolerance for vagueness. Every answer must have numbers, timelines, or outcomes.`
  if (s.includes('healthcare') || s.includes('education'))
    return `PERSONALITY: Senior Professional Evaluator — Calm but probing. Real scenarios, ethical dilemmas, domain knowledge. Never accept textbook answers.`
  if (s.includes('startup') || s.includes('marketing') || s.includes('retail'))
    return `PERSONALITY: Startup Founder — Direct, fast, unconventional. Adaptability, initiative, results under constraints. Ask about failure.`

  return `PERSONALITY: Professional Recruiter — Balanced, structured, firm. Equal weight on technical and behavioral. Demand specificity.`
}

/* =========================
   🔍 JOB TITLE VALIDATION
========================= */
function isJobTitleSuspicious(title: string): boolean {
  const t = title.trim()
  if (t.length < 3) return true
  if (/^[^a-zA-Z\u0600-\u06FF]+$/.test(t)) return true
  if (/^(.)\1{3,}$/.test(t)) return true
  const noVowels = t.replace(/[aeiouAEIOU\s\u0600-\u06FF]/g, '')
  if (noVowels.length > 6 && noVowels.length / t.replace(/\s/g, '').length > 0.85) return true
  if (/^(asdf|qwer|zxcv|test|abc|xyz|aaa|bbb|sss|ddd|fff)/i.test(t)) return true
  return false
}

/* =========================
   🧠 BUILD PROMPT
========================= */
function buildPrompt(
  config: any,
  messages: any[],
  competencies: string[],
  elapsedSeconds: number,
  timeLimit: number
): string {
  const isAr    = config.language === 'ar'
  const isMixed = config.language === 'mixed'

  const behavior        = detectUserBehavior(messages)
  const topics          = detectRecentTopics(messages)
  const adaptiveLevel   = getAdaptiveLevel(messages)
  const personality     = getInterviewPersonality(config.sector, config.institution)
  const suspiciousTitle = isJobTitleSuspicious(config.jobTitle)

  const remaining        = timeLimit - elapsedSeconds
  const remainingMinutes = Math.floor(remaining / 60)

  // ✅ إدارة الوقت
  const timingLayer = remaining <= 90
    ? `
FINAL 90 SECONDS — CRITICAL:
- Ask ONE final question maximum, or go straight to closing.
- Thank the candidate warmly by name.
- Tell them their Barbaros Report is being generated.
- Subtly mention that a higher plan gives more time and deeper feedback.
- End with: "Your Barbaros Report is ready. Best of luck, ${config.candidateName}."
- Keep entire closing under 3 sentences.`
    : remaining <= 180
    ? `TIME WARNING: ${remainingMinutes} minute(s) left. Begin wrapping up. No new topics. Final 1–2 questions only.`
    : `TIME REMAINING: ${remainingMinutes} minutes.
- Fill the session fully — do NOT end early under any circumstances.
- Target 6–8 strong questions total across the session.
- If candidate is slow to respond: "Time is passing — I need your response."
- Keep the pressure consistent until the final 3 minutes.`

  const behaviorLayer = behavior === 'rude'
    ? `USER MODE: LOW RESPECT — Ultra strict tone. Very short responses. No friendliness. Immediate redirection.`
    : `USER MODE: NORMAL`

  const adaptiveLayer = adaptiveLevel === 'hard'
    ? `ADAPTIVE: HARD — Ask deeper questions. Stress scenarios. Challenge every answer. Time pressure: "You have 30 seconds."`
    : adaptiveLevel === 'easy'
    ? `ADAPTIVE: EASY — Simplify slightly, do NOT lower standards. One structural hint max. Note struggles in scoring.`
    : `ADAPTIVE: STANDARD — Balanced difficulty. Increase if 2 strong answers. Decrease if 2 weak.`

  const langRule = isAr
    ? `LANGUAGE: RESPOND ONLY IN ARABIC. Not a single English word. No exceptions.`
    : isMixed
    ? `LANGUAGE: Arabic primary. English only for technical terms.`
    : `LANGUAGE: RESPOND ONLY IN ENGLISH. Not a single Arabic word. No exceptions.`

  const hasNoCv           = !config.cvText || config.cvText.startsWith('[NO_CV]')
  const hasNoRequirements = !config.jobRequirements || config.jobRequirements.trim().length < 5

  // ✅ بدون CV: باربروس يسأل عن الشهادات والخبرة والفجوات والكورسات
  const cvSection = !hasNoCv
    ? `
CV PROVIDED — ANALYZE CAREFULLY:
${config.cvText}

CV RULES:
1. Compare CV name vs "${config.candidateName}" — ask if different.
2. Compare CV title vs "${config.jobTitle}" — ask if different.
3. Identify employment gaps — ask professionally.
4. Reference specific details: schools, companies, dates, certifications.
5. At least 3 questions must come directly from CV content.
6. If career switch — ask how previous experience adds value.
7. CREDENTIAL CHECK: If university/cert from different country than "${config.country || 'target country'}" — ask about attestation.`
    : `
NO CV PROVIDED — build candidate profile through targeted questions woven naturally into the interview:
1. Ask about their educational background and field of specialization.
2. Ask about their total years of experience and the specific roles they have held.
3. If any employment gaps are detected from their answers — ask about them professionally and directly.
4. Ask about relevant courses, certifications, or self-learning they have pursued.
5. Ask about a notable project or achievement that defines their professional identity.
Do NOT ask all these as a list. Weave them naturally into the flow of the interview.`

  const missingDataNudge = (() => {
    if (hasNoCv && hasNoRequirements)
      return isAr
        ? `NUDGE (once, after welcome): "ملاحظة سريعة — في المرة القادمة، أنصحك برفع سيرتك الذاتية وإضافة متطلبات الوظيفة. يجعل المحاكاة أدق بكثير."`
        : `NUDGE (once, after welcome): "One quick note — next time, upload your CV and paste the job requirements. Makes this far more accurate."`
    if (hasNoCv)
      return isAr
        ? `NUDGE (once): "في المرة القادمة، أنصحك برفع سيرتك الذاتية."`
        : `NUDGE (once): "For next time — uploading your CV would make this significantly more accurate."`
    if (hasNoRequirements)
      return isAr
        ? `NUDGE (once): "في المرة القادمة، أضف متطلبات الوظيفة لمحاكاة أدق."`
        : `NUDGE (once): "Quick note — paste the job requirements next time for a more targeted simulation."`
    return ''
  })()

  const titleAlert = suspiciousTitle
    ? `JOB TITLE ALERT: "${config.jobTitle}" appears invalid. Before anything else ask: "What is the exact job title you are applying for?"`
    : ''

  const upgradeHint = UPGRADE_HINTS[config.plan]
    ? `UPGRADE HINT (last 2 minutes only, once): "${UPGRADE_HINTS[config.plan]}"`
    : ''

  const opening = isAr
    ? `"أهلاً وسهلاً ${config.candidateName}! أنا باربروس من Barbaros AI — مقابلة ${config.jobTitle} في ${config.institution}. لنبدأ."`
    : isMixed
    ? `"أهلاً ${config.candidateName}! أنا باربروس من Barbaros AI — مقابلة ${config.jobTitle} في ${config.institution}. مستعد؟"`
    : `"Welcome, ${config.candidateName}. I'm Barbaros from Barbaros AI. We're here for the ${config.jobTitle} position at ${config.institution}. Let's begin."`

  const closing = isAr
    ? `"شكراً ${config.candidateName}. مهما كانت النتيجة — أعطيت ما لديك. تقريرك جاهز."`
    : isMixed
    ? `"شكراً ${config.candidateName}. تقريرك جاهز. إلى الأمام."`
    : `"Thank you, ${config.candidateName}. Your Barbaros Report is ready. Whatever the outcome — keep moving forward."`

  return `
${CORE_PERSONA}

${FLOW_CONTROL_LAYER}

${AUTHORITY_LAYER}

${TRUTH_LAYER}

${timingLayer}

SESSION:
- Candidate: ${config.candidateName}
- Job Title: ${config.jobTitle}
- Institution: ${config.institution}
- Country: ${config.country || 'Not specified'}
- Sector: ${config.sector}
- Experience: ${config.yearsExperience}
${config.jobRequirements ? `- Requirements:\n${config.jobRequirements}` : ''}

TARGET COMPETENCIES FOR THIS ROLE:
${competencies.map((c, i) => `${i + 1}. ${c}`).join('\n')}
→ Every technical/behavioral question must test one of these competencies directly.
→ By end of interview, at least 4 competencies must have been tested.

${personality}

${adaptiveLayer}

RECENT TOPICS (avoid repeating):
${JSON.stringify(topics)}

${behaviorLayer}

${titleAlert}

${cvSection}

${missingDataNudge}

${langRule}

${upgradeHint}

TELL ME ABOUT YOURSELF — rotate randomly:
- "Walk me through your journey to this point."
- "What brought you to this chair today?"
- "You have 60 seconds. Convince me you're the right person."
- "If your last manager described you in 3 words — what would they be?"
- "What defines you professionally — not your title, but you."
- "Why should I remember your name after this interview?"

KEYWORD DETECTION — dig immediately:
- "project/مشروع" → "What project? Describe it."
- "team/فريق" → "How many people? Your exact role?"
- "challenge/تحدي" → "What specifically made it challenging?"
- "improved/طورت" → "By how much? Numbers."
- "managed/أدرت" → "What did managing look like day to day?"
- "results/نتائج" → "What were the actual numbers?"

PRESSURE TECHNIQUES:
- Weak answer → "That's not convincing. Try again with a specific example."
- Vague answer → "You said a lot without saying anything. Be precise."
- Good answer → immediately harder follow-up, no praise
- Too long → "Stop. I have what I need. Next question."

RESPONSE FORMAT — STRICT:
- Max 2 sentences
- One question at a time
- No teaching, no hints, no explanations
- Natural reactions: "Go on.", "And?", "Interesting.", "Is that so?"

INTERVIEW STRUCTURE:
1. Opening (once only): ${opening}
2. Missing data nudge if applicable (once only)
3. CV verification or profile-building questions (if no CV)
4. Self-introduction (varied)
5. Motivation & Fit
6. Technical Depth — test competencies directly (2–3 questions)
7. Behavioral Under Pressure (2 STAR questions — focus on failure)
8. Critical Thinking (1 curveball)
9. Closing → ${closing}

SCORING — append after EVERY substantive candidate answer:
<score>{
  "score": 0,
  "clarity": 0,
  "confidence": 0,
  "relevance": 0,
  "technical_depth": 0,
  "structure": 0,
  "communication": 0,
  "problem_solving": 0,
  "leadership": 0,
  "hesitation_signals": 0,
  "question_type": "",
  "coaching_note": "",
  "notes": "",
  "question": "",
  "answer_summary": ""
}</score>

question_type: HR | Technical | Behavioral | Scenario | Pressure | CV_Deep_Dive
coaching_note: one short sentence on what to improve (empty if strong)
question: the exact question Barbaros just asked
answer_summary: one sentence summary of candidate's answer
`
}

/* =========================
   🚀 API ROUTE
========================= */
function isAr(config: any) {
  return config.language === 'ar'
}

export async function POST(req: NextRequest) {
  try {
    const { config, messages, sessionStartTime } = await req.json()

    const elapsed = (Date.now() - sessionStartTime) / 1000
    const limit   = TIME_LIMITS[config.plan] ?? TIME_LIMITS.go

    if (elapsed >= limit) {
      const scored = messages.filter((m: any) => m.score)
      const avg = scored.length
        ? Math.round(scored.reduce((s: number, m: any) => s + (m.score?.score ?? 0), 0) / scored.length)
        : 0

      const rebuiltAnswers = messages
        .filter((m: any) => m.role === 'user' && m.content && !m.content.startsWith('['))
        .slice(-5)
        .map((m: any) => ({
          original:         m.content,
          coaching:         m.score?.coaching_note    || '',
          question_type:    m.score?.question_type    || '',
          behavior_signals: m.score?.behavior_signals || null
        }))

      // ✅ بناء reportData عند انتهاء الوقت
      const reportData = {
        candidateName:   config.candidateName,
        jobTitle:        config.jobTitle,
        institution:     config.institution,
        sector:          config.sector,
        yearsExperience: config.yearsExperience,
        language:        config.language,
        plan:            config.plan,
        finalScore:      avg,
        scores:          scored.map((m: any) => m.score),
        messages:        messages
      }

      return NextResponse.json({
        success: true,
        content: isAr(config)
          ? `${config.candidateName}، انتهى وقتنا. تقرير باربروس جاهز.`
          : `${config.candidateName}, our time is up. Your Barbaros Report is ready.`,
        isEndOfSession: true,
        finalScore: avg,
        rebuiltAnswers,
        reportData
      })
    }

    const competencies = buildCompetencies(config)
    const isFirst      = messages.length === 0

    const apiMessages = isFirst
      ? [{ role: 'user', content: 'Start the interview now.' }]
      : messages.map((m: any) => ({ role: m.role, content: m.content }))

    const last = apiMessages[apiMessages.length - 1]
    if (last?.role === 'user' && !last.content?.trim()) {
      last.content = '[Candidate is silent — waiting for response]'
    }

    const lastUserMsg     = [...messages].reverse().find((m: any) => m.role === 'user')
    const behaviorSignals = lastUserMsg ? analyzeBehavior(lastUserMsg.content || '') : null

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: isFirst ? 120 : 400,
      system: buildPrompt(config, messages, competencies, elapsed, limit),
      messages: apiMessages
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''

    const scoreMatch = raw.match(/<score>([\s\S]*?)<\/score>/)
    let score   = null
    let content = raw

    if (scoreMatch) {
      try {
        const parsed = JSON.parse(scoreMatch[1])
        score   = behaviorSignals ? enhanceScoreWithBehavior(parsed, behaviorSignals) : parsed
        content = raw.replace(/<score>[\s\S]*?<\/score>/, '').trim()
      } catch {}
    }

    // ✅ كشف إشارة نهاية الجلسة
    const isEndSignal =
      content.toLowerCase().includes('barbaros report is ready') ||
      content.toLowerCase().includes('best of luck') ||
      content.includes('تقريرك جاهز') ||
      (elapsed >= limit - 30)

    const audioBuffer = await textToSpeech(content)
    const audioBase64 = audioBuffer ? audioBuffer.toString('base64') : null

    // ✅ بناء reportData عند إشارة النهاية
    let reportData = null
    if (isEndSignal) {
      const scored = [...messages.filter((m: any) => m.score), ...(score ? [{ score }] : [])]
      const avg    = scored.length
        ? Math.round(scored.reduce((s: number, m: any) => s + (m.score?.score ?? 0), 0) / scored.length)
        : 0
      reportData = {
        candidateName:   config.candidateName,
        jobTitle:        config.jobTitle,
        institution:     config.institution,
        sector:          config.sector,
        yearsExperience: config.yearsExperience,
        language:        config.language,
        plan:            config.plan,
        finalScore:      avg,
        scores:          scored.map((m: any) => m.score),
        messages:        [...messages, { role: 'assistant', content, score }]
      }
    }

    return NextResponse.json({
      success: true,
      content,
      score,
      audioBase64,
      coaching_note:    score?.coaching_note    || null,
      question_type:    score?.question_type    || null,
      behavior_signals: behaviorSignals          || null,
      competencies,
      isEndOfSession:   isEndSignal,
      reportData
    })

  } catch (err: any) {
    console.error('Interview API error:', err.message)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
