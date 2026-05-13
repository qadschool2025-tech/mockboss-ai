'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ScoreData {
  score: number
  clarity: number
  confidence: number
  relevance: number
  technical_depth: number
  structure: number
  communication: number
  problem_solving: number
  leadership: number
  hesitation_signals: number
  question_type: string
  coaching_note: string
  notes: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  score?: ScoreData
  coaching_note?: string
  question_type?: string
}

interface Config {
  candidateName: string
  jobTitle: string
  institution: string
  sector: string
  yearsExperience: string
  language: string
  plan: string
}

// ── Brand ────────────────────────────────────────────────────────────────────
const Barbaros = ({ size = 22 }: { size?: number }) => (
  <span style={{ fontWeight: 900, fontSize: size }}>
    <span style={{ color: '#1A1A1A' }}>Barbar</span>
    <span style={{ color: '#CC785C' }}>os</span>
  </span>
)

// ── Score helpers ─────────────────────────────────────────────────────────────
const getScoreColor = (score: number) => {
  if (score >= 75) return '#10B981'
  if (score >= 50) return '#F59E0B'
  if (score >= 25) return '#EF4444'
  return '#9CA3AF'
}

const getScoreLabel = (score: number, isAr: boolean) => {
  if (score >= 80) return isAr ? 'ممتاز' : 'Excellent'
  if (score >= 65) return isAr ? 'جيد جداً' : 'Good'
  if (score >= 50) return isAr ? 'مقبول' : 'Fair'
  if (score >= 25) return isAr ? 'ضعيف' : 'Weak'
  return isAr ? 'لم يُقيَّم' : 'Not Assessed'
}

// ── Hiring Verdict ────────────────────────────────────────────────────────────
function getHiringVerdict(score: number, isAr: boolean) {
  if (score >= 80) return {
    label: isAr ? '✅ Strong Hire' : '✅ Strong Hire',
    verdict: isAr
      ? 'بناءً على هذا الأداء — أنت مؤهل للمقابلات الحقيقية. معظم المحاورين سيكملون معك.'
      : 'Based on this performance — you are ready for real interviews. Most interviewers would move you forward.',
    color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7'
  }
  if (score >= 65) return {
    label: isAr ? '🟡 Maybe Hire' : '🟡 Maybe Hire',
    verdict: isAr
      ? 'أداء جيد لكن هناك ثغرات قد تُحدث فرقاً في اللحظة الحاسمة. تدرّب على نقاط الضعف أدناه.'
      : 'Solid performance — but gaps exist that could cost you at the critical moment. Work on the weaknesses below.',
    color: '#78350F', bg: '#FEF3C7', border: '#FCD34D'
  }
  if (score >= 45) return {
    label: isAr ? '⚠️ Risky Candidate' : '⚠️ Risky Candidate',
    verdict: isAr
      ? 'المحاور الحقيقي سيلاحظ نقاط ضعفك. تحتاج تحضيراً أعمق قبل المقابلة الفعلية.'
      : 'A real interviewer would notice your weaknesses. You need deeper preparation before the real interview.',
    color: '#7C2D12', bg: '#FEE2E2', border: '#FCA5A5'
  }
  return {
    label: isAr ? '❌ Not Recommended' : '❌ Not Recommended',
    verdict: isAr
      ? 'الأداء الحالي سيؤدي إلى رفض في معظم المقابلات الحقيقية. راجع التقرير بعناية وابدأ من جديد.'
      : 'Current performance would likely result in rejection in most real interviews. Review this report carefully and start again.',
    color: '#7F1D1D', bg: '#FEE2E2', border: '#F87171'
  }
}

// ── Hire Probability ──────────────────────────────────────────────────────────
function getHireProbability(score: number): number {
  if (score >= 80) return Math.round(65 + (score - 80) * 1.5)
  if (score >= 65) return Math.round(45 + (score - 65) * 1.3)
  if (score >= 45) return Math.round(20 + (score - 45) * 1.25)
  return Math.round(score * 0.4)
}

// ── Interview Persona ─────────────────────────────────────────────────────────
function getInterviewPersona(
  scoredMessages: Message[],
  isAr: boolean
): { title: string; description: string } {
  const avg = (key: string) => {
    const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0))
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const conf    = avg('confidence')
  const tech    = avg('technical_depth')
  const lead    = avg('leadership')
  const clarity = avg('clarity')
  const hesit   = avg('hesitation_signals')

  if (conf >= 70 && tech >= 70)
    return {
      title:       isAr ? 'الخبير الواثق' : 'The Confident Expert',
      description: isAr
        ? 'تُقدّم نفسك بثقة وعمق تقني واضح. المحاورون يثقون بك من الدقائق الأولى.'
        : 'You present with confidence and clear technical depth. Interviewers trust you from the first minutes.'
    }
  if (conf >= 60 && clarity >= 65)
    return {
      title:       isAr ? 'المتواصل المحترف' : 'The Clear Communicator',
      description: isAr
        ? 'إجاباتك منظمة وواضحة. نقطة قوتك الأكبر هي قدرتك على الشرح — لكن العمق التقني يحتاج تطوير.'
        : 'Your answers are structured and clear. Your biggest strength is explanation — but technical depth needs work.'
    }
  if (lead >= 65)
    return {
      title:       isAr ? 'المفكر الاستراتيجي' : 'The Strategic Thinker',
      description: isAr
        ? 'تفكيرك استراتيجي وتُظهر مبادرة واضحة. لكن أحياناً تبتعد عن الإجابة المباشرة.'
        : 'Your thinking is strategic and you show clear initiative. But you sometimes drift from the direct answer.'
    }
  if (hesit > 2)
    return {
      title:       isAr ? 'المرشح المتردد' : 'The Hesitant Candidate',
      description: isAr
        ? 'تمتلك المعرفة لكن التردد يُخفيها. المحاور يرى الكفاءة لكن يشكّك في ثقتك بنفسك.'
        : 'You have the knowledge but hesitation hides it. The interviewer sees competence but doubts your self-confidence.'
    }
  return {
    title:       isAr ? 'المرشح القابل للتطوير' : 'The Developing Candidate',
    description: isAr
      ? 'أنت في بداية رحلتك المهنية. الإمكانية واضحة — لكن التجربة والتدرب سيحدثان الفرق.'
      : 'You are early in your professional journey. The potential is clear — but practice and experience will make the difference.'
  }
}

// ── Hidden Weakness ───────────────────────────────────────────────────────────
function getHiddenWeakness(scoredMessages: Message[], isAr: boolean): string {
  const avg = (key: string) => {
    const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0))
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const scores = {
    confidence:      avg('confidence'),
    technical_depth: avg('technical_depth'),
    structure:       avg('structure'),
    problem_solving: avg('problem_solving'),
    leadership:      avg('leadership'),
    relevance:       avg('relevance'),
  }
  const worst = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0]

  const weaknesses: Record<string, { en: string; ar: string }> = {
    confidence: {
      en: 'You communicate confidently at the start of answers — but precision and conviction drop when challenged or asked for specifics.',
      ar: 'تبدأ إجاباتك بثقة — لكن الحسم والدقة يتراجعان عند التحدي أو طلب التفاصيل.'
    },
    technical_depth: {
      en: 'Your answers show general awareness but lack the technical specificity that separates strong candidates from average ones.',
      ar: 'إجاباتك تُظهر وعياً عاماً لكنها تفتقر إلى العمق التقني الذي يُميّز المرشحين الأقوياء.'
    },
    structure: {
      en: 'Your ideas are valuable but the lack of clear structure makes it hard for the interviewer to follow your reasoning.',
      ar: 'أفكارك قيّمة لكن غياب الهيكل الواضح يجعل من الصعب على المحاور متابعة منطقك.'
    },
    problem_solving: {
      en: 'When faced with complex scenarios, you tend to describe the problem rather than walk through a structured solution.',
      ar: 'عند مواجهة سيناريوهات معقدة، تميل إلى وصف المشكلة بدلاً من تقديم حل منظم خطوة بخطوة.'
    },
    leadership: {
      en: 'You rarely position yourself as the decision-maker or owner in your examples — which raises questions about initiative.',
      ar: 'نادراً ما تضع نفسك كصاحب قرار في أمثلتك — مما يُثير تساؤلات حول قدرتك على المبادرة.'
    },
    relevance: {
      en: 'Some of your answers drift from the actual question — a pattern interviewers notice immediately.',
      ar: 'بعض إجاباتك تبتعد عن السؤال الفعلي — وهذا نمط يلاحظه المحاورون فوراً.'
    },
  }
  return isAr ? weaknesses[worst].ar : weaknesses[worst].en
}

// ── Hiring Risk ───────────────────────────────────────────────────────────────
function getHiringRisk(scoredMessages: Message[], overallScore: number, isAr: boolean): string {
  const totalHesitation = scoredMessages.reduce((sum, m) => sum + ((m.score as any)?.hesitation_signals ?? 0), 0)

  if (totalHesitation > 6)
    return isAr
      ? 'مخاطرة توظيف: تردد ملحوظ في الإجابات يُشير إلى ضعف في الثقة تحت الضغط — وهو ما يُقلق المحاورين في الأدوار الحساسة.'
      : 'Hiring concern: Noticeable hesitation across answers signals low pressure confidence — a red flag for high-stakes roles.'
  if (overallScore < 50)
    return isAr
      ? 'مخاطرة توظيف: الأداء الحالي أقل من الحد المطلوب لمعظم الوظيفات التنافسية. يُنصح بالتدريب المكثف قبل التقديم.'
      : 'Hiring concern: Current performance falls below the threshold for most competitive roles. Intensive preparation is advised before applying.'
  const avgTech = scoredMessages.reduce((sum, m) => sum + ((m.score as any)?.technical_depth ?? 0), 0) / (scoredMessages.length || 1)
  if (avgTech < 50)
    return isAr
      ? 'مخاطرة توظيف: ضعف في العمق التقني قد يُعيق قبولك في الأدوار التي تتطلب خبرة متخصصة.'
      : 'Hiring concern: Weak technical depth may prevent acceptance in roles requiring specialized expertise.'
  return isAr
    ? 'لا مخاطر توظيف حرجة — لكن راجع نقاط الضعف أعلاه لرفع احتمالية القبول.'
    : 'No critical hiring risks detected — but review the weaknesses above to increase your acceptance probability.'
}

// ── Best / Worst answer ───────────────────────────────────────────────────────
function getBestAndWorst(scoredMessages: Message[]): { best: Message | null; worst: Message | null } {
  if (!scoredMessages.length) return { best: null, worst: null }
  const sorted = [...scoredMessages].sort((a, b) => ((b.score?.score ?? 0) - (a.score?.score ?? 0)))
  return { best: sorted[0], worst: sorted[sorted.length - 1] }
}

// ── Criteria list ─────────────────────────────────────────────────────────────
const criteria = [
  { key: 'clarity',         en: 'Clarity',         ar: 'الوضوح' },
  { key: 'confidence',      en: 'Confidence',       ar: 'الثقة' },
  { key: 'relevance',       en: 'Relevance',        ar: 'الصلة' },
  { key: 'technical_depth', en: 'Technical Depth',  ar: 'العمق التقني' },
  { key: 'structure',       en: 'Structure',        ar: 'التنظيم' },
  { key: 'communication',   en: 'Communication',    ar: 'التواصل' },
  { key: 'problem_solving', en: 'Problem Solving',  ar: 'حل المشكلات' },
  { key: 'leadership',      en: 'Leadership',       ar: 'القيادة' },
] as const

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{
    background: '#FFFFFF', border: '1px solid #E5DDD0', borderRadius: 20,
    padding: '20px', marginBottom: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    ...style
  }}>
    {children}
  </div>
)

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: '#1A1A1A' }}>
    {children}
  </div>
)

// ─────────────────────────────────────────────────────────────────────────────
export default function ReportPage() {
  const router = useRouter()
  const [mounted, setMounted]           = useState(false)
  const [messages, setMessages]         = useState<Message[]>([])
  const [config, setConfig]             = useState<Config | null>(null)
  const [overallScore, setOverallScore] = useState<number>(0)
  const [isAr, setIsAr]                 = useState(false)
  const [showConvo, setShowConvo]       = useState(false)

  useEffect(() => {
    try {
      const msgs: Message[] = JSON.parse(sessionStorage.getItem('barbaros_messages') || '[]')
      const score           = parseInt(sessionStorage.getItem('barbaros_score') || '0')
      const cfg: Config     = JSON.parse(sessionStorage.getItem('barbaros_config') || '{}')
      setMessages(msgs)
      setOverallScore(isNaN(score) ? 0 : score)
      setConfig(cfg)
      setIsAr(cfg?.language === 'ar')
    } catch {
      setMessages([])
      setOverallScore(0)
    }
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F1EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: 'rgba(26,26,26,0.4)', fontFamily: 'system-ui' }}>
          {isAr ? 'جاري تحميل التقرير...' : 'Loading report...'}
        </div>
      </div>
    )
  }

  const scoredMessages  = messages.filter(m => m.score)
  const visibleMessages = messages.filter(m => !m.content.startsWith('['))

  const avg = (key: string) => {
    const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0)).filter(v => !isNaN(v))
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  }

  const questionTypes  = scoredMessages.reduce((acc, m) => {
    const qt    = m.question_type || (m.score as any)?.question_type || 'General'
    acc[qt]     = (acc[qt] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const coachingNotes  = scoredMessages
    .map(m => m.coaching_note || (m.score as any)?.coaching_note)
    .filter((n): n is string => Boolean(n))

  const verdict        = getHiringVerdict(overallScore, isAr)
  const hirePct        = getHireProbability(overallScore)
  const persona        = getInterviewPersona(scoredMessages, isAr)
  const hiddenWeakness = scoredMessages.length ? getHiddenWeakness(scoredMessages, isAr) : null
  const hiringRisk     = scoredMessages.length ? getHiringRisk(scoredMessages, overallScore, isAr) : null
  const { best, worst } = getBestAndWorst(scoredMessages)

  // Pressure graph data — score per answered question
  const pressureData = scoredMessages.map((m, i) => ({ i: i + 1, s: m.score?.score ?? 0 }))

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      style={{ fontFamily: 'system-ui, sans-serif', background: '#F5F1EB', color: '#1A1A1A', minHeight: '100vh' }}
    >
      {/* Nav */}
      <nav style={{ background: '#F5F1EB', borderBottom: '0.5px solid #E5DDD0', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Barbaros size={20} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#CC785C' }}>
          {isAr ? 'تقرير المقابلة' : 'Interview Report'}
        </div>
        <button
          onClick={() => router.push('/')}
          style={{ background: '#FFFFFF', border: '0.5px solid #E5DDD0', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#1A1A1A', fontFamily: 'inherit' }}
        >
          {isAr ? 'الرئيسية' : 'Home'}
        </button>
      </nav>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 80px' }}>

        {/* ── 1. SCORE CIRCLE ── */}
        <Section style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'rgba(26,26,26,0.5)', marginBottom: 2 }}>
            {config?.candidateName} · {config?.jobTitle}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)', marginBottom: 24 }}>
            {config?.institution}
          </div>

          <div style={{
            width: 130, height: 130, borderRadius: '50%', margin: '0 auto 16px',
            background: `conic-gradient(${getScoreColor(overallScore)} ${overallScore * 3.6}deg, #E5DDD0 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: getScoreColor(overallScore), lineHeight: 1 }}>{overallScore}</div>
              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>/100</div>
            </div>
          </div>

          <div style={{ fontSize: 18, fontWeight: 800, color: getScoreColor(overallScore), marginBottom: 6 }}>
            {getScoreLabel(overallScore, isAr)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.45)', marginBottom: 16 }}>
            {scoredMessages.length > 0
              ? (isAr ? `بناءً على ${scoredMessages.length} إجابة` : `Based on ${scoredMessages.length} answer${scoredMessages.length !== 1 ? 's' : ''}`)
              : (isAr ? 'لم تُسجَّل إجابات كافية' : 'No answers recorded')}
          </div>

          {/* Hire Probability */}
          {scoredMessages.length > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(204,120,92,0.08)', border: '0.5px solid rgba(204,120,92,0.25)', borderRadius: 20, padding: '6px 16px' }}>
              <span style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', fontWeight: 600 }}>
                {isAr ? 'احتمال القبول' : 'Hire Probability'}
              </span>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#CC785C' }}>{hirePct}%</span>
            </div>
          )}
        </Section>

        {/* ── 2. HIRING VERDICT (WOW #1) ── */}
        {scoredMessages.length > 0 && (
          <div style={{
            background: verdict.bg, border: `1px solid ${verdict.border}`,
            borderRadius: 20, padding: '20px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: verdict.color, marginBottom: 10 }}>
              {verdict.label}
            </div>
            <div style={{ fontSize: 13, color: verdict.color, lineHeight: 1.7 }}>
              {verdict.verdict}
            </div>
          </div>
        )}

        {/* ── 3. INTERVIEW PERSONA (WOW #2) ── */}
        {scoredMessages.length > 0 && (
          <Section>
            <SectionTitle>{isAr ? '🧠 شخصية المقابلة' : '🧠 Interview Persona'}</SectionTitle>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#CC785C', marginBottom: 8 }}>
              {persona.title}
            </div>
            <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.8, fontStyle: 'italic' }}>
              "{persona.description}"
            </div>
          </Section>
        )}

        {/* ── 4. HIDDEN WEAKNESS (WOW #3) ── */}
        {hiddenWeakness && (
          <div style={{
            background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 20, padding: '20px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', marginBottom: 10 }}>
              {isAr ? '⚠️ نقطة الضعف الخفية' : '⚠️ Hidden Weakness'}
            </div>
            <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.8 }}>
              {hiddenWeakness}
            </div>
          </div>
        )}

        {/* ── 5. HIRING RISK (WOW #4) ── */}
        {hiringRisk && (
          <div style={{
            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 20, padding: '20px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 10 }}>
              {isAr ? '🔎 تقييم المحاور الحقيقي' : '🔎 Real Recruiter Assessment'}
            </div>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.8 }}>
              {hiringRisk}
            </div>
          </div>
        )}

        {/* ── 6. PRESSURE GRAPH (WOW #5) ── */}
        {pressureData.length >= 2 && (
          <Section>
            <SectionTitle>{isAr ? '📉 الأداء تحت الضغط' : '📉 Performance Under Pressure'}</SectionTitle>
            <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.45)', marginBottom: 12 }}>
              {isAr ? 'كيف تغيّر أداؤك عبر المقابلة' : 'How your performance evolved through the interview'}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
              {pressureData.map(({ i, s }) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%', borderRadius: 4,
                    height: `${Math.max(4, (s / 100) * 64)}px`,
                    background: getScoreColor(s),
                    transition: 'height 0.3s',
                  }} />
                  <div style={{ fontSize: 9, color: 'rgba(26,26,26,0.4)', fontWeight: 700 }}>
                    {isAr ? `س${i}` : `Q${i}`}
                  </div>
                </div>
              ))}
            </div>
            {pressureData.length >= 3 && (() => {
              const first = pressureData.slice(0, Math.ceil(pressureData.length / 2))
              const last  = pressureData.slice(Math.ceil(pressureData.length / 2))
              const avgF  = first.reduce((a, b) => a + b.s, 0) / first.length
              const avgL  = last.reduce((a, b) => a + b.s, 0) / last.length
              const diff  = Math.round(avgL - avgF)
              return (
                <div style={{ marginTop: 10, fontSize: 12, color: diff >= 0 ? '#065F46' : '#DC2626', fontWeight: 700 }}>
                  {diff >= 0
                    ? (isAr ? `✅ تحسّن أداؤك بمقدار ${diff} نقطة مع الوقت` : `✅ Performance improved by ${diff} points over time`)
                    : (isAr ? `⚠️ انخفض أداؤك بمقدار ${Math.abs(diff)} نقطة تحت الضغط` : `⚠️ Performance dropped ${Math.abs(diff)} points under pressure`)}
                </div>
              )
            })()}
          </Section>
        )}

        {/* ── 7. CRITERIA BREAKDOWN ── */}
        <Section>
          <SectionTitle>{isAr ? '📊 تفصيل المعايير' : '📊 Criteria Breakdown'}</SectionTitle>
          {criteria.map(({ key, en, ar }) => {
            const val = avg(key)
            return (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{isAr ? ar : en}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: getScoreColor(val) }}>{val}/100</span>
                </div>
                <div style={{ height: 6, background: '#F5F1EB', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${val}%`, background: getScoreColor(val), transition: 'width 0.5s' }} />
                </div>
              </div>
            )
          })}
        </Section>

        {/* ── 8. BEST & WORST ANSWER ── */}
        {best && worst && best !== worst && (
          <Section>
            <SectionTitle>{isAr ? '🏆 أفضل وأضعف إجابة' : '🏆 Best & Worst Answer'}</SectionTitle>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {isAr ? `✅ أقوى إجابة · ${best.score?.score}/100` : `✅ Strongest Answer · ${best.score?.score}/100`}
              </div>
              <div style={{ fontSize: 12, background: '#F0FDF4', border: '0.5px solid #6EE7B7', borderRadius: 10, padding: '10px 14px', color: '#065F46', lineHeight: 1.7 }}>
                {best.content.length > 200 ? best.content.slice(0, 200) + '...' : best.content}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {isAr ? `⚠️ أضعف إجابة · ${worst.score?.score}/100` : `⚠️ Weakest Answer · ${worst.score?.score}/100`}
              </div>
              <div style={{ fontSize: 12, background: '#FEF2F2', border: '0.5px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#7F1D1D', lineHeight: 1.7 }}>
                {worst.content.length > 200 ? worst.content.slice(0, 200) + '...' : worst.content}
              </div>
              {(worst.score as any)?.coaching_note && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#CC785C', fontWeight: 600, padding: '6px 10px', background: 'rgba(204,120,92,0.06)', borderRadius: 8, lineHeight: 1.6 }}>
                  💡 {(worst.score as any).coaching_note}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ── 9. QUESTION TYPES ── */}
        {Object.keys(questionTypes).length > 0 && (
          <Section>
            <SectionTitle>{isAr ? '🎯 أنواع الأسئلة' : '🎯 Question Types'}</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(questionTypes).map(([type, count]) => (
                <div key={type} style={{ padding: '6px 12px', borderRadius: 20, background: 'rgba(204,120,92,0.08)', border: '0.5px solid rgba(204,120,92,0.25)', fontSize: 11, fontWeight: 700, color: '#CC785C' }}>
                  {type.replace('_', ' ')} × {count}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── 10. COACHING NOTES ── */}
        {coachingNotes.length > 0 && (
          <Section>
            <SectionTitle>{isAr ? '💡 ملاحظات المحاور' : '💡 Interviewer Notes'}</SectionTitle>
            {coachingNotes.map((note, i) => (
              <div key={i} style={{
                padding: '10px 14px', background: '#F5F1EB', borderRadius: 10,
                fontSize: 12, lineHeight: 1.7, marginBottom: 8,
                borderLeft: isAr ? 'none' : '3px solid #CC785C',
                borderRight: isAr ? '3px solid #CC785C' : 'none',
              }}>
                {note}
              </div>
            ))}
          </Section>
        )}

        {/* ── 11. FULL CONVERSATION (collapsible) ── */}
        {visibleMessages.length > 0 && (
          <Section>
            <button
              onClick={() => setShowConvo(prev => !prev)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800 }}>
                {isAr ? '💬 المحادثة الكاملة' : '💬 Full Conversation'}
              </span>
              <span style={{ fontSize: 12, color: '#CC785C', fontWeight: 700 }}>
                {showConvo ? (isAr ? 'إخفاء ▲' : 'Hide ▲') : (isAr ? 'عرض ▼' : 'Show ▼')}
              </span>
            </button>

            {showConvo && (
              <div style={{ marginTop: 14 }}>
                {visibleMessages.map((msg, i) => (
                  <div key={i} style={{ marginBottom: 10, textAlign: msg.role === 'user' ? (isAr ? 'left' : 'right') : (isAr ? 'right' : 'left') }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(26,26,26,0.4)', marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      {msg.role === 'assistant'
                        ? (isAr ? 'المحاور' : 'Interviewer')
                        : (config?.candidateName || 'Candidate')}
                      {msg.score ? ` · ${msg.score.score}/100` : ''}
                    </div>
                    <div style={{
                      display: 'inline-block', maxWidth: '88%', padding: '8px 12px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: msg.role === 'user' ? '#CC785C' : '#F5F1EB',
                      color: msg.role === 'user' ? '#FFFFFF' : '#1A1A1A',
                      fontSize: 12, lineHeight: 1.7,
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ── CTA ── */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={() => {
              sessionStorage.removeItem('barbaros_messages')
              sessionStorage.removeItem('barbaros_score')
              router.push('/onboarding')
            }}
            style={{
              background: '#CC785C', color: '#fff', border: 'none', borderRadius: 14,
              padding: '14px 36px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit', width: '100%', marginBottom: 12,
            }}
          >
            {isAr ? '🔁 مقابلة جديدة' : '🔁 Start New Interview'}
          </button>
          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>
            <Barbaros size={11} /> · {isAr ? 'مدعوم بالذكاء الاصطناعي' : 'Powered by AI'}
          </div>
        </div>
      </div>
    </div>
  )
}
