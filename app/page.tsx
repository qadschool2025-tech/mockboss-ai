'use client'

import { useEffect, useState } from 'react'
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

const Barbaros = ({ size = 22 }: { size?: number }) => (
  <span style={{ fontWeight: 900, fontSize: size }}>
    <span style={{ color: '#1A1A1A' }}>Barbar</span>
    <span style={{ color: '#CC785C' }}>os</span>
  </span>
)

function ScoreCircle({ score }: { score: number }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 70 ? '#22C55E' : score >= 50 ? '#F59E0B' : '#EF4444'

  return (
    <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
      <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#E5DDD0" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={radius} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.45)', fontWeight: 600 }}>/100</div>
      </div>
    </div>
  )
}

function getReadiness(score: number): { label: string; color: string; bg: string; border: string; icon: string; message: string } {
  if (score >= 70) return {
    label: 'Ready for Interview',
    color: '#16A34A',
    bg: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.3)',
    icon: '✅',
    message: 'Your performance meets professional hiring standards. You are prepared to face a real interview.'
  }
  if (score >= 50) return {
    label: 'Borderline',
    color: '#D97706',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.3)',
    icon: '⚠️',
    message: 'You have the foundation but need sharper answers. Review your weak areas before the real interview.'
  }
  return {
    label: 'Not Ready',
    color: '#DC2626',
    bg: 'rgba(220,38,38,0.08)',
    border: 'rgba(220,38,38,0.3)',
    icon: '❌',
    message: 'Significant gaps were detected in your performance. More practice is needed before you are interview-ready.'
  }
}

export default function SessionEndPage() {
  const router = useRouter()
  const [score, setScore] = useState<number>(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [config, setConfig] = useState<any>(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [topStrengths, setTopStrengths] = useState<string[]>([])
  const [topWeaknesses, setTopWeaknesses] = useState<string[]>([])

  useEffect(() => {
    try {
      const savedScore = sessionStorage.getItem('barbaros_score')
      const savedMessages = sessionStorage.getItem('barbaros_messages')
      const savedConfig = sessionStorage.getItem('barbaros_config')

      if (savedScore) setScore(Number(savedScore))
      if (savedMessages) {
        const msgs: Message[] = JSON.parse(savedMessages)
        setMessages(msgs)

        const scored = msgs.filter(m => m.score && typeof m.score.score === 'number')
        setQuestionCount(scored.length)

        // Detect strengths and weaknesses from scores
        const criteria = ['clarity', 'confidence', 'relevance', 'technical_depth', 'structure', 'communication', 'problem_solving', 'leadership']
        const averages: Record<string, number> = {}
        criteria.forEach(c => {
          const vals = scored.map((m: any) => m.score?.[c] ?? 0).filter((v: number) => v > 0)
          averages[c] = vals.length ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : 0
        })

        const sorted = Object.entries(averages).sort((a, b) => b[1] - a[1])
        setTopStrengths(sorted.slice(0, 2).map(([k]) => k.replace('_', ' ')))
        setTopWeaknesses(sorted.slice(-2).map(([k]) => k.replace('_', ' ')))
      }
      if (savedConfig) setConfig(JSON.parse(savedConfig))
    } catch {}
  }, [])

  const readiness = getReadiness(score)

  const formatCriteria = (s: string) =>
    s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      background: '#F5F1EB',
      color: '#1A1A1A',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>

      {/* Nav */}
      <nav style={{
        background: '#F5F1EB',
        borderBottom: '0.5px solid #E5DDD0',
        padding: '14px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div onClick={() => router.push('/')} style={{ cursor: 'pointer' }}>
          <Barbaros size={22} />
        </div>
        <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.5)', fontWeight: 600 }}>
          Session Complete
        </div>
        <div style={{ width: 60 }} />
      </nav>

      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 16px 60px'
      }}>
        <div style={{ width: '100%', maxWidth: 520 }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#1A1A1A', letterSpacing: -0.5, margin: '0 0 8px' }}>
              Interview Complete
            </h1>
            {config && (
              <p style={{ fontSize: 13, color: 'rgba(26,26,26,0.55)', margin: 0 }}>
                {config.candidateName} · {config.jobTitle} · {config.institution}
              </p>
            )}
          </div>

          {/* Score Circle */}
          <div style={{
            background: '#FFFFFF',
            border: '0.5px solid #E5DDD0',
            borderRadius: 20,
            padding: '32px 24px',
            textAlign: 'center',
            marginBottom: 16,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(26,26,26,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>
              Overall Performance Score
            </div>
            <ScoreCircle score={score} />
            <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.45)', marginTop: 16 }}>
              Based on {questionCount} evaluated {questionCount === 1 ? 'answer' : 'answers'}
            </div>
          </div>

          {/* Readiness Badge */}
          <div style={{
            background: readiness.bg,
            border: `0.5px solid ${readiness.border}`,
            borderRadius: 16,
            padding: '20px 24px',
            marginBottom: 16,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{readiness.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: readiness.color, marginBottom: 8, letterSpacing: -0.3 }}>
              {readiness.label}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(26,26,26,0.65)', lineHeight: 1.6 }}>
              {readiness.message}
            </div>
          </div>

          {/* Strengths & Weaknesses */}
          {(topStrengths.length > 0 || topWeaknesses.length > 0) && (
            <div style={{
              background: '#FFFFFF',
              border: '0.5px solid #E5DDD0',
              borderRadius: 16,
              padding: '20px 24px',
              marginBottom: 16,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
                  Top Strengths
                </div>
                {topStrengths.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: '#22C55E', fontSize: 13 }}>↑</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1A1A' }}>{formatCriteria(s)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
                  Needs Work
                </div>
                {topWeaknesses.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: '#EF4444', fontSize: 13 }}>↓</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1A1A' }}>{formatCriteria(w)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interviewer Message */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(204,120,92,0.08), rgba(204,120,92,0.03))',
            border: '0.5px solid rgba(204,120,92,0.25)',
            borderRadius: 16,
            padding: '20px 24px',
            marginBottom: 28
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#CC785C', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
              From Your <Barbaros size={11} /> Interviewer
            </div>
            <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.7 }}>
              {score >= 70
                ? `Strong performance, ${config?.candidateName?.split(' ')[0] || 'candidate'}. Your full report contains the details that will take you from good to exceptional. Review it carefully.`
                : score >= 50
                ? `You showed potential, ${config?.candidateName?.split(' ')[0] || 'candidate'}, but there are clear gaps. Your full report will show exactly where and how to improve.`
                : `There is work to do, ${config?.candidateName?.split(' ')[0] || 'candidate'}. Your full report identifies every weak point. Use it — that is what it is for.`
              }
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => router.push('/report')}
              style={{
                width: '100%', padding: '15px',
                background: '#CC785C', border: 'none', borderRadius: 12,
                color: '#FFFFFF', fontWeight: 800, fontSize: 15,
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: -0.3
              }}>
              View Full Report →
            </button>
            <button
              onClick={() => router.push('/onboarding')}
              style={{
                width: '100%', padding: '14px',
                background: 'transparent',
                border: '0.5px solid #E5DDD0',
                borderRadius: 12, color: '#1A1A1A',
                fontWeight: 600, fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit'
              }}>
              Start New Interview
            </button>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer style={{
        background: '#EDE6D8',
        borderTop: '0.5px solid #E5DDD0',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8
      }}>
        <Barbaros size={14} />
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>© 2026 Barbaros. All rights reserved.</div>
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>Powered by AI</div>
      </footer>

    </div>
  )
}
