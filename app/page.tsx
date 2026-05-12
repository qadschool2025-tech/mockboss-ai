'use client'

import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#F5F1EB', color: '#1A1A1A', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ background: '#F5F1EB', borderBottom: '0.5px solid #E5DDD0', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: -0.5 }}>
          <span style={{ color: '#1A1A1A' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => router.push('/packages')}
            style={{ background: 'none', border: 'none', color: 'rgba(26,26,26,0.6)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Pricing
          </button>
          <button onClick={() => router.push('/onboarding')}
            style={{ background: '#1A1A1A', border: 'none', color: '#F5F1EB', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
            Get Started
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>

        {/* Trust Badge */}
        <div style={{ width: '100%', maxWidth: 700, marginBottom: 32, background: '#F5F1EB', border: '0.5px solid #E5DDD0', borderRadius: 12, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ fontSize: 20 }}>🏛️</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(26,26,26,0.85)', marginBottom: 3 }}>
              Built with certified HR professionals.
            </div>
            <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', lineHeight: 1.5 }}>
              Trusted by hiring managers across the USA, Australia, Canada, UK, Europe, South Africa, and beyond.
            </div>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 20px', letterSpacing: -1, maxWidth: 700, color: '#1A1A1A' }}>
          Walk into your next interview
          <span style={{ color: '#CC785C' }}> ready to get hired.</span>
        </h1>

        {/* Quote 1 */}
        <div style={{ width: '100%', maxWidth: 600, marginBottom: 32, background: 'linear-gradient(135deg, rgba(204,120,92,0.08), rgba(204,120,92,0.03))', border: '0.5px solid rgba(204,120,92,0.25)', borderRadius: 16, padding: '24px' }}>
          <div style={{ fontSize: 11, color: '#CC785C', fontWeight: 700, letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' }}>Why Barbaros?</div>
          <div style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 900, lineHeight: 1.5, letterSpacing: -0.5, color: '#1A1A1A' }}>
            ChatGPT will <span style={{ color: 'rgba(26,26,26,0.35)', textDecoration: 'line-through' }}>chat</span> with you.
            <br />
            <span style={{ color: '#1A1A1A' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span> will <span style={{ color: '#CC785C' }}>hire</span> you.
          </div>
        </div>

        {/* Subheadline */}
        <div style={{ maxWidth: 560, margin: '0 0 24px' }}>
          <p style={{ fontSize: 17, color: '#1A1A1A', fontWeight: 700, lineHeight: 1.5, margin: '0 0 12px', letterSpacing: -0.3 }}>
            For less than the price of a coffee — we'll make sure you sip the next one with your <span style={{ color: '#CC785C' }}>new team</span>. ☕
          </p>
          <p style={{ fontSize: 14, color: 'rgba(26,26,26,0.65)', lineHeight: 1.7, margin: '0 0 8px' }}>
            Real interviews. Real standards. Detailed reports.
          </p>
          <p style={{ fontSize: 14, color: 'rgba(26,26,26,0.65)', lineHeight: 1.7, margin: 0, fontStyle: 'italic' }}>
            When opportunity knocks, be the one who's ready.
          </p>
        </div>

        {/* Global Reach */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: 15 }}>🌍</span>
          <span style={{ fontSize: 13, color: 'rgba(26,26,26,0.55)', lineHeight: 1.6, textAlign: 'center' }}>
            Available for job seekers in the{' '}
            <strong style={{ color: '#1A1A1A', fontWeight: 700 }}>USA, Australia, Canada, UK, Europe & beyond.</strong>
            <br />
            Interviews in{' '}
            <strong style={{ color: '#CC785C', fontWeight: 700 }}>your language.</strong>
          </span>
        </div>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 60 }}>
          <button onClick={() => router.push('/onboarding')}
            style={{ background: '#CC785C', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, padding: '14px 32px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: -0.3 }}>
            Get Started →
          </button>
          <button onClick={() => router.push('/packages')}
            style={{ background: 'transparent', border: '0.5px solid #E5DDD0', color: '#1A1A1A', fontSize: 15, fontWeight: 600, padding: '14px 32px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
            View Plans
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 60 }}>
          {[
            { value: '10K+', label: 'Interviews conducted' },
            { value: '94%', label: 'Success rate' },
            { value: '4.9★', label: 'User rating' },
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#1A1A1A' }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.45)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, maxWidth: 700, width: '100%', marginBottom: 60 }}>
          {[
            { icon: '🎙️', title: 'Real Voice Interview', desc: 'Speak directly with Adam Reid. Your confidence is measured live.' },
            { icon: '⚡', title: 'Instant Scoring', desc: 'Every answer scored in real-time. No waiting.' },
            { icon: '📊', title: 'Full Report', desc: 'Detailed performance analysis after every session.' },
            { icon: '🌐', title: 'Any Language', desc: 'Interview in the language you\'re most confident in.' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#FFFFFF', border: '0.5px solid #E5DDD0', borderRadius: 12, padding: '20px 16px', textAlign: 'left' }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#1A1A1A' }}>{f.title}</div>
              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.55)', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Quote 2 */}
        <div style={{ width: '100%', maxWidth: 700, marginBottom: 40, background: 'linear-gradient(135deg, rgba(204,120,92,0.06), rgba(204,120,92,0.02))', border: '0.5px solid #E5DDD0', borderRadius: 16, padding: '32px 24px' }}>
          <div style={{ fontSize: 'clamp(18px, 3vw, 26px)', fontWeight: 900, lineHeight: 1.4, letterSpacing: -0.5, marginBottom: 8, color: '#1A1A1A' }}>
            Anyone can <span style={{ color: 'rgba(26,26,26,0.35)' }}>practice.</span>
            <br />
            <span style={{ color: '#1A1A1A' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span> makes you <span style={{ color: '#CC785C' }}>ready.</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.4)', marginTop: 12 }}>The closest thing to a real interview.</div>
        </div>

        {/* Final CTA */}
        <button onClick={() => router.push('/onboarding')}
          style={{ background: '#CC785C', border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, padding: '16px 40px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: -0.3, marginBottom: 60 }}>
          Get Started →
        </button>

      </main>

      {/* Footer */}
      <footer style={{ background: '#EDE6D8', borderTop: '0.5px solid #E5DDD0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>
          <span style={{ color: '#1A1A1A' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>© 2026 Barbaros. All rights reserved.</div>
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>Powered by AI</div>
      </footer>

    </div>
  )
}
