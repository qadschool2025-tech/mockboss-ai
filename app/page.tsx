'use client'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()

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
        <div style={{ fontWeight: 800, fontSize: 20 }}>
          Mock<span style={{ color: '#E85D2F' }}>Boss</span> AI
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => router.push('/packages')}
            style={{ background: 'none', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#F0EDE8', padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
          >
            Pricing
          </button>
          <button
            onClick={() => router.push('/onboarding')}
            style={{ background: '#E85D2F', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
          >
            Start Interview
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px 40px', textAlign: 'center' }}>

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(232,93,47,0.08)',
          border: '0.5px solid rgba(232,93,47,0.25)',
          borderRadius: 20, padding: '5px 14px', marginBottom: 28,
          fontSize: 11, color: '#E85D2F', fontWeight: 600, letterSpacing: 0.3
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E85D2F', display: 'inline-block' }} />
          Built with certified HR professionals · Trusted worldwide
        </div>

        {/* Headline — الجملة الأصلية */}
        <h1 style={{
          fontSize: 'clamp(32px, 6vw, 64px)',
          fontWeight: 900,
          lineHeight: 1.1,
          margin: '0 0 20px 0',
          maxWidth: 780,
          letterSpacing: -1
        }}>
          Walk into your next interview<br />
          <span style={{ color: '#E85D2F' }}>ready to get hired.</span>
        </h1>

        {/* Subtitle */}
        <p style={{ fontSize: 17, color: 'rgba(240,237,232,0.55)', maxWidth: 520, lineHeight: 1.7, marginBottom: 12 }}>
          AI-powered mock interviews with real voice, real pressure, and honest feedback — conducted by a certified HR evaluator.
        </p>

        {/* Credibility lines */}
        <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.3)', maxWidth: 480, lineHeight: 1.6, marginBottom: 36, fontStyle: 'italic' }}>
          "Most candidates fail not because of lack of skill, but lack of preparation."<br />
          "One real interview simulation is worth ten mock attempts."
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 56 }}>
          <button
            onClick={() => router.push('/onboarding')}
            style={{
              background: '#E85D2F', border: 'none', borderRadius: 10,
              color: '#fff', padding: '14px 32px', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.2
            }}
          >
            Start Your Interview →
          </button>
          <button
            onClick={() => router.push('/packages')}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.15)',
              borderRadius: 10, color: '#F0EDE8',
              padding: '14px 28px', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            View Pricing
          </button>
        </div>

        {/* Stats */}
        <div style={{
          display: 'flex', gap: 48, justifyContent: 'center',
          flexWrap: 'wrap', marginBottom: 60
        }}>
          {[
            { value: '10K+', label: 'Interviews conducted' },
            { value: '94%', label: 'Success rate' },
            { value: '4.9★', label: 'User rating' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 900, letterSpacing: -1 }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.4)', marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14, maxWidth: 860, width: '100%', marginBottom: 60
        }}>
          {[
            { icon: '🎙️', title: 'Real Voice', desc: 'Your evaluator speaks to you in a real human voice — not text' },
            { icon: '📄', title: 'CV-Aware', desc: 'Reads your CV and asks targeted, specific questions' },
            { icon: '📊', title: 'Detailed Report', desc: '7-criteria assessment with Arabic & English feedback' },
            { icon: '⚡', title: 'Instant Feedback', desc: 'Live scoring after every answer' },
          ].map(f => (
            <div key={f.title} style={{
              background: '#111520',
              border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 12, padding: '18px 20px', textAlign: 'left'
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* HR Evaluator intro */}
        <div style={{
          background: '#111520',
          border: '0.5px solid rgba(42,92,255,0.2)',
          borderRadius: 14, padding: '20px 24px', maxWidth: 560, width: '100%',
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40
        }}>
          <div style={{
            width: 56, height: 56, background: '#2563EB',
            borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 24, flexShrink: 0
          }}>🎯</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Your Institution — HR</div>
            <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)', marginBottom: 6 }}>Certified Interview Evaluator · MockBoss AI</div>
            <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.6)', lineHeight: 1.5 }}>
              "I won't hold back. I'll push you, challenge your answers, and give you the honest evaluation you need to land your next role."
            </div>
          </div>
        </div>

        {/* Slogan above packages */}
        <div style={{
          fontSize: 15, fontWeight: 600,
          color: 'rgba(240,237,232,0.7)',
          fontStyle: 'italic', marginBottom: 20,
          textAlign: 'center'
        }}>
          "Invest less than a cup of coffee — and drink it tomorrow with your new team"
        </div>

        {/* Packages teaser */}
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20
        }}>
          {[
            { name: 'GO', price: '$2.50', desc: 'Single session · 15 min' },
            { name: 'Pro', price: '$12/mo', desc: '10 sessions · 30 min each' },
            { name: 'Expert', price: '$36/mo', desc: '20 sessions · 60 min each' },
          ].map((pkg, i) => (
            <div
              key={pkg.name}
              onClick={() => router.push('/packages')}
              style={{
                background: i === 1 ? 'rgba(42,92,255,0.1)' : '#111318',
                border: i === 1 ? '0.5px solid rgba(42,92,255,0.35)' : '0.5px solid rgba(255,255,255,0.07)',
                borderRadius: 10, padding: '12px 20px', cursor: 'pointer', textAlign: 'center',
                minWidth: 140
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14 }}>{pkg.name}</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: i === 1 ? '#8B96FF' : '#F0EDE8', margin: '4px 0' }}>{pkg.price}</div>
              <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)' }}>{pkg.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.25)', marginBottom: 48 }}>
          All plans include real voice · No free tier · Cancel anytime
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
        <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.25)' }}>
          © 2025 MockBoss AI · Built with certified HR professionals
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {['Privacy', 'Terms', 'Contact'].map(l => (
            <span key={l} style={{ fontSize: 11, color: 'rgba(240,237,232,0.3)', cursor: 'pointer' }}>{l}</span>
          ))}
        </div>
      </footer>

    </div>
  )
}
