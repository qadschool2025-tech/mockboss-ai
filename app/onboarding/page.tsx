'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface OnboardingData {
  candidateName: string
  jobTitle: string
  institution: string
  country: string
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
  'Fresh Graduate',
  'Less than 1 year',
  '1-3 years',
  '3-5 years',
  '5-10 years',
  '10+ years'
]

const COUNTRIES = [
  'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman',
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France',
  'Egypt', 'Jordan', 'Lebanon', 'Morocco', 'Tunisia', 'South Africa',
  'India', 'Pakistan', 'Philippines', 'Other'
]

const STEPS = [
  { id: 1, label: 'Personal Info', icon: '•' },
  { id: 2, label: 'Job Details', icon: '•' },
  { id: 3, label: 'Your CV', icon: '•' },
  { id: 4, label: 'Ready', icon: '•' },
]

const COMMON_NAMES = new Set([
  'ahmed','ali','omar','sara','sarah','mona','lina','reem','nour',
  'john','james','michael','david','chris','daniel',
  'محمد','احمد','علي','عمر','سارة','مريم'
])

const ROLE_INDICATORS = [
  'engineer','manager','analyst','developer','designer','director',
  'specialist','consultant','advisor','officer','executive',
  'teacher','doctor','nurse','accountant','lawyer',
  'مهندس','مدير','محلل','مطور','مصمم','معلم','طبيب','محاسب'
]

const JOB_TITLE_PATTERNS = [
  /\b(senior|junior|lead|head|chief)\b/i,
  /\b(manager|director|officer|engineer|analyst)\b/i,
  /\b(مدير|مهندس|محلل|مشرف)\b/i,
]

const CLEARLY_NOT_JOBS = new Set([
  'pizza','burger','hello','hi','bye',
  'مرحبا','اهلا','وداعا'
])

function isValidJobTitle(title: string): { valid: boolean; reason?: string } {
  const t = title.trim()
  const lower = t.toLowerCase()
  const words = lower.split(/\s+/).filter(Boolean)

  if (/^[^a-zA-Z\u0600-\u06FF]+$/.test(t))
    return { valid: false, reason: 'This input does not appear to be a job title.' }

  if (/^(.)\1{3,}$/.test(t))
    return { valid: false, reason: 'This input does not appear to be a job title.' }

  if (words.length === 1) {
    if (COMMON_NAMES.has(lower))
      return { valid: false, reason: 'Please enter a professional job title, not a name.' }

    if (CLEARLY_NOT_JOBS.has(lower))
      return { valid: false, reason: 'The entered text appears unrelated to a work position.' }

    const hasRoleWord = ROLE_INDICATORS.some(w => lower.includes(w))

    if (!hasRoleWord)
      return { valid: false, reason: 'Please enter a valid professional job title.' }
  }

  if (words.length >= 2) {
    const matchesPattern = JOB_TITLE_PATTERNS.some(p => p.test(t))
    if (matchesPattern) return { valid: true }

    const hasRoleWord = ROLE_INDICATORS.some(w => lower.includes(w))
    if (hasRoleWord) return { valid: true }

    if (words.length <= 4) return { valid: true }

    return { valid: false, reason: 'Please provide a clearer professional role.' }
  }

  return { valid: true }
}

const Barbaros = () => (
  <span style={{ fontWeight: 900 }}>
    <span style={{ color: '#1A1A1A' }}>Barbar</span>
    <span style={{ color: '#CC785C' }}>os</span>
  </span>
)

export default function OnboardingPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(1)
  const [isParsingCV, setIsParsingCV] = useState(false)
  const [cvReady, setCvReady] = useState(false)
  const [cvFileName, setCvFileName] = useState('')
  const [cvSkipped, setCvSkipped] = useState(false)

  const [analysisStep, setAnalysisStep] = useState(0)

  const ANALYSIS_MESSAGES = [
    'Analyzing work history...',
    'Evaluating communication profile...',
    'Detecting leadership indicators...',
    'Building adaptive interview model...',
    'Cross-checking role compatibility...',
  ]

  useEffect(() => {
    if (!isParsingCV) return

    let index = 0

    const interval = setInterval(() => {
      index = (index + 1) % ANALYSIS_MESSAGES.length
      setAnalysisStep(index)
    }, 1400)

    return () => clearInterval(interval)
  }, [isParsingCV])

  const [errors, setErrors] = useState<Partial<Record<keyof OnboardingData, string>>>({})

  const [data, setData] = useState<OnboardingData>({
    candidateName: '',
    jobTitle: '',
    institution: '',
    country: '',
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
      if (!data.candidateName.trim()) {
        e.candidateName = 'Name is required'
      }
    }

    if (step === 2) {
      if (!data.jobTitle.trim()) {
        e.jobTitle = 'Job title is required'
      } else {
        const check = isValidJobTitle(data.jobTitle)
        if (!check.valid) e.jobTitle = check.reason
      }

      if (!data.institution.trim()) e.institution = 'Institution is required'
      if (!data.country) e.country = 'Please select a country'
      if (!data.sector) e.sector = 'Please select a sector'
      if (!data.yearsExperience) e.yearsExperience = 'Please select experience level'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => {
    if (validate()) setStep(s => Math.min(s + 1, 4))
  }

  const back = () => {
    setStep(s => Math.max(s - 1, 1))
  }

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

      const res = await fetch('/api/parse-cv', {
        method: 'POST',
        body: form
      })

      if (res.ok) {
        const { text } = await res.json()

        set('cvText', text.slice(0, 6000))
        setCvReady(true)
        setCvFileName(file.name)
      } else {
        setCvFileName('Could not parse — please paste your CV below')
      }
    } catch {
      setCvFileName('Upload failed — please paste your CV below')
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
    set('cvText', '[NO_CV]')
    setCvSkipped(true)
    setCvReady(true)
  }

  const startInterview = () => {
    sessionStorage.setItem('barbaros_config', JSON.stringify(data))
    router.push('/interview')
  }

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: '100%',
    background: '#FFFFFF',
    border: `0.5px solid ${hasError ? '#DC2626' : '#E5DDD0'}`,
    color: '#1A1A1A',
    fontFamily: 'inherit',
    fontSize: 14,
    padding: '11px 13px',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box',
  })

  const chipStyle: React.CSSProperties = {
    padding: '7px 13px',
    borderRadius: 20,
    border: '0.5px solid #E5DDD0',
    background: '#FFFFFF',
    color: 'rgba(26,26,26,0.65)',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    fontWeight: 500,
  }

  const chipActive: React.CSSProperties = {
    background: 'rgba(204,120,92,0.12)',
    border: '0.5px solid #CC785C',
    color: '#CC785C',
    fontWeight: 700,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(26,26,26,0.55)',
    marginBottom: 8,
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#F5F1EB',
        color: '#1A1A1A',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <nav
        style={{
          background: '#F5F1EB',
          borderBottom: '0.5px solid #E5DDD0',
          padding: '14px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div
          onClick={() => router.push('/')}
          style={{
            fontSize: 22,
            letterSpacing: -0.5,
            cursor: 'pointer'
          }}
        >
          <Barbaros />
        </div>

        <div
          style={{
            fontSize: 12,
            color: 'rgba(26,26,26,0.5)',
            fontWeight: 600
          }}
        >
          Step {step} of 4
        </div>
      </nav>

      <div style={{ height: 3, background: '#E5DDD0' }}>
        <div
          style={{
            height: '100%',
            background: '#CC785C',
            width: `${(step / 4) * 100}%`,
            transition: 'width 0.4s ease'
          }}
        />
      </div>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '40px 16px 60px'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            background: '#FFFFFF',
            border: '0.5px solid #E5DDD0',
            borderRadius: 16,
            padding: '32px 28px'
          }}
        >

          {/* STEP 1 */}
          {step === 1 && (
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  marginBottom: 6,
                  color: '#1A1A1A',
                  letterSpacing: -0.5
                }}
              >
                Tell us about yourself
              </h2>

              <p
                style={{
                  fontSize: 13,
                  color: 'rgba(26,26,26,0.6)',
                  marginBottom: 28,
                  lineHeight: 1.6
                }}
              >
                Your <strong><Barbaros /> Interviewer</strong> will adapt the interview to your profile.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Full Name *</label>

                <input
                  type="text"
                  value={data.candidateName}
                  onChange={e => set('candidateName', e.target.value)}
                  placeholder="e.g. Sarah Al-Hassan"
                  style={inputStyle(!!errors.candidateName)}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Preferred Language</label>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['en', 'ar', 'mixed'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => set('language', lang)}
                      style={{
                        ...chipStyle,
                        ...(data.language === lang ? chipActive : {})
                      }}
                    >
                      {{
                        en: 'English',
                        ar: 'Arabic',
                        mixed: 'Mixed'
                      }[lang]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  marginBottom: 6,
                  color: '#1A1A1A',
                  letterSpacing: -0.5
                }}
              >
                Job you are applying for
              </h2>

              <p
                style={{
                  fontSize: 13,
                  color: 'rgba(26,26,26,0.6)',
                  marginBottom: 28,
                  lineHeight: 1.6
                }}
              >
                The more specific you are, the sharper the interview questions will be.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Job Title *</label>

                <input
                  type="text"
                  value={data.jobTitle}
                  onChange={e => set('jobTitle', e.target.value)}
                  placeholder="e.g. Senior Data Analyst"
                  style={inputStyle(!!errors.jobTitle)}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Company / Institution *</label>

                <input
                  type="text"
                  value={data.institution}
                  onChange={e => set('institution', e.target.value)}
                  placeholder="e.g. Abu Dhabi Department of Health"
                  style={inputStyle(!!errors.institution)}
                />
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  marginBottom: 6,
                  color: '#1A1A1A',
                  letterSpacing: -0.5
                }}
              >
                Your CV
              </h2>

              <p
                style={{
                  fontSize: 13,
                  color: 'rgba(26,26,26,0.6)',
                  marginBottom: 10,
                  lineHeight: 1.6
                }}
              >
                Your <strong><Barbaros /> Interviewer</strong> reads your CV before the interview begins.
              </p>

              {!cvSkipped && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>
                      Upload CV — PDF, DOCX, or TXT
                    </label>

                    <div
                      onClick={() => !isParsingCV && fileRef.current?.click()}
                      style={{
                        border: `1.5px dashed ${cvReady && cvFileName ? '#22C55E' : '#CC785C'}`,
                        borderRadius: 12,
                        padding: '28px 16px',
                        cursor: isParsingCV ? 'wait' : 'pointer',
                        textAlign: 'center',
                        background: cvReady && cvFileName
                          ? 'rgba(34,197,94,0.06)'
                          : 'rgba(204,120,92,0.05)',
                        transition: 'all 0.2s'
                      }}
                    >
                      {isParsingCV ? (
                        <div>
                          <div
                            style={{
                              width: 54,
                              height: 54,
                              borderRadius: '50%',
                              border: '2px solid rgba(204,120,92,0.2)',
                              borderTop: '2px solid #CC785C',
                              margin: '0 auto 18px',
                              animation: 'spin 1s linear infinite'
                            }}
                          />

                          <div
                            style={{
                              fontSize: 14,
                              color: '#1A1A1A',
                              fontWeight: 800,
                              marginBottom: 8
                            }}
                          >
                            Your Interviewer is analyzing your profile
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              color: '#CC785C',
                              fontWeight: 700,
                              minHeight: 18
                            }}
                          >
                            {ANALYSIS_MESSAGES[analysisStep]}
                          </div>
                        </div>
                      ) : cvReady && cvFileName ? (
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              color: '#22C55E',
                              fontWeight: 700
                            }}
                          >
                            {cvFileName}
                          </div>

                          <div
                            style={{
                              fontSize: 11,
                              color: 'rgba(26,26,26,0.5)',
                              marginTop: 4
                            }}
                          >
                            Profile analyzed successfully
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              color: '#1A1A1A',
                              fontWeight: 700
                            }}
                          >
                            Click to upload your CV
                          </div>

                          <div
                            style={{
                              fontSize: 11,
                              color: 'rgba(26,26,26,0.5)',
                              marginTop: 4
                            }}
                          >
                            PDF, DOCX, or TXT
                          </div>
                        </div>
                      )}
                    </div>

                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.docx,.txt"
                      style={{ display: 'none' }}
                      onChange={e => {
                        if (e.target.files?.[0]) {
                          handleCV(e.target.files[0])
                        }
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div
              style={{
                textAlign: 'center',
                animation: 'fadeUp 0.5s ease'
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'rgba(204,120,92,0.08)',
                  border: '1px solid rgba(204,120,92,0.22)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#CC785C',
                }}
              >
                B
              </div>

              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: '#CC785C',
                  marginBottom: 14,
                }}
              >
                Interview System Ready
              </div>

              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  lineHeight: 1.2,
                  marginBottom: 18,
                  letterSpacing: -1,
                  color: '#1A1A1A',
                }}
              >
                {data.candidateName.split(' ')[0]}...
              </h2>

              <div
                style={{
                  background: '#F5F1EB',
                  border: '0.5px solid #E5DDD0',
                  borderRadius: 14,
                  padding: '22px 20px',
                  textAlign: 'left',
                  marginBottom: 28,
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: '#1A1A1A',
                    marginBottom: 16,
                  }}
                >
                  Your interview profile has been prepared.
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {[
                    'Adaptive interview difficulty enabled',
                    'Behavioral pressure evaluation activated',
                    'Role-specific competency analysis ready',
                    cvSkipped
                      ? 'General interview mode selected'
                      : 'CV-backed personalized questioning enabled',
                  ].map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        color: '#1A1A1A',
                        fontWeight: 600,
                      }}
                    >
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: '#CC785C',
                          flexShrink: 0,
                        }}
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  fontSize: 16,
                  lineHeight: 1.8,
                  color: 'rgba(26,26,26,0.72)',
                  marginBottom: 34,
                  fontWeight: 500,
                }}
              >
                This interview will evaluate more than your answers.
                <br />
                It will evaluate your communication,
                confidence, clarity, and decision-making under pressure.
              </div>

              <button
                onClick={startInterview}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: '#CC785C',
                  border: 'none',
                  borderRadius: 12,
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Enter Interview Room →
              </button>
            </div>
          )}

          {step < 4 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              {step > 1 && (
                <button
                  onClick={back}
                  style={{
                    padding: '13px 20px',
                    background: 'transparent',
                    border: '0.5px solid #E5DDD0',
                    borderRadius: 10,
                    color: '#1A1A1A',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  Back
                </button>
              )}

              <button
                onClick={next}
                disabled={step === 3 && isParsingCV}
                style={{
                  flex: 1,
                  padding: '13px 20px',
                  background: step === 3 && isParsingCV ? '#E5DDD0' : '#CC785C',
                  border: 'none',
                  borderRadius: 10,
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: step === 3 && isParsingCV ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {step === 3
                  ? 'Review and Start'
                  : 'Continue →'}
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
