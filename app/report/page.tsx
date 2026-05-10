'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const CRITERIA = [
  { key: 'academic_knowledge',       ar: 'المعرفة الأكاديمية',         en: 'Academic Knowledge',         icon: '📚' },
  { key: 'practical_experience',     ar: 'الخبرة العملية',             en: 'Practical Experience',       icon: '🏗️' },
  { key: 'problem_solving',          ar: 'حل المشكلات',                en: 'Problem Solving',            icon: '🧩' },
  { key: 'communication_confidence', ar: 'التواصل والثقة',             en: 'Communication & Confidence', icon: '🗣️' },
  { key: 'professionalism',          ar: 'الاحترافية',                  en: 'Professionalism',            icon: '🎯' },
  { key: 'work_environment_fit',     ar: 'التوافق مع بيئة العمل',      en: 'Work Environment Fit',       icon: '🤝' },
  { key: 'language_technical',       ar: 'اللغة والتقنية',             en: 'Language & Technical',       icon: '💬' },
]

// Mock data — سيُستبدل بالبيانات الحقيقية من الـ session
const MOCK_MESSAGES = [
  { role: 'assistant', content: 'Tell me about your experience.', score: { score: 72, academic_knowledge: 80, practical_experience: 70, problem_solving: 65, communication_confidence: 75, professionalism: 80, work_environment_fit: 70, language_technical: 68, hesitation_signals: 72, notes: 'Good foundation, needs more specifics.' } },
  { role: 'assistant', content: 'How do you handle difficult situations?', score: { score: 68, academic_knowledge: 65, practical_experience: 72, problem_solving: 70, communication_confidence: 65, professionalism: 75, work_environment_fit: 68, language_technical: 60, hesitation_signals: 65, notes: 'Hesitated on technical terms.' } },
]

function calcAverages(messages: any[]) {
  const scored = messages.filter(m => m.score)
  if (!scored.length) return {}
  const avgs: Record<string, number> = {}
  CRITERIA.forEach(c => {
    const sum = scored.reduce((acc: number, m: any) => acc + (m.score[c.key] ?? 0), 0)
    avgs[c.key] = Math.round(sum / scored.length)
  })
  return avgs
}

export default function ReportPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const messages = MOCK_MESSAGES
  const scored = messages.filter(m => m.score)
  const overallScore = scored.length
    ? Math.round(scored.reduce((s, m) => s + m.score.score, 0) / scored.length)
    : 0
  const criteriaAvgs = calcAverages(messages)

  const scoreColor = overallScore >= 75 ? '#22C55E' : overallScore >= 50 ? '#F59E0B' : '#EF4444'
  const scoreLabel = overallScore >= 75 ? 'Strong Candidate' : overallScore >= 50 ? 'Needs Improvement' : 'Significant Gaps'
  const scoreLabelAr = overallScore >= 75 ? 'مرشح قوي' : overallScore >= 50 ? 'يحتاج تطوير' : 'فجوات كبيرة'

  if (!mounted) return null

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Mock<span style={{ color: '#E85D2F' }}>Boss</span> AI</div>
        <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.4)' }}>Interview Report · تقرير المقابلة</div>
        <button
          onClick={() => router.push('/onboarding')}
          style={{ background: '#E85D2F', border: 'none', borderRadius: 8, color: '#fff', padding: '7px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
        >
          New Interview
        </button>
      </nav>

      <main style={{ flex: 1, padding: '32px 24px', maxWidth: 720, margin: '0 auto', width: '100%' }}>

        {/* Overall Score */}
        <div style={{ background: '#111520', border: '0.5px solid rgba(42,92,255,0.2)', borderRadius: 16, padding: '28px 24px', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(240,237,232,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Overall Score · النتيجة الإجمالية
          </div>
          <div style={{ fontSize: 72, fontWeight: 900, color: scoreColor, lineHeight: 1, marginBottom: 8 }}>{overallScore}</div>
          <div style={{ fontSize: 13, color: scoreColor, fontWeight: 600 }}>{scoreLabel} · {scoreLabelAr}</div>

          {/* Score bar */}
          <div style={{ marginTop: 20, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${overallScore}%`, background: scoreColor, borderRadius: 3, transition: 'width 1s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'rgba(240,237,232,0.25)' }}>
            <span>0</span><span>50</span><span>100</span>
          </div>
        </div>

        {/* Criteria Breakdown */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(240,237,232,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Detailed Assessment · التقييم التفصيلي
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CRITERIA.map(c => {
              const val = criteriaAvgs[c.key] ?? 0
              const color = val >= 75 ? '#22C55E' : val >= 50 ? '#F59E0B' : '#EF4444'
              return (
                <div key={c.key} style={{ background: '#111520', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{c.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{c.en}</div>
                        <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.35)' }}>{c.ar}</div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 20, color }}>{val}</div>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${val}%`, background: color, borderRadius: 2, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Hesitation */}
        {(() => {
          const hesitationAvg = scored.length
            ? Math.round(scored.reduce((s, m) => s + (m.score.hesitation_signals ?? 0), 0) / scored.length)
            : 0
          const fluencyColor = hesitationAvg >= 75 ? '#22C55E' : hesitationAvg >= 50 ? '#F59E0B' : '#EF4444'
          const fluencyLabel = hesitationAvg >= 75 ? 'Fluent' : hesitationAvg >= 50 ? 'Moderate' : 'High Hesitation'
          return (
            <div style={{ background: '#111520', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(240,237,232,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                Speech Fluency · طلاقة الكلام
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: fluencyColor, fontWeight: 600 }}>{fluencyLabel}</div>
                <div style={{ fontWeight: 900, fontSize: 20, color: fluencyColor }}>{hesitationAvg}/100</div>
              </div>
              <div style={{ marginTop: 8, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${hesitationAvg}%`, background: fluencyColor, borderRadius: 2 }} />
              </div>
            </div>
          )
        })()}

        {/* Notes */}
        {scored.some(m => m.score.notes) && (
          <div style={{ background: '#111520', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(240,237,232,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Evaluator Notes · ملاحظات المقيّم
            </div>
            {scored.filter(m => m.score.notes).map((m, i) => (
              <div key={i} style={{ fontSize: 12, color: 'rgba(240,237,232,0.6)', marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid rgba(139,150,255,0.3)' }}>
                {m.score.notes}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => router.push('/onboarding')}
            style={{ flex: 1, background: '#E85D2F', border: 'none', borderRadius: 10, color: '#fff', padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            New Interview →
          </button>
          <button
            onClick={() => router.push('/packages')}
            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#F0EDE8', padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Upgrade Plan
          </button>
        </div>

      </main>
    </div>
  )
}
