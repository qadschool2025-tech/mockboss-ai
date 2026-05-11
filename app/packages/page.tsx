'use client'

import { useRouter } from 'next/navigation'

const PLANS = [
  {
    name: 'GO',
    price: '$2.50',
    period: '/session',
    bg: 'rgba(204,120,92,0.06)',
    border: '#E8B8A8',
    borderWidth: '1px',
    accent: '#CC785C',
    badge: 'DEFAULT',
    badgeBg: 'rgba(204,120,92,0.15)',
    badgeColor: '#CC785C',
    scale: 1,
    mode: '🎙️ Real Interview',
    duration: '15',
    durationUnit: 'min',
    sessions: '1',
    sessionsLabel: 'Pay as you go',
    taglineEn: 'The cost of a coffee. The value of a career.',
    features: [
      'Standardized interview tailored to your job requirements',
      'Real Interview — AI-powered live voice session with Adam Reid',
      'Detailed Report — fair evaluation based on professional hiring standards',
      'Language Choice',
      'Voice confidence & hesitation analysis',
      'No commitment — pay per session',
    ],
    cta: 'Start Session',
    ctaBg: '#CC785C',
    ctaColor: '#fff',
  },
  {
    name: 'Pro',
    price: '$12',
    period: '/mo',
    bg: 'rgba(204,120,92,0.15)',
    border: '#CC785C',
    borderWidth: '2px',
    accent: '#CC785C',
    badge: '🔥 MOST POPULAR',
    badgeBg: '#CC785C',
    badgeColor: '#fff',
    scale: 1.05,
    mode: '🎙️ Real Interview',
    duration: '30',
    durationUnit: 'min',
    sessions: '10',
    sessionsLabel: 'per month',
    taglineEn: 'Ten rehearsals — before the one that changes everything.',
    features: [
      'Standardized interview tailored to your job requirements',
      'Real Interview — AI-powered live voice session with Adam Reid',
      'Detailed Report — fair evaluation based on professional hiring standards',
      'Language Choice',
      'Voice confidence & hesitation analysis',
      '10 full sessions per month',
    ],
    cta: 'Get Pro',
    ctaBg: '#CC785C',
    ctaColor: '#fff',
  },
  {
    name: 'Expert',
    price: '$36',
    period: '/mo',
    bg: 'rgba(168,90,66,0.18)',
    border: '#A85A42',
    borderWidth: '2.5px',
    accent: '#A85A42',
    badge: 'PREMIUM',
    badgeBg: '#1A1A1A',
    badgeColor: '#F5F1EB',
    scale: 1,
    mode: '🎙️ Real Interview',
    duration: '60',
    durationUnit: 'min',
    sessions: '20',
    sessionsLabel: 'per month',
    taglineEn: 'Twenty interviews — until "you\'re hired" stops surprising you.',
    features: [
      'Standardized interview tailored to your job requirements',
      'Real Interview — AI-powered live voice session with Adam Reid',
      'Detailed Report — fair evaluation based on professional hiring standards',
      'Language Choice',
      'Voice confidence & hesitation analysis',
      '20 full sessions per month',
      'Priority processing & dedicated support',
    ],
    cta: 'Go Expert',
    ctaBg: 'linear-gradient(135deg, #A85A42, #CC785C)',
    ctaColor: '#fff',
  },
]

export default function PackagesPage() {
  const router = useRouter()

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#F5F1EB', color: '#1A1A1A', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ background: '#F5F1EB', borderBottom: '0.5px solid #E5DDD0', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div onClick={() => router.push('/')} style={{ fontWeight: 900, fontSize: 22, letterSpacing: -0.5, cursor: 'pointer' }}>
          <span style={{ color: '#1A1A1A' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span>
        </div>
        <button onClick={() => router.push('/onboarding')}
          style={{ background: '#1A1A1A', border: 'none', color: '#F5F1EB', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
          Get Started
        </button>
      </nav>

      <main style={{ flex: 1, padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(204,120,92,0.1)', border: '0.5px solid rgba(204,120,92,0.3)', borderRadius: 20, padding: '5px 14px', marginBottom: 20, fontSize: 11, color: '#CC785C', fontWeight: 600, letterSpacing: 0.5 }}>
            ● PRICING
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 16px', letterSpacing: -1, color: '#1A1A1A' }}>
            Choose your <span style={{ color: '#CC785C' }}>interview room</span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(26,26,26,0.6)', maxWidth: 420, lineHeight: 1.7, margin: '0 auto' }}>
            Every plan includes real voice interviews with Adam Reid. No text-only mode.
          </p>
        </div>

        {/* Plans Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 1000, width: '100%', marginBottom: 60, alignItems: 'stretch' }}>
          {PLANS.map((plan) => (
            <div key={plan.name} style={{
              background: plan.bg,
              border: `${plan.borderWidth} solid ${plan.border}`,
              borderRadius: 16,
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'visible',
              transform: `scale(${plan.scale})`,
              boxShadow: plan.scale > 1 ? '0 12px 40px rgba(204,120,92,0.25)' : '0 4px 16px rgba(26,26,26,0.06)',
              zIndex: plan.scale > 1 ? 2 : 1,
            }}>

              {/* Badge */}
              {plan.badge && (
                <div style={{
                  position: 'absolute',
                  top: -12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: plan.badgeBg,
                  color: plan.badgeColor,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  padding: '5px 14px',
                  borderRadius: 20,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(26,26,26,0.15)',
                }}>
                  {plan.badge}
                </div>
              )}

              {/* Plan Name */}
              <div style={{ fontSize: 13, fontWeight: 800, color: plan.accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, marginTop: 8 }}>
                {plan.name}
              </div>

              {/* Tagline */}
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '0.5px solid rgba(26,26,26,0.1)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.4, margin: 0, letterSpacing: -0.2 }}>
                  {plan.taglineEn}
                </p>
              </div>

              {/* Price */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: -1.5, color: '#1A1A1A' }}>{plan.price}</span>
                <span style={{ fontSize: 14, color: 'rgba(26,26,26,0.5)', marginLeft: 4 }}>{plan.period}</span>
              </div>

              {/* Real Interview badge */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 11, padding: '5px 11px', background: '#FFFFFF', borderRadius: 20, border: `0.5px solid ${plan.border}`, color: '#1A1A1A', fontWeight: 600, display: 'inline-block' }}>
                  {plan.mode}
                </span>
              </div>

              {/* Duration + Sessions boxes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
                <div style={{ background: plan.accent, borderRadius: 12, padding: '14px 10px', textAlign: 'center', boxShadow: '0 4px 14px rgba(204,120,92,0.25)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>⏱ Duration</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: -1 }}>
                    {plan.duration}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2 }}>{plan.durationUnit}</span>
                  </div>
                </div>
                <div style={{ background: '#1A1A1A', borderRadius: 12, padding: '14px 10px', textAlign: 'center', boxShadow: '0 4px 14px rgba(26,26,26,0.25)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(245,241,235,0.7)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>🔁 Sessions</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#F5F1EB', lineHeight: 1, letterSpacing: -1 }}>{plan.sessions}</div>
                  <div style={{ fontSize: 9, color: 'rgba(245,241,235,0.6)', fontWeight: 500, marginTop: 2 }}>{plan.sessionsLabel}</div>
                </div>
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: 24 }}>
                {plan.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, fontSize: 13, color: 'rgba(26,26,26,0.8)', lineHeight: 1.5 }}>
                    <span style={{
                      color: '#fff',
                      background: plan.accent,
                      flexShrink: 0,
                      marginTop: 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 900,
                    }}>✓</span>
                    {f}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => router.push('/onboarding')}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: plan.ctaBg,
                  border: 'none',
                  borderRadius: 10,
                  color: plan.ctaColor,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: -0.2,
                  boxShadow: '0 4px 12px rgba(204,120,92,0.25)',
                }}>
                {plan.cta} →
              </button>
            </div>
          ))}
        </div>

        {/* Bottom Quote */}
        <div style={{ textAlign: 'center', maxWidth: 500, marginTop: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8, color: '#1A1A1A', lineHeight: 1.4 }}>
            Anyone can <span style={{ color: 'rgba(26,26,26,0.35)' }}>practice.</span>
            <br />
            <span style={{ color: '#1A1A1A' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span> makes you <span style={{ color: '#CC785C' }}>ready.</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.4)', marginTop: 12 }}>
            The closest thing to a real interview.
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer style={{ background: '#EDE6D8', borderTop: '0.5px solid #E5DDD0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>
          <span style={{ color: '#1A1A1A' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>© 2026 Barbaros. All rights reserved.</div>
      </footer>

    </div>
  )
}
