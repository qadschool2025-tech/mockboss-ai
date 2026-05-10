'use client'
import { useRouter } from 'next/navigation'

export default function PackagesPage() {
  const router = useRouter()

  const plans = [
    {
      name: 'GO',
      price: '$2.50',
      period: 'per session',
      desc: 'Pay as you go',
      duration: '15 min',
      sessions: '1 session',
      color: '#E85D2F',
      features: [
        '🎙️ Real Interview',
        '📄 CV Analysis',
        '📊 Full Report',
        '⚡ Live Scoring',
        '🌍 Arabic & English',
      ],
      cta: 'Start Now',
      highlight: false,
    },
    {
      name: 'Pro',
      price: '$12',
      period: '/month',
      desc: 'Most popular',
      duration: '30 min',
      sessions: '10 sessions',
      color: '#2563EB',
      features: [
        '🎙️ Real Interview',
        '📄 CV Analysis',
        '📊 Full Report',
        '⚡ Live Scoring',
        '🌍 Arabic & English',
        '📈 Progress Tracking',
      ],
      cta: 'Get Pro',
      highlight: true,
    },
    {
      name: 'Expert',
      price: '$36',
      period: '/month',
      desc: 'Full preparation',
      duration: '60 min',
      sessions: '20 sessions',
      color: '#7C3AED',
      features: [
        '🎙️ Real Interview',
        '📄 CV Analysis',
        '📊 Full Report',
        '⚡ Live Scoring',
        '🌍 Arabic & English',
        '📈 Progress Tracking',
        '🏆 Priority Support',
      ],
      cta: 'Get Expert',
      highlight: false,
    },
  ]

  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      background: '#0B0D11',
      color: '#F0EDE8',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>

      {/* Nav */}
      <nav style={{
        background: '#0F1117',
        borderBottom: '0.5px solid rgba(255,255,255,0.07)',
        padding: '14px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div
          onClick={() => router.push('/')}
          style={{ fontWeight: 800, fontSize: 20, cursor: 'pointer' }}
        >
          Mock<span style={{ color: '#E85D2F' }}>Boss</span> AI
        </div>
        <button
          onClick={() => router.push('/onboarding')}
          style={{ background: '#E85D2F', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
        >
          Start Interview
        </button>
      </nav>

      <main style={{ flex: 1, padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(232,93,47,0.08)',
            border: '0.5px solid rgba(232,93,47,0.25)',
            borderRadius: 20, padding: '5px 14px', marginBottom: 20,
            fontSize: 11, color: '#E85D2F', fontWeight: 600
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E85D2F', display: 'inline-block' }} />
            No free tier · Real voice on all plans
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, marginBottom: 12, letterSpacing: -1 }}>
            Choose Your Plan
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(240,237,232,0.5)', maxWidth: 440 }}>
            Every plan includes a real voice interview, CV analysis, and a full report.
          </p>
        </div>

        {/* Slogan */}
        <div style={{
          fontSize: 15, fontWeight: 600,
          color: 'rgba(240,237,232,0.65)',
          fontStyle: 'italic',
          marginBottom: 40,
          textAlign: 'center',
          maxWidth: 500
        }}>
          "Invest less than a cup of coffee — and drink it tomorrow with your new team"
        </div>

        {/* Plans */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16, maxWidth: 900, width: '100%'
        }}>
          {plans.map(plan => (
            <div
              key={plan.name}
              style={{
                background: plan.highlight ? 'rgba(37,99,235,0.08)' : '#111318',
                border: plan.highlight ? '1px solid rgba(37,99,235,0.4)' : '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 16, padding: '28px 24px',
                display: 'flex', flexDirection: 'column',
                position: 'relative', overflow: 'hidden'
              }}
            >
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: '#2563EB', borderRadius: 20,
                  padding: '3px 10px', fontSize: 10, fontWeight: 700
                }}>
                  POPULAR
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: plan.color, marginBottom: 4 }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 900 }}>{plan.price}</span>
                  <span style={{ fontSize: 13, color: 'rgba(240,237,232,0.4)' }}>{plan.period}</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)', marginBottom: 8 }}>{plan.desc}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 8px' }}>⏱ {plan.duration}</span>
                  <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 8px' }}>🔁 {plan.sessions}</span>
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ fontSize: 13, color: 'rgba(240,237,232,0.7)' }}>{f}</div>
                ))}
              </div>

              <button
                onClick={() => router.push('/onboarding')}
                style={{
                  background: plan.highlight ? '#2563EB' : plan.name === 'GO' ? '#E85D2F' : 'rgba(255,255,255,0.06)',
                  border: plan.highlight ? 'none' : plan.name === 'GO' ? 'none' : '0.5px solid rgba(255,255,255,0.15)',
                  borderRadius: 10, color: '#fff',
                  padding: '12px', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', width: '100%'
                }}
              >
                {plan.cta} →
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, fontSize: 12, color: 'rgba(240,237,232,0.25)', textAlign: 'center' }}>
          All plans include real voice · Cancel anytime · Secure payment
        </div>

      </main>

      {/* Footer */}
      <footer style={{
        background: '#0D0F14',
        borderTop: '0.5px solid rgba(255,255,255,0.05)',
        padding: '16px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 8
      }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          Mock<span style={{ color: '#E85D2F' }}>Boss</span> AI
        </div>
        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.25)' }}>© 2025 MockBoss AI</div>
        <div style={{ display: 'flex', gap: 16 }}>
          {['Privacy', 'Terms', 'Contact'].map(l => (
            <span key={l} style={{ fontSize: 11, color: 'rgba(240,237,232,0.3)', cursor: 'pointer' }}>{l}</span>
          ))}
        </div>
      </footer>

    </div>
  )
}
