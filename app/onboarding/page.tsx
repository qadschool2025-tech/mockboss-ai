'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface OnboardingData {
  candidateName: string
  jobTitle: string
  institution: string
  sector: string
  yearsExperience: string
  language: 'en' | 'ar' | 'mixed'
  jobRequirements: string
  cvText: string
  plan: 'go' | 'pro' | 'expert'
}

const SECTORS = [
  'Education', 'Healthcare', 'Technology', 'Finance', 'Engineering',
  'Government', 'Marketing', 'Legal', 'Construction', 'Retail', 'Other'
]

const EXPERIENCE_LEVELS = [
  'Less than 1 year', '1-3 years', '3-5 years', '5-10 years', '10+ years'
]

const STEPS = [
  { id: 1, label: 'Personal Info', icon: '👤' },
  { id: 2, label: 'Job Details', icon: '💼' },
  { id: 3, label: 'Your CV', icon: '📋' },
  { id: 4, label: 'Ready', icon: '🚀' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(1)
  const [isParsingCV, setIsParsingCV] = useState(false)
  const [cvReady, setCvReady] = useState(false)
  const [cvFileName, setCvFileName] = useState('')
  const [cvSkipped, setCvSkipped] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof OnboardingData, string>>>({})

  const [data, setData] = useState<OnboardingData>({
    candidateName: '',
    jobTitle: '',
    institution: '',
    sector: '',
    yearsExperience: '',
    language: 'en',
    jobRequirements: '',
    cvText: '',
    plan: 'go',
  })

  const set = (field: keyof OnboardingData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const validate = (): boolean => {
    const e: typeof errors = {}
    if (step === 1) {
      if (!data.candidateName.trim()) e.candidateName = 'Name is required'
    }
    if (step === 2) {
      if (!data.jobTitle.trim()) e.jobTitle = 'Job title is required'
      if (!data.institution.trim()) e.institution = 'Institution is required'
      if (!data.sector) e.sector = 'Please select a sector'
      if (!data.yearsExperience) e.yearsExperience = 'Please select experience level'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => { if (validate()) setStep(s => Math.min(s + 1, 4)) }
  const back = () => setStep(s => Math.max(s - 1, 1))

  const handleCV = async (file: File) => {
    if (!file) return
    setCvFileName(file.name)
    setCvReady(false)
    setCvSkipped(false)

    if (file.type === 'text/plain') {
      const text = await file.text()
      set('cvText', text.slice(0, 6000))
      setCvReady(true)
      return
    }

    setIsParsingCV(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/parse-cv', { method: 'POST', body: form })
      if (res.ok) {
        const { text } = await res.json()
        set('cvText', text.slice(0, 6000))
        setCvReady(true)
        setCvFileName(file.name)
      } else {
        setCvFileName('Could not parse — please paste your CV below')
        setCvReady(false)
      }
    } catch {
      setCvFileName('Upload failed — please paste your CV below')
      setCvReady(false)
    } finally {
      setIsParsingCV(false)
    }
  }

  const handleCvTextChange = (value: string) => {
    set('cvText', value)
    setCvReady(value.trim().length > 50)
    setCvSkipped(false)
  }

  const skipCV = () => {
    set('cvText', '[NO_CV] Candidate has no CV. Conduct a general interview based on job title, sector, and experience level only. Do not ask CV-specific questions.')
    setCvSkipped(true)
    setCvReady(true)
  }

  const startInterview = () => {
    sessionStorage.setItem('barbaros_config', JSON.stringify(data))
    router.push('/interview')
  }

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: '100%',
    background: '#16181F',
    border: `0.5px solid ${hasError ? '#F87171' : 'rgba(255,255,255,0.1)'}`,
    color: '#F0EDE8',
    fontFamily: 'inherit',
    fontSize: 14,
    padding: '10px 13px',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box',
  })

  const chipStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 20,
    border: '0.5px solid rgba(255,255,255,0.12)',
    background: '#16181F',
    color: 'rgba(240,237,232,0.7)',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  }

  const chipActive: React.CSSProperties = {
    background: 'rgba(42,92,255,0.2)',
    border: '0.5px solid #2A5CFF',
    color: '#8B96FF',
    fontWeight: 600,
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ background: '#0F1117', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, fontSize: 17 }}>Barbar<span style={{ color: '#E85D2F' }}>os</span></span>
        <span style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)' }}>Step {step} of 4</span>
      </nav>

      {/* Progress Bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg,#2A5CFF,#E85D2F)', width: `${(step / 4) * 100}%`, transition: 'width 0.4s ease' }} />
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '20px 16px 0', flexWrap: 'wrap' }}>
        {STEPS.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: s.id <= step ? 1 : 0.3 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.id < step ? '#22C55E' : s.id === step ? '#2A5CFF' : '#1a1f2e', border: s.id === step ? '2px solid #2A5CFF' : '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
              {s.id < step ? '✓' : s.icon}
            </div>
            <span style={{ fontSize: 11 }}>{s.label}</span>
            {s.id < STEPS.length && <div style={{ width: 20, height: 1, background: s.id < step ? '#22C55E' : 'rgba(255,255,255,0.1)' }} />}
          </div>
        ))}
      </div>

      <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px 40px' }}>
        <div style={{ width: '100%', maxWidth: 520, background: '#111318', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '28px 24px' }}>

          {/* Step 1 */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Tell us about yourself</h2>
              <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.45)', marginBottom: 24 }}>Adam Reid will greet you by name and adapt the interview to you.</p>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.5)', marginBottom: 7 }}>Full Name *</label>
                <input type="text" value={data.candidateName} onChange={e => set('candidateName', e.target.value)} placeholder="e.g. Sarah Al-Hassan" style={inputStyle(!!errors.candidateName)} />
                {errors.candidateName && <p style={{ fontSize: 11, color: '#F87171', marginTop: 5 }}>⚠ {errors.candidateName}</p>}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.5)', marginBottom: 7 }}>Preferred Language</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['en', 'ar', 'mixed'] as const).map(lang => (
                    <button key={lang} onClick={() => set('language', lang)} style={{ ...chipStyle, ...(data.language === lang ? chipActive : {}) }}>
                      {{ en: 'English', ar: 'Arabic', mixed: 'Mixed' }[lang]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Job you are applying for</h2>
              <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.45)', marginBottom: 24 }}>The more specific you are, the sharper Adam's questions will be.</p>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.5)', marginBottom: 7 }}>Job Title *</label>
                <input type="text" value={data.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder="e.g. Senior Data Analyst" style={inputStyle(!!errors.jobTitle)} />
                {errors.jobTitle && <p style={{ fontSize: 11, color: '#F87171', marginTop: 5 }}>⚠ {errors.jobTitle}</p>}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.5)', marginBottom: 7 }}>Company / Institution *</label>
                <input type="text" value={data.institution} onChange={e => set('institution', e.target.value)} placeholder="e.g. Abu Dhabi Department of Health" style={inputStyle(!!errors.institution)} />
                {errors.institution && <p style={{ fontSize: 11, color: '#F87171', marginTop: 5 }}>⚠ {errors.institution}</p>}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.5)', marginBottom: 7 }}>Sector *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {SECTORS.map(s => (
                    <button key={s} onClick={() => set('sector', s)} style={{ ...chipStyle, ...(data.sector === s ? chipActive : {}), fontSize: 11 }}>{s}</button>
                  ))}
                </div>
                {errors.sector && <p style={{ fontSize: 11, color: '#F87171', marginTop: 5 }}>⚠ {errors.sector}</p>}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.5)', marginBottom: 7 }}>Years of Experience *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {EXPERIENCE_LEVELS.map(lvl => (
                    <button key={lvl} onClick={() => set('yearsExperience', lvl)} style={{ ...chipStyle, ...(data.yearsExperience === lvl ? chipActive : {}), fontSize: 11 }}>{lvl}</button>
                  ))}
                </div>
                {errors.yearsExperience && <p style={{ fontSize: 11, color: '#F87171', marginTop: 5 }}>⚠ {errors.yearsExperience}</p>}
              </div>
            </div>
          )}

          {/* Step 3 — CV */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Your CV</h2>
              <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.45)', marginBottom: 8 }}>
                Adam reads your CV before the interview begins — and will question every detail.
              </p>
              <div style={{ fontSize: 12, color: '#E85D2F', marginBottom: 24, fontWeight: 600 }}>
                ⚡ A CV-backed interview is 3x more targeted and realistic.
              </div>

              {/* Upload Area */}
              {!cvSkipped && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.5)', marginBottom: 7 }}>
                      Upload CV — PDF, DOCX, or TXT
                    </label>
                    <div
                      onClick={() => !isParsingCV && fileRef.current?.click()}
                      style={{
                        border: `1px dashed ${cvReady && cvFileName ? 'rgba(34,197,94,0.5)' : 'rgba(42,92,255,0.35)'}`,
                        borderRadius: 8,
                        padding: '20px 14px',
                        cursor: isParsingCV ? 'wait' : 'pointer',
                        textAlign: 'center' as const,
                        background: cvReady && cvFileName ? 'rgba(34,197,94,0.04)' : 'rgba(42,92,255,0.04)',
                        transition: 'all 0.2s'
                      }}>
                      {isParsingCV ? (
                        <div>
                          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                          <div style={{ fontSize: 13, color: '#8B96FF', fontWeight: 600 }}>Adam is reading your CV...</div>
                          <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.3)', marginTop: 4 }}>Please wait</div>
                        </div>
                      ) : cvReady && cvFileName ? (
                        <div>
                          <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
                          <div style={{ fontSize: 13, color: '#22C55E', fontWeight: 600 }}>{cvFileName}</div>
                          <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.3)', marginTop: 4 }}>CV ready — Adam has read your profile</div>
                        </div>
                      ) : cvFileName ? (
                        <div>
                          <div style={{ fontSize: 13, color: '#F87171' }}>{cvFileName}</div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                          <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.55)' }}>Click to upload your CV</div>
                          <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.3)', marginTop: 4 }}>PDF, DOCX, or TXT</div>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleCV(e.target.files[0]) }} />
                  </div>

                  {/* Paste CV Text */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.5)', marginBottom: 7 }}>
                      Or paste CV text
                    </label>
                    <textarea
                      value={data.cvText.startsWith('[NO_CV]') ? '' : data.cvText}
                      onChange={e => handleCvTextChange(e.target.value)}
                      placeholder="Paste your CV content here..."
                      rows={5}
                      style={{ ...inputStyle(false), resize: 'vertical' as const, lineHeight: 1.6 }}
                    />
                    {data.cvText.trim().length > 50 && !cvFileName && (
                      <div style={{ fontSize: 11, color: '#22C55E', marginTop: 5 }}>✓ CV text received — Adam will read this</div>
                    )}
                  </div>

                  {/* Job Requirements */}
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.5)', marginBottom: 7 }}>
                      Job Requirements (optional)
                    </label>
                    <textarea
                      value={data.jobRequirements}
                      onChange={e => set('jobRequirements', e.target.value)}
                      placeholder="Paste the job posting or key requirements..."
                      rows={3}
                      style={{ ...inputStyle(false), resize: 'vertical' as const, lineHeight: 1.6 }}
                    />
                  </div>

                  {/* Skip CV */}
                  {!cvReady && (
                    <button
                      onClick={skipCV}
                      style={{ width: '100%', padding: '11px', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(240,237,232,0.35)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      I don't have a CV — proceed without it
                    </button>
                  )}
                </>
              )}

              {/* Skipped CV State */}
              {cvSkipped && (
                <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(239,68,68,0.05)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 10 }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️</div>
                  <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.6)', lineHeight: 1.6, marginBottom: 12 }}>
                    No CV provided. Adam will conduct a general interview — but a CV would have made this 3x more targeted.
                  </div>
                  <button
                    onClick={() => { setCvSkipped(false); setCvReady(false); set('cvText', '') }}
                    style={{ fontSize: 12, color: '#E85D2F', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                    Add CV instead
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>🎯</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>You are ready, {data.candidateName.split(' ')[0]}</h2>
              <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.5)', marginBottom: 28, lineHeight: 1.7 }}>
                Adam Reid has reviewed your profile. Hold the mic button while answering and speak clearly.
              </p>

              <div style={{ background: '#0F1117', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 18px', textAlign: 'left' as const, marginBottom: 24 }}>
                {([
                  ['Name', data.candidateName],
                  ['Role', data.jobTitle],
                  ['Institution', data.institution],
                  ['Sector', data.sector],
                  ['Experience', data.yearsExperience],
                  ['Language', { en: 'English', ar: 'Arabic', mixed: 'Mixed' }[data.language]],
                  ['CV', cvSkipped ? '⚠️ Not provided' : data.cvText ? '✅ Provided & read by Adam' : '⚠️ Not provided'],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
                    <span style={{ color: 'rgba(240,237,232,0.45)' }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={startInterview}
                style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#2A5CFF,#1d45cc)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Enter Interview Room →
              </button>
              <p style={{ fontSize: 11, color: 'rgba(240,237,232,0.25)', marginTop: 12 }}>
                {cvSkipped ? '⚠️ General interview — no CV provided' : '✅ CV-backed interview — fully personalized'}
              </p>
            </div>
          )}

          {/* Navigation */}
          {step < 4 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              {step > 1 && (
                <button onClick={back} style={{ padding: '12px 16px', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 9, color: 'rgba(240,237,232,0.6)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Back
                </button>
              )}
              <button
                onClick={next}
                disabled={step === 3 && isParsingCV}
                style={{
                  flex: 1, padding: '12px 20px',
                  background: step === 3 && isParsingCV ? '#1a1f2e' : '#2A5CFF',
                  border: 'none', borderRadius: 9, color: step === 3 && isParsingCV ? 'rgba(240,237,232,0.3)' : '#fff',
                  fontWeight: 700, fontSize: 14,
                  cursor: step === 3 && isParsingCV ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit'
                }}>
                {step === 3 && isParsingCV ? 'Reading CV...' : step === 3 ? 'Review and Start' : 'Continue'}
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
