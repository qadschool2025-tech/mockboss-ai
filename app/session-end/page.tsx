'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function SessionEndPage() {
  const router = useRouter()
  const [config, setConfig] = useState<any>(null)
  const [score, setScore] = useState<number | null>(null)

  useEffect(() => {
    try {
      const savedConfig = sessionStorage.getItem('barbaros_config')
      const savedScore = sessionStorage.getItem('barbaros_score')
      if (savedConfig) setConfig(JSON.parse(savedConfig))
      if (savedScore) setScore(parseInt(savedScore))
    } catch {}
  }, [])

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

  const getScoreMessage = (s: number) => {
    if (s >= 80) return 'Outstanding performance. You are ready for the real interview.'
    if (s >= 60) return 'Good effort. A few more sessions and you will be interview-ready.'
    if (s >= 40) return 'Keep practicing. Consistency is the key to confidence.'
    return 'Every expert was once a beginner. Practice makes perfect.'
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div onClick={() => router.push('/')} style={{ fontWeight: 900, fontSize: 22, letterSpacing: -0.5, cursor: 'pointer' }}>
          Barbar<span style={{ color: '#E85D2F' }}>os</span>
        </div>
        <span style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)' }}>Session Complete</span>
      </nav>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>

        {/* Icon */}
        <div style={{ fontSize: 64, marginBottom: 16 }}>
          {score !== null ? (score >= 60 ? '🏆' : '💪') : '🎯'}
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, marginBottom: 8, letterSpacing: -0.5 }}>
          Interview Complete
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(240,237,232,0.45)', marginBottom: 40 }}>
          {config?.candidateName ? `Well done, ${config.candidateName.split(' ')[0]}.` : 'Well done.'} Adam Reid has finished evaluating your session.
        </p>

        {/* Score Card */}
        {score !== null ? (
          <div style={{ background: '#111318', border: `1px solid ${getScoreColor(score)}30`, borderRadius: 16, padding: '32px 40px', marginBottom: 32, minWidth: 280 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(240,237,232,0.4)', marginBottom: 12 }}>
              Overall Score
            </div>
            <div style={{ fontSize: 72, fontWeight: 900, color: getScoreColor(score), letterSpacing: -2, lineHeight: 1, marginBottom: 8 }}>
              {score}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.4)', marginBottom: 16 }}>/100</div>
            <div style={{ display: 'inline-block', background: `${getScoreColor(score)}15`, border: `0.5px solid ${getScoreColor(score)}40`, borderRadius: 20, padding: '5px 16px', fontSize: 13, fontWeight: 700, color: getScoreColor(score), marginBottom: 16 }}>
              {getScoreLabel(score)}
            </div>
            <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.5)', lineHeight: 1.6, maxWidth: 280 }}>
              {getScoreMessage(score)}
            </p>
          </div>
        ) : (
          <div style={{ background: '#111318', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '32px 40px', marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.4)' }}>Session completed successfully.</div>
          </div>
        )}

        {/* Session Info */}
        {config && (
          <div style={{ background: '#0F1117', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 20px', marginBottom: 32, width: '100%', maxWidth: 320 }}>
            {[
              ['Role', config.jobTitle],
              ['Institution', config.institution],
              ['Plan', config.plan?.toUpperCase() ?? 'FREE'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
                <span style={{ color: 'rgba(240,237,232,0.4)' }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
          <button
            onClick={() => router.push('/report')}
            style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#2A5CFF,#1d45cc)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
            View Full Report →
          </button>
          <button
            onClick={() => router.push('/onboarding')}
            style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#F0EDE8', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Start New Interview
          </button>
          <button
            onClick={() => router.push('/packages')}
            style={{ width: '100%', padding: '14px', background: 'rgba(232,93,47,0.08)', border: '0.5px solid rgba(232,93,47,0.25)', borderRadius: 10, color: '#E85D2F', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            🎙️ Upgrade for Voice Interview
          </button>
        </div>

        {/* Motivational Quote */}
        <div style={{ marginTop: 48, fontSize: 13, color: 'rgba(240,237,232,0.25)', fontStyle: 'italic' }}>
          "Anyone can practice. Barbaros makes you ready."
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
