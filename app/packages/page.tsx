'use client'

import { useRouter } from 'next/navigation'

const PLANS = [
  {
    id: 'go',
    name: 'GO',
    price: '$4.99',
    period: '/session',
    bg: 'rgba(204,120,92,0.06)',
    border: '#E8B8A8',
    borderWidth: '1px',
    accent: '#CC785C',
    badge: 'PAY AS YOU GO',
    badgeBg: 'rgba(204,120,92,0.15)',
    badgeColor: '#CC785C',
    scale: 1,
    duration: '15',
    durationUnit: 'min',
    sessions: '1',
    sessionsLabel: 'single session',
    // Layer 1 — value snapshot (scan layer)
    snapshot: 'Core Interview · Instant Scoring · Hiring Signal',
    // Layer 2 — positioning (value framing)
    valueLine: 'Fast, structured practice designed to build clarity and confidence under real interview conditions.',
    // Layer 3 — differentiators only
    highlights: [
      'Language Support',
      'Standard Interview Flow',
      'Instant Session Playback',
    ],
    cta: 'Start Session',
    ctaBg: '#CC785C',
    ctaColor: '#fff',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19.99',
    period: '/mo',
    bg: 'rgba(204,120,92,0.15)',
    border: '#CC785C',
    borderWidth: '2px',
    accent: '#CC785C',
    badge: 'MOST POPULAR',
    badgeBg: '#CC785C',
    badgeColor: '#fff',
    scale: 1.05,
    duration: '30',
    durationUnit: 'min',
    sessions: '10',
    sessionsLabel: 'per month',
    snapshot: 'Behavioral Depth · Competency Mapping · Performance Feedback',
    valueLine: 'Deeper evaluation with behavioral insights and structured competency analysis for measurable improvement.',
    highlights: [
      'Behavioral Analysis Engine',
      'Competency-Based Scoring',
      'Structured Feedback Report',
    ],
    cta: 'Get Pro',
    ctaBg: '#CC785C',
    ctaColor: '#fff',
  },
  {
    id: 'expert',
    name: 'Expert',
    price: '$59',
    period: '/mo',
    bg: 'rgba(168,90,66,0.18)',
    border: '#A85A42',
    borderWidth: '2.5px',
    accent: '#A85A42',
    badge: 'PREMIUM',
    badgeBg: '#1A1A1A',
    badgeColor: '#F5F1EB',
    scale: 1,
    duration: '45',
    durationUnit: 'min',
    sessions: '20',
    sessionsLabel: 'per month',
    snapshot: 'Executive Assessment · Longitudinal Profiling · Strategic Report',
    valueLine: 'Comprehensive executive-level evaluation with longitudinal insight and decision-grade feedback.',
    highlights: [
      'Executive-Level Assessment Model',
      'Longitudinal Candidate Profiling',
      'Priority Review Pipeline',
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

      <main style={{ flex: 1, padding: '72px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64, maxWidth: 680 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(204,120,92,0.1)', border: '0.5px solid rgba(204,120,92,0.3)', borderRadius: 20, padding: '5px 14px', marginBottom: 24, fontSize: 11, color: '#CC785C', fontWeight: 600, letterSpacing: 1 }}>
            PRICING
          </div>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 50px)', fontWeight: 900, lineHeight: 1.08, margin: '0 0 20px', letterSpacing: -1.5, color: '#1A1A1A' }}>
            Enter Prepared. <span style={{ color: '#CC785C' }}>Leave Assessed.</span>
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(26,26,26,0.7)', maxWidth: 600, lineHeight: 1.7, margin: '0 auto 16px' }}>
            A specialized interview intelligence system, engineered to replicate the depth, pressure, and evaluation standards of real hiring processes.
          </p>
          <p style={{ fontSize: 13, color: 'rgba(26,26,26,0.45)', maxWidth: 540, lineHeight: 1.6, margin: '0 auto', fontWeight: 600, letterSpacing: 0.2 }}>
            Voice-based interviews. Realistic pressure. Professional-grade evaluation.
          </p>
        </div>

        {/* Plans Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 24, maxWidth: 1040, width: '100%', marginBottom: 72, alignItems: 'stretch' }}>
          {PLANS.map((plan) => (
            <div key={plan.name} style={{
              background: plan.bg,
              border: `${plan.borderWidth} solid ${plan.border}`,
              borderRadius: 18,
              padding: '36px 28px',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'visible',
              transform: `scale(${plan.scale})`,
              boxShadow: plan.scale > 1 ? '0 16px 48px rgba(204,120,92,0.22)' : '0 4px 18px rgba(26,26,26,0.05)',
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
                  letterSpacing: 1.4,
                  padding: '5px 14px',
                  borderRadius: 20,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(26,26,26,0.12)',
                }}>
                  {plan.badge}
                </div>
              )}

              {/* Plan Name */}
              <div style={{ fontSize: 13, fontWeight: 800, color: plan.accent, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 18, marginTop: 8 }}>
                {plan.name}
              </div>

              {/* Price */}
              <div style={{ marginBottom: 18, paddingBottom: 20, borderBottom: '0.5px solid rgba(26,26,26,0.1)' }}>
                <span style={{ fontSize: 46, fontWeight: 900, letterSpacing: -2, color: '#1A1A1A' }}>{plan.price}</span>
                <span style={{ fontSize: 14, color: 'rgba(26,26,26,0.5)', marginLeft: 4 }}>{plan.period}</span>
              </div>

              {/* Layer 1 — Value Snapshot */}
              <div style={{ fontSize: 12.5, fontWeight: 800, color: plan.accent, letterSpacing: 0.2, lineHeight: 1.5, marginBottom: 12 }}>
                {plan.snapshot}
              </div>

              {/* Layer 2 — Value Framing */}
              <div style={{ fontSize: 13.5, color: 'rgba(26,26,26,0.72)', lineHeight: 1.6, marginBottom: 24 }}>
                {plan.valueLine}
              </div>

              {/* Duration + Sessions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 26 }}>
                <div style={{ background: plan.accent, borderRadius: 12, padding: '15px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.8)', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Duration</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: -1 }}>
                    {plan.duration}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2 }}>{plan.durationUnit}</span>
                  </div>
                </div>
                <div style={{ background: '#1A1A1A', borderRadius: 12, padding: '15px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9.5, color: 'rgba(245,241,235,0.7)', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Sessions</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#F5F1EB', lineHeight: 1, letterSpacing: -1 }}>{plan.sessions}</div>
                  <div style={{ fontSize: 9, color: 'rgba(245,241,235,0.6)', fontWeight: 500, marginTop: 3 }}>{plan.sessionsLabel}</div>
                </div>
              </div>

              {/* Layer 3 — Feature Highlights (selective) */}
              <div style={{ flex: 1, marginBottom: 28 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(26,26,26,0.4)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>
                  Feature Highlights
                </div>
                {plan.highlights.map((f, i) => (
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
                onClick={() => router.push(`/onboarding?plan=${plan.id}`)}
                style={{
                  width: '100%',
                  padding: '15px',
                  background: plan.ctaBg,
                  border: 'none',
                  borderRadius: 10,
                  color: plan.ctaColor,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: -0.2,
                  boxShadow: '0 4px 12px rgba(204,120,92,0.22)',
                }}>
                {plan.cta} →
              </button>
            </div>
          ))}
        </div>

        {/* Bottom Quote */}
        <div style={{ textAlign: 'center', maxWidth: 500, marginTop: 8 }}>
          <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: -0.5, marginBottom: 10, color: '#1A1A1A', lineHeight: 1.4 }}>
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
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>© 2026 Rolevance. All rights reserved.</div>
      </footer>

    </div>
  )
}
