'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface ScoreData {
  score: number
  feedback: string
  strengths: string[]
  improvements: string[]
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  score?: ScoreData
  voiceAnalysis?: {
    confidence: string
    hesitation: string
    wordCount: number
    duration: number
    wordsPerMinute: number
  }
}

const reportTranslations = {
  en: {
    title: 'Interview Report',
    newInterview: 'New Interview',
    performanceReport: 'Performance Report',
    overallScore: 'Overall Score',
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    needsWork: 'Needs Work',
    excellentMsg: 'Outstanding performance. You demonstrated strong communication, confidence, and subject knowledge.',
    goodMsg: 'Good performance overall. Focus on expanding your answers and showing more specific examples.',
    fairMsg: 'Keep practicing. Work on structuring your answers using the STAR method.',
    framework: 'Barbaros Evaluation Framework',
    scienceTitle: 'The Science Behind Your Score',
    scienceDesc: 'After analyzing hiring patterns across 40+ industries, top HR leaders agree: the gap between a strong candidate and a hired candidate comes down to 5 signals — most candidates never realize they are being measured on them.',
    dimensions: [
      { num: '①', title: 'Technical Depth', desc: 'Not just what you know — but how you think when you reach the edge of your knowledge.', color: '#E85D2F' },
      { num: '②', title: 'Communication Architecture', desc: 'The structure of your answer reveals how you structure your work. Interviewers listen for logic, not just content.', color: '#2563EB' },
      { num: '③', title: 'Behavior Under Pressure', desc: 'Every interviewer watches how you respond when pushed. This is where most candidates lose the offer — silently.', color: '#F59E0B' },
      { num: '④', title: 'Executive Presence', desc: 'Confidence is not volume. It is precision, timing, and the ability to own a room without raising your voice.', color: '#22C55E' },
      { num: '⑤', title: 'Role & Cultural Fit', desc: 'The best answer delivered to the wrong institution is still the wrong answer. Alignment matters as much as ability.', color: '#8B96FF' },
    ],
    frameworkNote: 'Barbaros evaluates you across all five dimensions — the same framework used by Fortune 500 hiring panels.',
    questionsAnswered: 'Questions Answered',
    voiceResponses: 'Voice Responses',
    hesitationIndex: 'Hesitation Index',
    confidencePressure: 'Confidence Under Pressure',
    vocalAnalysis: '🎙️ Vocal Performance Analysis',
    answerBreakdown: '📊 Answer Breakdown',
    readyLonger: 'Ready for a longer session?',
    readyLongerDesc: 'In a Pro or Expert session, Adam Reid goes deeper — uncovering the answers behind your answers.',
    viewPlans: 'View Plans →',
    noData: 'No session data found.',
    startInterview: 'Start Interview →',
    startNew: 'Start New Interview →',
    home: 'Home',
    poweredBy: 'Developed by certified HR professionals, powered by AI',
    veryLow: 'Very Low',
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    strong: 'Strong',
    needsWorkLabel: 'Needs Work',
  },
  ar: {
    title: 'تقرير المقابلة',
    newInterview: 'مقابلة جديدة',
    performanceReport: 'تقرير الأداء',
    overallScore: 'النتيجة الإجمالية',
    excellent: 'ممتاز',
    good: 'جيد',
    fair: 'مقبول',
    needsWork: 'يحتاج تطوير',
    excellentMsg: 'أداء استثنائي. أظهرت قدرة تواصل قوية وثقة ومعرفة متعمقة بالمجال.',
    goodMsg: 'أداء جيد بشكل عام. ركز على توسيع إجاباتك وتقديم أمثلة أكثر تحديداً.',
    fairMsg: 'استمر في التدرب. اعمل على هيكلة إجاباتك باستخدام أسلوب STAR.',
    framework: 'إطار تقييم Barbaros',
    scienceTitle: 'العلم وراء نتيجتك',
    scienceDesc: 'بعد تحليل أنماط التوظيف في أكثر من 40 صناعة، يتفق كبار متخصصي الموارد البشرية: الفجوة بين مرشح قوي ومرشح مقبول تعتمد على 5 إشارات — معظم المرشحين لا يدركون أنهم يُقيَّمون عليها.',
    dimensions: [
      { num: '①', title: 'العمق التقني', desc: 'ليس فقط ما تعرفه — بل كيف تفكر عندما تصل إلى حدود معرفتك.', color: '#E85D2F' },
      { num: '②', title: 'بنية التواصل', desc: 'هيكل إجابتك يكشف كيف تنظم عملك. المحاورون يستمعون للمنطق، ليس فقط المحتوى.', color: '#2563EB' },
      { num: '③', title: 'السلوك تحت الضغط', desc: 'كل محاور يراقب كيف تتصرف عند الضغط. هنا يخسر معظم المرشحين العرض — بصمت.', color: '#F59E0B' },
      { num: '④', title: 'الحضور التنفيذي', desc: 'الثقة ليست بالصوت العالي. بل بالدقة والتوقيت والقدرة على امتلاك الغرفة دون رفع صوتك.', color: '#22C55E' },
      { num: '⑤', title: 'الملاءمة الوظيفية والثقافية', desc: 'أفضل إجابة تُقدَّم للمؤسسة الخاطئة لا تزال إجابة خاطئة. التوافق مهم بقدر القدرة.', color: '#8B96FF' },
    ],
    frameworkNote: 'يقيّمك Barbaros عبر الأبعاد الخمسة — نفس الإطار المستخدم من قِبل لجان التوظيف في Fortune 500.',
    questionsAnswered: 'الأسئلة المُجابة',
    voiceResponses: 'الردود الصوتية',
    hesitationIndex: 'مؤشر التردد',
    confidencePressure: 'الثقة تحت الضغط',
    vocalAnalysis: '🎙️ تحليل الأداء الصوتي',
    answerBreakdown: '📊 تفصيل الإجابات',
    readyLonger: 'هل أنت مستعد لجلسة أطول؟',
    readyLongerDesc: 'في جلسة Pro أو Expert، يتعمق Adam Reid أكثر — يكشف الإجابات خلف إجاباتك.',
    viewPlans: 'عرض الباقات ←',
    noData: 'لا توجد بيانات للجلسة.',
    startInterview: 'ابدأ مقابلة ←',
    startNew: 'ابدأ مقابلة جديدة ←',
    home: 'الرئيسية',
    poweredBy: 'طُوِّر بمشاركة متخصصين معتمدين في الموارد البشرية، مدعوم بالذكاء الاصطناعي',
    veryLow: 'منخفض جداً',
    low: 'منخفض',
    moderate: 'معتدل',
    high: 'مرتفع',
    strong: 'قوي',
    needsWorkLabel: 'يحتاج تطوير',
  }
}

export default function ReportPage() {
  const router = useRouter()
  const [config, setConfig] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [overallScore, setOverallScore] = useState<number | null>(null)

  useEffect(() => {
    try {
      const savedConfig = sessionStorage.getItem('barbaros_config')
      const savedMessages = sessionStorage.getItem('barbaros_messages')
      const savedScore = sessionStorage.getItem('barbaros_score')
      if (savedConfig) setConfig(JSON.parse(savedConfig))
      if (savedMessages) setMessages(JSON.parse(savedMessages))
      if (savedScore) setOverallScore(parseInt(savedScore))
    } catch {}
  }, [])

  const isAr = config?.language === 'ar'
  const isRTL = isAr
  const tr = reportTranslations[isAr ? 'ar' : 'en']

  const scoredMessages = messages.filter(m => m.score)
  const voiceMessages = messages.filter(m => m.voiceAnalysis)

  const hesitationIndex = voiceMessages.length > 0
    ? Math.round((voiceMessages.filter(m => m.voiceAnalysis?.hesitation === 'high').length / voiceMessages.length) * 100)
    : null

  const confidenceUnderPressure = voiceMessages.length > 0
    ? Math.round((voiceMessages.filter(m => m.voiceAnalysis?.confidence === 'high').length / voiceMessages.length) * 100)
    : null

  const getScoreColor = (s: number) => {
    if (s >= 80) return '#22C55E'
    if (s >= 60) return '#F59E0B'
    return '#EF4444'
  }

  const getScoreLabel = (s: number) => {
    if (s >= 80) return tr.excellent
    if (s >= 60) return tr.good
    if (s >= 40) return tr.fair
    return tr.needsWork
  }

  const getScoreMsg = (s: number) => {
    if (s >= 80) return tr.excellentMsg
    if (s >= 60) return tr.goodMsg
    return tr.fairMsg
  }

  const getHesitationLabel = (h: number) => {
    if (h <= 20) return { label: tr.veryLow, color: '#22C55E' }
    if (h <= 40) return { label: tr.low, color: '#86EFAC' }
    if (h <= 60) return { label: tr.moderate, color: '#F59E0B' }
    return { label: tr.high, color: '#EF4444' }
  }

  const getConfidenceLabel = (c: number) => {
    if (c >= 80) return { label: tr.strong, color: '#22C55E' }
    if (c >= 60) return { label: tr.moderate, color: '#F59E0B' }
    return { label: tr.needsWorkLabel, color: '#EF4444' }
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div onClick={() => router.push('/')} style={{ fontWeight: 900, fontSize: 22, letterSpacing: -0.5, cursor: 'pointer' }}>
          Barbar<span style={{ color: '#E85D2F' }}>os</span>
        </div>
        <span style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)' }}>{tr.performanceReport}</span>
        <button onClick={() => router.push('/onboarding')}
          style={{ background: '#E85D2F', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
          {tr.newInterview}
        </button>
      </nav>

      <main style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 680 }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6, letterSpacing: -0.5 }}>{tr.title}</h1>
            {config && (
              <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.45)' }}>
                {config.candidateName} · {config.jobTitle} · {config.institution}
              </p>
            )}
          </div>

          {/* Overall Score */}
          {overallScore !== null && (
            <div style={{ background: '#111318', border: `1px solid ${getScoreColor(overallScore)}25`, borderRadius: 16, padding: '28px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: 64, fontWeight: 900, color: getScoreColor(overallScore), lineHeight: 1, letterSpacing: -2 }}>{overallScore}</div>
                <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginTop: 4 }}>/100</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'inline-block', background: `${getScoreColor(overallScore)}15`, border: `0.5px solid ${getScoreColor(overallScore)}40`, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, color: getScoreColor(overallScore), marginBottom: 10 }}>
                  {getScoreLabel(overallScore)}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.6)', lineHeight: 1.6 }}>
                  {getScoreMsg(overallScore)}
                </div>
              </div>
            </div>
          )}

          {/* The Science Behind Your Score */}
          <div style={{ background: 'linear-gradient(135deg, rgba(42,92,255,0.06), rgba(139,150,255,0.03))', border: '0.5px solid rgba(139,150,255,0.2)', borderRadius: 16, padding: '28px 24px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: '#8B96FF', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
              {tr.framework}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, letterSpacing: -0.5 }}>
              {tr.scienceTitle}
            </h3>
            <p style={{ fontSize: 12, color: 'rgba(240,237,232,0.45)', lineHeight: 1.7, marginBottom: 20 }}>
              {tr.scienceDesc}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {tr.dimensions.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 18, color: item.color, flexShrink: 0, marginTop: 1 }}>{item.num}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3, color: item.color }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.45)', lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '0.5px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(240,237,232,0.3)', fontStyle: 'italic' }}>
              {tr.frameworkNote}
            </div>
          </div>

          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: tr.questionsAnswered, value: scoredMessages.length.toString(), icon: '❓' },
              { label: tr.voiceResponses, value: voiceMessages.length.toString(), icon: '🎙️' },
              {
                label: tr.hesitationIndex,
                value: hesitationIndex !== null ? `${hesitationIndex}%` : '—',
                icon: '🧠',
                color: hesitationIndex !== null ? getHesitationLabel(hesitationIndex).color : undefined
              },
              {
                label: tr.confidencePressure,
                value: confidenceUnderPressure !== null ? `${confidenceUnderPressure}%` : '—',
                icon: '💪',
                color: confidenceUnderPressure !== null ? getConfidenceLabel(confidenceUnderPressure).color : undefined
              },
            ].map((stat, i) => (
              <div key={i} style={{ background: '#111318', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '16px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{stat.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4, color: (stat as any).color ?? '#F0EDE8' }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.35)' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Voice Analysis */}
          {voiceMessages.length > 0 && (
            <div style={{ background: '#111318', border: '0.5px solid rgba(139,150,255,0.2)', borderRadius: 12, padding: '20px', marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#8B96FF' }}>{tr.vocalAnalysis}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  {
                    label: tr.confidencePressure,
                    value: confidenceUnderPressure !== null ? `${confidenceUnderPressure}%` : '—',
                    sublabel: confidenceUnderPressure !== null ? getConfidenceLabel(confidenceUnderPressure).label : '',
                    color: confidenceUnderPressure !== null ? getConfidenceLabel(confidenceUnderPressure).color : '#8B96FF'
                  },
                  {
                    label: tr.hesitationIndex,
                    value: hesitationIndex !== null ? `${hesitationIndex}%` : '—',
                    sublabel: hesitationIndex !== null ? getHesitationLabel(hesitationIndex).label : '',
                    color: hesitationIndex !== null ? getHesitationLabel(hesitationIndex).color : '#8B96FF'
                  },
                ].map((item, i) => (
                  <div key={i} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '16px 8px' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: item.color, marginBottom: 4 }}>{item.value}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.sublabel}</div>
                    <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.4)' }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Q&A Breakdown */}
          {scoredMessages.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'rgba(240,237,232,0.7)' }}>{tr.answerBreakdown}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((msg, i) => {
                  if (msg.role !== 'user' || !msg.score) return null
                  const q = messages[i - 1]
                  return (
                    <div key={i} style={{ background: '#111318', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px' }}>
                      {q && (
                        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginBottom: 8, fontStyle: 'italic' }}>
                          Q: {q.content.slice(0, 120)}{q.content.length > 120 ? '...' : ''}
                        </div>
                      )}
                      <div style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>
                        {msg.content.slice(0, 150)}{msg.content.length > 150 ? '...' : ''}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: getScoreColor(msg.score.score) }}>
                          {msg.score.score}/100
                        </span>
                        {msg.voiceAnalysis && (
                          <>
                            <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 10, color: msg.voiceAnalysis.confidence === 'high' ? '#22C55E' : msg.voiceAnalysis.confidence === 'medium' ? '#F59E0B' : '#EF4444' }}>
                              {isAr ? 'ثقة' : 'Confidence'}: {msg.voiceAnalysis.confidence}
                            </span>
                            <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 10, color: msg.voiceAnalysis.hesitation === 'low' ? '#22C55E' : msg.voiceAnalysis.hesitation === 'medium' ? '#F59E0B' : '#EF4444' }}>
                              {isAr ? 'تردد' : 'Hesitation'}: {msg.voiceAnalysis.hesitation}
                            </span>
                          </>
                        )}
                      </div>
                      {msg.score.feedback && (
                        <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.5)', marginTop: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, lineHeight: 1.6 }}>
                          💬 {msg.score.feedback}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Upgrade CTA — longer session only, no voice upgrade */}
          <div style={{ background: 'linear-gradient(135deg, rgba(232,93,47,0.08), rgba(37,99,235,0.08))', border: '0.5px solid rgba(232,93,47,0.2)', borderRadius: 14, padding: '24px', marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
              {tr.readyLonger}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.5)', marginBottom: 16, lineHeight: 1.6 }}>
              {tr.readyLongerDesc}
            </div>
            <button onClick={() => router.push('/packages')}
              style={{ background: '#E85D2F', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
              {tr.viewPlans}
            </button>
          </div>

          {/* No Data */}
          {scoredMessages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(240,237,232,0.3)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14 }}>{tr.noData}</div>
              <button onClick={() => router.push('/onboarding')}
                style={{ marginTop: 16, background: '#2A5CFF', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
                {tr.startInterview}
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/onboarding')}
              style={{ flex: 1, padding: '13px', background: '#2A5CFF', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              {tr.startNew}
            </button>
            <button onClick={() => router.push('/')}
              style={{ padding: '13px 20px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(240,237,232,0.6)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              {tr.home}
            </button>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: '#0D0F14', borderTop: '0.5px solid rgba(255,255,255,0.04)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Barbar<span style={{ color: '#E85D2F' }}>os</span></div>
        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.2)' }}>© 2026 Barbaros. All rights reserved.</div>
        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.2)' }}>{tr.poweredBy}</div>
      </footer>

    </div>
  )
}
