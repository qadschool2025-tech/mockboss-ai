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

  const scoredMessages = messages.filter(m => m.score)
  const voiceMessages = messages.filter(m => m.voiceAnalysis)

  const avgConfidence = voiceMessages.length > 0
    ? voiceMessages.filter(m => m.voiceAnalysis?.confidence === 'high').length / voiceMessages.length * 100
    : null

  const avgWPM = voiceMessages.length > 0
    ? Math.round(voiceMessages.reduce((a, m) => a + (m.voiceAnalysis?.wordsPerMinute ?? 0), 0) / voiceMessages.length)
    : null

  const totalWords = voiceMessages.reduce((a, m) => a + (m.voiceAnalysis?.wordCount ?? 0), 0)

  const getScoreColor = (s: number) => {
    if (s >= 80) return '#22C55E'
    if (s >= 60) return '#F59E0B'
    return '#EF4444'
  }

  const getScoreLabel = (s: number) => {
    if (s >= 80) return 'Excellent'
    if (s >= 60) return 'Good'
    if (s >= 40) return 'Fair'
    return 'Needs Work'
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div onClick={() => router.push('/')} style={{ fontWeight: 900, fontSize: 22, letterSpacing: -0.5, cursor: 'pointer' }}>
          Barbar<span style={{ color: '#E85D2F' }}>os</span>
        </div>
        <span style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)' }}>Performance Report</span>
        <button
          onClick={() => router.push('/onboarding')}
          style={{ background: '#E85D2F', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
          New Interview
        </button>
      </nav>

      <main style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 680 }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6, letterSpacing: -0.5 }}>
              Interview Report
            </h1>
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
                  {overallScore >= 80
                    ? 'Outstanding performance. You demonstrated strong communication, confidence, and subject knowledge.'
                    : overallScore >= 60
                    ? 'Good performance overall. Focus on expanding your answers and showing more specific examples.'
                    : 'Keep practicing. Work on structuring your answers using the STAR method.'}
                </div>
              </div>
            </div>
          )}

          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Questions Answered', value: scoredMessages.length.toString(), icon: '❓' },
              { label: 'Voice Responses', value: voiceMessages.length.toString(), icon: '🎙️' },
              { label: 'Total Words', value: totalWords > 0 ? totalWords.toString() : '—', icon: '📝' },
              { label: 'Avg Speed', value: avgWPM ? `${avgWPM} wpm` : '—', icon: '⚡' },
            ].map((stat, i) => (
              <div key={i} style={{ background: '#111318', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '16px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{stat.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.35)' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Voice Analysis */}
          {voiceMessages.length > 0 && (
            <div style={{ background: '#111318', border: '0.5px solid rgba(139,150,255,0.2)', borderRadius: 12, padding: '20px', marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#8B96FF' }}>🎙️ Voice Analysis</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {[
                  { label: 'High Confidence', value: `${Math.round((voiceMessages.filter(m => m.voiceAnalysis?.confidence === 'high').length / voiceMessages.length) * 100)}%`, color: '#22C55E' },
                  { label: 'Low Hesitation', value: `${Math.round((voiceMessages.filter(m => m.voiceAnalysis?.hesitation === 'low').length / voiceMessages.length) * 100)}%`, color: '#22C55E' },
                  { label: 'Avg WPM', value: avgWPM ? `${avgWPM}` : '—', color: '#8B96FF' },
                ].map((item, i) => (
                  <div key={i} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 8px' }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: item.color, marginBottom: 4 }}>{item.value}</div>
                    <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.4)' }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Q&A Breakdown */}
          {scoredMessages.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'rgba(240,237,232,0.7)' }}>📊 Answer Breakdown</h3>
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
                              Confidence: {msg.voiceAnalysis.confidence}
                            </span>
                            <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 10, color: 'rgba(240,237,232,0.4)' }}>
                              {msg.voiceAnalysis.wordCount} words
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

          {/* Upgrade CTA */}
          {config?.plan === 'free' && (
            <div style={{ background: 'linear-gradient(135deg, rgba(232,93,47,0.08), rgba(37,99,235,0.08))', border: '0.5px solid rgba(232,93,47,0.2)', borderRadius: 14, padding: '24px', marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                🎙️ Want a deeper analysis?
              </div>
              <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.5)', marginBottom: 16, lineHeight: 1.6 }}>
                Upgrade to voice mode and get real-time confidence scoring, hesitation detection, and a full AI-powered debrief.
              </div>
              <button
                onClick={() => router.push('/packages')}
                style={{ background: '#E85D2F', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                Upgrade to Voice →
              </button>
            </div>
          )}

          {/* No Data */}
          {scoredMessages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(240,237,232,0.3)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14 }}>No session data found.</div>
              <button
                onClick={() => router.push('/onboarding')}
                style={{ marginTop: 16, background: '#2A5CFF', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
                Start Interview →
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push('/onboarding')}
              style={{ flex: 1, padding: '13px', background: '#2A5CFF', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              Start New Interview →
            </button>
            <button
              onClick={() => router.push('/')}
              style={{ padding: '13px 20px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(240,237,232,0.6)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              Home
            </button>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: '#0D0F14', borderTop: '0.5px solid rgba(255,255,255,0.04)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Barbar<span style={{ color: '#E85D2F' }}>os</span></div>
        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.2)' }}>© 2026 Barbaros. All rights reserved.</div>
        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.2)' }}>Powered by AI</div>
      </footer>

    </div>
  )
}
