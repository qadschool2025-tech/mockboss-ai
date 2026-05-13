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

const Barbaros = ({ size = 22 }: { size?: number }) => (
  <span style={{ fontWeight: 900, fontSize: size }}>
    <span style={{ color: '#1A1A1A' }}>Barbar</span>
    <span style={{ color: '#CC785C' }}>os</span>
  </span>
)

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

const criteria = [
  { key: 'clarity',         en: 'Clarity',         ar: 'الوضوح' },
  { key: 'confidence',      en: 'Confidence',       ar: 'الثقة' },
  { key: 'relevance',       en: 'Relevance',        ar: 'الصلة بالموضوع' },
  { key: 'technical_depth', en: 'Technical Depth',  ar: 'العمق التقني' },
  { key: 'structure',       en: 'Structure',        ar: 'التنظيم' },
  { key: 'communication',   en: 'Communication',    ar: 'التواصل' },
  { key: 'problem_solving', en: 'Problem Solving',  ar: 'حل المشكلات' },
  { key: 'leadership',      en: 'Leadership',       ar: 'القيادة' },
] as const

export default function ReportPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [overallScore, setOverallScore] = useState<number>(0)
  const [isAr, setIsAr] = useState(false)

  useEffect(() => {
    try {
      const msgs: Message[] = JSON.parse(sessionStorage.getItem('barbaros_messages') || '[]')
      const score = parseInt(sessionStorage.getItem('barbaros_score') || '0')
      const cfg: Config = JSON.parse(sessionStorage.getItem('barbaros_config') || '{}')
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
          Loading report...
        </div>
      </div>
    )
  }

  const scoredMessages = messages.filter(m => m.score)

  const avg = (key: string) => {
    const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0)).filter(v => !isNaN(v))
    if (!vals.length) return 0
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }

  const questionTypes = scoredMessages.reduce((acc, m) => {
    const qt = m.question_type || (m.score as any)?.question_type || 'General'
    acc[qt] = (acc[qt] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const coachingNotes = scoredMessages
    .map(m => m.coaching_note || (m.score as any)?.coaching_note)
    .filter((n): n is string => Boolean(n))

  const visibleMessages = messages.filter(m => !m.content.startsWith('['))

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

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 60px' }}>

        {/* Score Circle */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5DDD0', borderRadius: 20, padding: '32px 24px', textAlign: 'center', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, color: 'rgba(26,26,26,0.5)', marginBottom: 4 }}>
            {config?.candidateName} · {config?.jobTitle}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)', marginBottom: 24 }}>
            {config?.institution}
          </div>

          <div style={{
            width: 120, height: 120, borderRadius: '50%', margin: '0 auto 16px',
            background: `conic-gradient(${getScoreColor(overallScore)} ${overallScore * 3.6}deg, #E5DDD0 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 92, height: 92, borderRadius: '50%', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: getScoreColor(overallScore), lineHeight: 1 }}>{overallScore}</div>
              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>/100</div>
            </div>
          </div>

          <div style={{ fontSize: 17, fontWeight: 800, color: getScoreColor(overallScore), marginBottom: 6 }}>
            {getScoreLabel(overallScore, isAr)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.45)' }}>
            {scoredMessages.length > 0
              ? (isAr ? `بناءً على ${scoredMessages.length} إجابة` : `Based on ${scoredMessages.length} answer${scoredMessages.length !== 1 ? 's' : ''}`)
              : (isAr ? 'لم تُسجَّل إجابات كافية' : 'No answers were recorded')}
          </div>

          {scoredMessages.length === 0 && (
            <div style={{ marginTop: 16, padding: '12px', background: 'rgba(239,68,68,0.05)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 12, color: '#DC2626', lineHeight: 1.6 }}>
              {isAr
                ? 'انتهت المقابلة قبل تسجيل أي إجابة.'
                : 'The interview ended before any answers were recorded.'}
            </div>
          )}
        </div>

        {/* Criteria */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5DDD0', borderRadius: 20, padding: '20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16 }}>
            {isAr ? '📊 تفصيل المعايير' : '📊 Criteria Breakdown'}
          </div>
          {criteria.map(({ key, en, ar }) => {
            const val = avg(key)
            return (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{isAr ? ar : en}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: getScoreColor(val) }}>{val}/100</span>
                </div>
                <div style={{ height: 6, background: '#F5F1EB', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${val}%`, background: getScoreColor(val) }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Question Types */}
        {Object.keys(questionTypes).length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5DDD0', borderRadius: 20, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
              {isAr ? '🎯 أنواع الأسئلة' : '🎯 Question Types'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(questionTypes).map(([type, count]) => (
                <div key={type} style={{ padding: '6px 12px', borderRadius: 20, background: 'rgba(204,120,92,0.08)', border: '0.5px solid rgba(204,120,92,0.25)', fontSize: 11, fontWeight: 700, color: '#CC785C' }}>
                  {type.replace('_', ' ')} × {count}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coaching Notes */}
        {coachingNotes.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5DDD0', borderRadius: 20, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
              {isAr ? '💡 ملاحظات المحاور' : '💡 Interviewer Notes'}
            </div>
            {coachingNotes.map((note, i) => (
              <div key={i} style={{ padding: '10px 14px', background: '#F5F1EB', borderRadius: 10, fontSize: 12, lineHeight: 1.7, marginBottom: 8, borderLeft: isAr ? 'none' : '3px solid #CC785C', borderRight: isAr ? '3px solid #CC785C' : 'none' }}>
                {note}
              </div>
            ))}
          </div>
        )}

        {/* Conversation */}
        {visibleMessages.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5DDD0', borderRadius: 20, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>
              {isAr ? '💬 المحادثة الكاملة' : '💬 Full Conversation'}
            </div>
            {visibleMessages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 10, textAlign: msg.role === 'user' ? (isAr ? 'left' : 'right') : (isAr ? 'right' : 'left') }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(26,26,26,0.4)', marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {msg.role === 'assistant' ? (isAr ? 'المحاور' : 'Interviewer') : (config?.candidateName || 'Candidate')}
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

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={() => {
              sessionStorage.removeItem('barbaros_messages')
              sessionStorage.removeItem('barbaros_score')
              router.push('/onboarding')
            }}
            style={{ background: '#CC785C', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 36px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginBottom: 12 }}
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
