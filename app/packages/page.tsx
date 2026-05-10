'use client'

import { useRouter } from 'next/navigation'

const PLANS = [
  {
    name: 'GO',
    price: '$2.50',
    period: '/session',
    color: 'rgba(232,93,47,0.06)',
    border: 'rgba(232,93,47,0.35)',
    accent: '#E85D2F',
    badge: 'TRY IT NOW',
    mode: '🎙️ Real Voice',
    duration: '15 min',
    sessions: 'Pay as you go',
    features: [
      'Live voice interview with Adam Reid',
      'Voice confidence & hesitation analysis',
      'Instant scoring per answer',
      'Full performance report',
      'No commitment — pay per session',
    ],
    cta: 'Start Session',
    ctaBg: '#E85D2F',
  },
  {
    name: 'Pro',
    price: '$12',
    period: '/mo',
    color: 'rgba(37,99,235,0.06)',
    border: 'rgba(37,99,235,0.35)',
    accent: '#2563EB',
    badge: 'MOST POPULAR',
    mode: '🎙️ Real Voice',
    duration: '30 min',
    sessions: '10 sessions/month',
    features: [
      'Live voice interview with Adam Reid',
      'Voice confidence & hesitation analysis',
      'Full performance report',
      'CV-based targeted questions',
      '10 sessions per month',
    ],
    cta: 'Get Pro',
    ctaBg: '#2563EB',
  },
  {
    name: 'Expert',
    price: '$36',
    period: '/mo',
    color: 'rgba(139,150,255,0.06)',
    border: 'rgba(139,150,255,0.35)',
    accent: '#8B96FF',
    badge: 'BEST VALUE',
    mode: '🎙️ Real Voice',
    duration: '60 min',
    sessions: '20 sessions/month',
    features: [
      'Live voice interview with Adam Reid',
      'Voice confidence & hesitation analysis',
      'Full detailed performance report',
      'CV-based targeted questions',
      '20 sessions per month',
      'Priority processing',
    ],
    cta: 'Go Expert',
    ctaBg: 'linear-gradient(135deg, #8B96FF, #2563EB)',
  },
]

export default function PackagesPage() {
  const router = useRouter()

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div onClick={() => router.push('/')} style={{ fontWeight: 900, fontSize: 22, letterSpacing: -0.5, cursor: 'pointer' }}>
          Barbar<span style={{ color: '#E85D2F' }}>os</span>
        </div>
        <button onClick={() => router.push('/onboarding')}
          style={{ background: '#E85D2F', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
          Get Started
        </button>
      </nav>

      <main style={{ flex: 1, padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(232,93,47,0.1)', border: '0.5px solid rgba(232,93,47,0.3)', borderRadius: 20, padding: '5px 14px', marginBottom: 20, fontSize: 11, color: '#E85D2F', fontWeight: 600, letterSpacing: 0.5 }}>
            ● PRICING
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 16px', letterSpacing: -1 }}>
            Choose your <span style={{ color: '#E85D2F' }}>interview room</span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(240,237,232,0.5)', maxWidth: 420, lineHeight: 1.7, margin: '0 auto' }}>
            Every plan includes real voice interviews with Adam Reid. No text-only mode.
          </p>
        </div>

        {/* Plans Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: 900, width: '100%', marginBottom: 60 }}>
          {PLANS.map((plan) => (
            <div key={plan.name} style={{ background: plan.color, border: `1px solid ${plan.border}`, borderRadius: 16, padding: '28px 22px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

              {/* Badge */}
              {plan.badge && (
                <div style={{ position: 'absolute', top: 14, right: 14, background: plan.accent, color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 20 }}>
                  {plan.badge}
                </div>
              )}

              {/* Plan Name */}
              <div style={{ fontSize: 13, fontWeight: 800, color: plan.accent, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                {plan.name}
              </div>

              {/* Price */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1 }}>{plan.price}</span>
                <span style={{ fontSize: 14, color: 'rgba(240,237,232,0.4)' }}>{plan.period}</span>
              </div>

              {/* Mode + Duration */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: 20, border: '0.5px solid rgba(255,255,255,0.1)' }}>
                  {plan.mode}
                </span>
                <span style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: 20, border: '0.5px solid rgba(255,255,255,0.1)' }}>
                  ⏱ {plan.duration}
                </span>
                <span style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: 20, border: '0.5px solid rgba(255,255,255,0.1)' }}>
                  🔁 {plan.sessions}
                </span>
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: 24 }}>
                {plan.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, fontSize: 13, color: 'rgba(240,237,232,0.75)', lineHeight: 1.5 }}>
                    <span style={{ color: plan.accent, flexShrink: 0, marginTop: 1 }}>✓</span>
                    {f}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => router.push('/onboarding')}
                style={{ width: '100%', padding: '13px', background: plan.ctaBg, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                {plan.cta} →
              </button>
            </div>
          ))}
        </div>

        {/* Bottom Quote */}
        <div style={{ textAlign: 'center', maxWidth: 500 }}>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>
            Anyone can practice.
            <br />
            <span style={{ color: '#E85D2F' }}>Barbaros makes you ready.</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.25)', marginTop: 12 }}>
            The closest thing to a real interview.
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
