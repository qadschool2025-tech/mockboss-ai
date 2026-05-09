'use client'

import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: -0.5 }}>
          Hi<span style={{ color: '#E85D2F' }}>rix</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => router.push('/packages')}
            style={{ background: 'none', border: 'none', color: 'rgba(240,237,232,0.5)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Pricing
          </button>
          <button onClick={() => router.push('/onboarding')}
            style={{ background: '#E85D2F', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
            Get Started
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>

        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(232,93,47,0.1)', border: '0.5px solid rgba(232,93,47,0.3)', borderRadius: 20, padding: '5px 14px', marginBottom: 32, fontSize: 11, color: '#E85D2F', fontWeight: 600, letterSpacing: 0.5 }}>
          ● AI-POWERED INTERVIEW PLATFORM
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 20px', letterSpacing: -1, maxWidth: 700 }}>
          Walk into your next interview
          <span style={{ color: '#E85D2F' }}> ready to get hired.</span>
        </h1>

        {/* Subheadline */}
        <p style={{ fontSize: 16, color: 'rgba(240,237,232,0.5)', maxWidth: 480, lineHeight: 1.7, margin: '0 0 40px' }}>
          Practice with Adam Reid — your AI interview evaluator. Real questions. Real voice. Real feedback.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 60 }}>
          <button onClick={() => router.push('/onboarding')}
            style={{ background: '#E85D2F', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, padding: '14px 32px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: -0.3 }}>
            Start Free Interview →
          </button>
          <button onClick={() => router.push('/packages')}
            style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.12)', color: '#F0EDE8', fontSize: 15, fontWeight: 600, padding: '14px 32px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
            View Plans
          </button>
        </div>

        {/* 🔥 Quote 1 — بعد Hero مباشرة */}
        <div style={{ width: '100%', maxWidth: 700, marginBottom: 60, background: 'linear-gradient(135deg, rgba(232,93,47,0.08), rgba(232,93,47,0.03))', border: '0.5px solid rgba(232,93,47,0.2)', borderRadius: 16, padding: '32px 24px' }}>
          <div style={{ fontSize: 11, color: '#E85D2F', fontWeight: 700, letterSpacing: 2, marginBottom: 16, textTransform: 'uppercase' }}>Why Hirix?</div>
          <div style={{ fontSize: 'clamp(18px, 3vw, 26px)', fontWeight: 900, lineHeight: 1.4, letterSpacing: -0.5 }}>
            "ChatGPT will <span style={{ color: 'rgba(240,237,232,0.35)', textDecoration: 'line-through' }}>chat</span> with you.
            <br />
            Hirix will <span style={{ color: '#E85D2F' }}>hire</span> you."
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 60 }}>
          {[
            { value: '10K+', label: 'Interviews conducted' },
            { value: '94%', label: 'Success rate' },
            { value: '4.9★', label: 'User rating' },
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.35)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, maxWidth: 700, width: '100%', marginBottom: 60 }}>
          {[
            { icon: '🎙️', title: 'Real Voice Interview', desc: 'Speak directly with Adam Reid. Your confidence is measured live.' },
            { icon: '⚡', title: 'Instant Scoring', desc: 'Every answer scored in real-time. No waiting.' },
            { icon: '📊', title: 'Full Report', desc: 'Detailed performance analysis after every session.' },
            { icon: '🌐', title: 'Any Language', desc: 'Arabic, English, or both. You choose.' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#0F1117', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '20px 16px', textAlign: 'left' }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Plans Preview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, maxWidth: 700, width: '100%', marginBottom: 60 }}>
          {[
            { name: 'Free', price: '$0', note: '📝 Text only · 10 min', border: 'rgba(255,255,255,0.07)', bg: 'rgba(255,255,255,0.03)' },
            { name: 'GO', price: '$9', note: '🎙️ Voice · 15 min', border: 'rgba(232,93,47,0.25)', bg: 'rgba(232,93,47,0.06)' },
            { name: 'Pro', price: '$19', note: '🎙️ Voice · 30 min', border: 'rgba(37,99,235,0.25)', bg: 'rgba(37,99,235,0.06)' },
            { name: 'Expert', price: '$39', note: '🎙️ Voice · 60 min', border: 'rgba(139,150,255,0.25)', bg: 'rgba(139,150,255,0.06)' },
          ].map((plan, i) => (
            <div key={i} style={{ background: plan.bg, border: `0.5px solid ${plan.border}`, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
                {plan.price}<span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(240,237,232,0.4)' }}>/mo</span>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(240,237,232,0.4)' }}>{plan.note}</div>
            </div>
          ))}
        </div>

        {/* 🔥 Quote 2 — قبل الزر الأخير */}
        <div style={{ width: '100%', maxWidth: 700, marginBottom: 40, background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(139,150,255,0.04))', border: '0.5px solid rgba(139,150,255,0.2)', borderRadius: 16, padding: '32px 24px' }}>
          <div style={{ fontSize: 'clamp(18px, 3vw, 26px)', fontWeight: 900, lineHeight: 1.4, letterSpacing: -0.5, marginBottom: 8 }}>
            "Anyone can <span style={{ color: 'rgba(240,237,232,0.35)' }}>practice.</span>
            <br />
            Hirix makes you <span style={{ color: '#8B96FF' }}>ready.</span>"
          </div>
          <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.3)', marginTop: 12 }}>The closest thing to a real interview.</div>
        </div>

        {/* Final CTA */}
        <button onClick={() => router.push('/onboarding')}
          style={{ background: '#E85D2F', border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, padding: '16px 40px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: -0.3, marginBottom: 60 }}>
          Start Free Interview →
        </button>

      </main>

      {/* Footer */}
      <footer style={{ background: '#0D0F14', borderTop: '0.5px solid rgba(255,255,255,0.04)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Hi<span style={{ color: '#E85D2F' }}>rix</span></div>
        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.2)' }}>© 2026 Hirix. All rights reserved.</div>
        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.2)' }}>Powered by AI</div>
      </footer>

    </div>
  )
}
