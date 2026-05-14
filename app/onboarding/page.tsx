'use client'

import { useState, useRef } from 'react'
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
  'Fresh Graduate', 'Less than 1 year', '1-3 years',
  '3-5 years', '5-10 years', '10+ years'
]

const COUNTRIES = [
  'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman',
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France',
  'Egypt', 'Jordan', 'Lebanon', 'Morocco', 'Tunisia', 'South Africa',
  'India', 'Pakistan', 'Philippines', 'Other'
]

const STEPS = [
  { id: 1, label: 'Personal Info', icon: '👤' },
  { id: 2, label: 'Job Details',   icon: '💼' },
  { id: 3, label: 'Your CV',       icon: '📋' },
]

// ─── Job Title Validator (unchanged) ─────────────────────────
const COMMON_NAMES = new Set([
  'ahmed','ali','omar','sara','sarah','mona','lina','reem','nour','hana',
  'dana','dina','rana','rania','layla','leila','farid','tariq','khalid','khaled','walid',
  'mahmoud','mohamed','muhammad','ahmad','hassan','hussain','ibrahim','ismail','yousef',
  'youssef','nadia','noor','sana','iman','amal','amira','fatima','mariam','maryam',
  'john','james','michael','david','chris','daniel','paul','mark','luke','peter','robert',
  'william','richard','thomas','charles','steven','kevin','brian','jason','andrew','ryan',
  'jennifer','jessica','ashley','amanda','melissa','stephanie','elizabeth','lisa',
  'mary','patricia','linda','barbara','susan','karen','nancy','betty','helen','dorothy',
  'pizza','hello','bye','yes','no','ok','okay','test','testing','sample','demo','dummy',
  'random','stuff','thing','blah','foo','bar','baz','qux','lorem','ipsum',
  'محمد','احمد','علي','عمر','سارة','مريم','فاطمة','خالد','وليد','ابراهيم','يوسف',
  'نور','ليلى','رنا','دينا','هناء','امال','امين','سالم','ناصر','راشد','منى',
])

const ROLE_INDICATORS = [
  'engineer','manager','analyst','developer','designer','director','coordinator',
  'specialist','consultant','advisor','officer','executive','administrator',
  'supervisor','lead','head','chief','senior','junior','associate','assistant',
  'intern','technician','operator','inspector','auditor','architect','scientist',
  'researcher','professor','teacher','instructor','trainer','coach','therapist',
  'nurse','doctor','physician','surgeon','pharmacist','accountant','lawyer',
  'attorney','paralegal','journalist','editor','writer','producer','planner',
  'strategist','recruiter','representative','agent','broker','estimator',
  'controller','secretary','receptionist','clerk','driver','mechanic','electrician',
  'plumber','carpenter','welder','painter','security','guard','cleaner','worker',
  'laborer','helper','staff','personnel','professional','expert','principal',
  'مهندس','مدير','محلل','مطور','مصمم','منسق','مستشار','مشرف','رئيس','كبير',
  'أخصائي','اخصائي','فني','مراجع','مدقق','باحث','أستاذ','معلم','مدرب','ممرض',
  'طبيب','محاسب','محامي','مسوق','مبرمج','موظف','عامل','سائق','حارس','مساعد',
  'نائب','مسؤول','خبير','متخصص','قائد','مشغل','مفتش','مخطط',
]

const JOB_TITLE_PATTERNS = [
  /\b(senior|junior|lead|head|chief|associate|assistant|deputy|acting|interim)\b/i,
  /\b(manager|director|officer|executive|coordinator|specialist|analyst|engineer)\b/i,
  /\b(supervisor|administrator|consultant|advisor|representative|technician)\b/i,
  /\b(developer|designer|architect|scientist|researcher|professor|instructor)\b/i,
  /\b(مدير|مهندس|أخصائي|اخصائي|مستشار|محلل|مشرف|منسق|فني|مسؤول)\b/i,
  /\b(head|director|chief|manager|officer|vp|vice\s*president)\s+of\b/i,
  /\b\w+\s+and\s+\w+\s+(manager|officer|director|specialist)\b/i,
]

const CLEARLY_NOT_JOBS = new Set([
  'pizza','burger','coffee','food','water','car','house','phone','laptop',
  'hello','hi','bye','yes','no','ok','okay','sure','maybe','please','thank',
  'good','bad','nice','cool','wow','lol','haha','omg','wtf',
  'red','blue','green','yellow','white','black','orange','purple',
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'مرحبا','اهلا','وداعا','نعم','لا','تمام','حسنا','شكرا','من فضلك',
])

function isValidJobTitle(title: string): { valid: boolean; reason?: string } {
  const t = title.trim()
  const lower = t.toLowerCase()
  const words = lower.split(/\s+/).filter(Boolean)
  if (/^[^a-zA-Z\u0600-\u06FF]+$/.test(t)) return { valid: false, reason: 'This input does not appear to be a job title.' }
  if (/^(.)\1{3,}$/.test(t)) return { valid: false, reason: 'This input does not appear to be a job title.' }
  if (/^(qwer|asdf|zxcv|qazwsx|abcd|1234|aaaa|bbbb|cccc|dddd)/i.test(t)) return { valid: false, reason: 'This input does not appear to be a job title.' }
  const lettersOnly = t.replace(/[^a-zA-Z]/g, '')
  if (lettersOnly.length >= 6) {
    const vowels = (lettersOnly.match(/[aeiouAEIOU]/g) || []).length
    if (vowels / lettersOnly.length < 0.1 && lettersOnly.length > 5) return { valid: false, reason: 'This input does not appear to be a job title.' }
  }
  if (words.length === 1) {
    if (COMMON_NAMES.has(lower)) return { valid: false, reason: 'Please enter a professional job title, not a name.' }
    if (CLEARLY_NOT_JOBS.has(lower)) return { valid: false, reason: 'The entered text appears unrelated to a work position.' }
    if (!ROLE_INDICATORS.some(w => lower.includes(w))) return { valid: false, reason: 'Please enter a valid professional job title.' }
  }
  if (words.length >= 2) {
    if (words.every(w => COMMON_NAMES.has(w))) return { valid: false, reason: 'Please enter a professional job title, not a name.' }
    if (words.every(w => CLEARLY_NOT_JOBS.has(w))) return { valid: false, reason: 'The entered text appears unrelated to a work position.' }
    if (JOB_TITLE_PATTERNS.some(p => p.test(t))) return { valid: true }
    if (ROLE_INDICATORS.some(w => lower.includes(w))) return { valid: true }
    if (words.length <= 4) return { valid: true }
    return { valid: false, reason: 'Please provide a clearer professional role.' }
  }
  return { valid: true }
}

// ─── Components ───────────────────────────────────────────────
const Barbaros = ({ size = 22, light = false }: { size?: number; light?: boolean }) => (
  <span style={{ fontWeight: 900, fontSize: size }}>
    <span style={{ color: light ? '#FFFFFF' : '#1A1A1A' }}>Barbar</span>
    <span style={{ color: '#CC785C' }}>os</span>
  </span>
)

// ─────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  // 'steps' → 'barbaros' → 'hook'
  const [phase, setPhase] = useState<'steps' | 'barbaros' | 'hook'>('steps')
  const [step, setStep] = useState(1)
  const [isParsingCV, setIsParsingCV] = useState(false)
  const [cvReady, setCvReady] = useState(false)
  const [cvFileName, setCvFileName] = useState('')
  const [cvSkipped, setCvSkipped] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof OnboardingData, string>>>({})

  const [data, setData] = useState<OnboardingData>({
    candidateName: '', jobTitle: '', institution: '', country: '',
    sector: '', yearsExperience: '', language: 'en',
    jobRequirements: '', cvText: '', plan: 'go',
  })

  const set = (field: keyof OnboardingData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const validate = (): boolean => {
    const e: typeof errors = {}
    if (step === 1) {
      if (!data.candidateName.trim()) e.candidateName = 'Name is required'
      else if (data.candidateName.trim().length < 2) e.candidateName = 'Please enter your full name'
    }
    if (step === 2) {
      if (!data.jobTitle.trim()) { e.jobTitle = 'Job title is required' }
      else { const c = isValidJobTitle(data.jobTitle); if (!c.valid) e.jobTitle = c.reason }
      if (!data.institution.trim()) e.institution = 'Institution is required'
      if (!data.country) e.country = 'Please select a country'
      if (!data.sector) e.sector = 'Please select a sector'
      if (!data.yearsExperience) e.yearsExperience = 'Please select experience level'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => {
    if (!validate()) return
    if (step < 3) { setStep(s => s + 1); return }
    // Step 3 done → Barbaros screen
    setPhase('barbaros')
  }

  const back = () => {
    if (phase === 'barbaros') { setPhase('steps'); return }
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
      const res = await fetch('/api/parse-cv', { method: 'POST', body: form })
      if (res.ok) {
        const { text } = await res.json()
        set('cvText', text.slice(0, 6000))
        setCvReady(true)
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

  const skipCV = () => {
    set('cvText', '[NO_CV]')
    setCvSkipped(true)
    setCvReady(true)
  }

  const startInterview = () => {
    sessionStorage.setItem('barbaros_config', JSON.stringify(data))
    router.push('/interview')
  }

  const firstName = data.candidateName.split(' ')[0] || data.candidateName
  const hasCv = data.cvText && !data.cvText.startsWith('[NO_CV]') && data.cvText.trim().length > 50
  const isAr = data.language === 'ar'

  // ─── Styles ───────────────────────────────────────────────
  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: '100%', background: '#FFFFFF',
    border: `0.5px solid ${hasError ? '#DC2626' : '#E5DDD0'}`,
    color: '#1A1A1A', fontFamily: 'inherit', fontSize: 14,
    padding: '11px 13px', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
  })

  const chipStyle: React.CSSProperties = {
    padding: '7px 13px', borderRadius: 20, border: '0.5px solid #E5DDD0',
    background: '#FFFFFF', color: 'rgba(26,26,26,0.65)', cursor: 'pointer',
    fontSize: 12, fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: 500,
  }

  const chipActive: React.CSSProperties = {
    background: 'rgba(204,120,92,0.12)', border: '0.5px solid #CC785C',
    color: '#CC785C', fontWeight: 700,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    textTransform: 'uppercase', color: 'rgba(26,26,26,0.55)', marginBottom: 8,
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE: BARBAROS SCREEN
  // ═══════════════════════════════════════════════════════════
  if (phase === 'barbaros') {
    return (
      <div style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#1A1A1A',
        color: '#FFFFFF',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 32 }}>
          <Barbaros size={32} light />
        </div>

        {/* Avatar */}
        <div style={{
          width: 96, height: 96,
          background: 'rgba(204,120,92,0.15)',
          border: '2px solid #CC785C',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 42, marginBottom: 28,
        }}>🎯</div>

        {/* Interviewer name */}
        <div style={{ fontSize: 15, marginBottom: 6 }}>
          <span style={{ fontWeight: 900, color: '#FFFFFF' }}>Barbar</span>
          <span style={{ fontWeight: 900, color: '#CC785C' }}>os</span>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 400 }}> Interviewer</span>
        </div>

        {/* Status line */}
        <div style={{
          fontSize: 11, color: '#CC785C', fontWeight: 700,
          letterSpacing: 1, textTransform: 'uppercase', marginBottom: 36,
        }}>
          ● Ready
        </div>

        {/* Main message */}
        <div style={{
          maxWidth: 360,
          background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: '28px 24px',
          marginBottom: 32,
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, lineHeight: 1.4, color: '#FFFFFF' }}>
            {hasCv
              ? isAr ? 'قرأت ملفك كاملاً.' : 'I have read your complete profile.'
              : isAr ? 'لديّ ما يكفي لأبدأ.' : 'I have enough to begin.'}
          </div>

          {/* What was read */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: isAr ? 'الاسم' : 'Name', value: data.candidateName, ok: true },
              { label: isAr ? 'الوظيفة' : 'Role', value: `${data.jobTitle} · ${data.institution}`, ok: true },
              { label: isAr ? 'السيرة الذاتية' : 'CV',
                value: hasCv
                  ? isAr ? 'تم التحليل' : 'Analysed'
                  : isAr ? 'لم يُرفع' : 'Not provided',
                ok: hasCv },
            ].map(row => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 8,
                fontSize: 12,
              }}>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{row.label}</span>
                <span style={{
                  fontWeight: 700,
                  color: row.ok ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => setPhase('hook')}
          style={{
            width: '100%', maxWidth: 360,
            padding: '16px',
            background: '#CC785C',
            border: 'none', borderRadius: 12,
            color: '#FFFFFF', fontWeight: 800, fontSize: 15,
            cursor: 'pointer', fontFamily: 'inherit', letterSpacing: -0.3,
            marginBottom: 16,
          }}>
          {isAr ? 'المتابعة ←' : 'Continue →'}
        </button>

        <button
          onClick={back}
          style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.3)', fontSize: 12,
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          }}>
          {isAr ? '← رجوع' : '← Go back'}
        </button>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE: EMOTIONAL HOOK
  // ═══════════════════════════════════════════════════════════
  if (phase === 'hook') {
    return (
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        style={{
          fontFamily: 'system-ui, sans-serif',
          background: '#F5F1EB',
          color: '#1A1A1A',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 20px',
          textAlign: 'center',
        }}>
        {/* First name — large */}
        <div style={{
          fontSize: 56, fontWeight: 900,
          color: '#1A1A1A', letterSpacing: -2,
          marginBottom: 16, lineHeight: 1,
        }}>
          {firstName}
        </div>

        {/* Are you ready? */}
        <div style={{
          fontSize: 22, fontWeight: 400,
          color: 'rgba(26,26,26,0.55)',
          marginBottom: 48, letterSpacing: -0.3,
        }}>
          {isAr ? 'هل أنت جاهز؟' : 'Are you ready?'}
        </div>

        {/* Enter button */}
        <button
          onClick={startInterview}
          style={{
            padding: '17px 56px',
            background: '#1A1A1A',
            border: 'none', borderRadius: 14,
            color: '#FFFFFF', fontWeight: 800, fontSize: 16,
            cursor: 'pointer', fontFamily: 'inherit', letterSpacing: -0.3,
            marginBottom: 20,
          }}>
          {isAr ? 'أنا جاهز ←' : "I'm ready →"}
        </button>

        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.3)', fontWeight: 600 }}>
          {isAr
            ? 'سيبدأ المحاور فور دخولك'
            : 'Your interviewer will begin the moment you enter'}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE: STEPS (1 → 2 → 3)
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#F5F1EB', color: '#1A1A1A', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      <nav style={{ background: '#F5F1EB', borderBottom: '0.5px solid #E5DDD0', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div onClick={() => router.push('/')} style={{ fontSize: 22, letterSpacing: -0.5, cursor: 'pointer' }}>
          <Barbaros />
        </div>
        <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.5)', fontWeight: 600 }}>
          Step {step} of 3
        </div>
      </nav>

      <div style={{ height: 3, background: '#E5DDD0' }}>
        <div style={{ height: '100%', background: '#CC785C', width: `${(step / 3) * 100}%`, transition: 'width 0.4s ease' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '24px 16px 0', flexWrap: 'wrap' }}>
        {STEPS.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: s.id <= step ? 1 : 0.35 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: s.id < step ? '#CC785C' : s.id === step ? '#1A1A1A' : '#FFFFFF',
              border: s.id === step ? '2px solid #1A1A1A' : '1px solid #E5DDD0',
              color: s.id <= step ? '#FFFFFF' : '#1A1A1A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
            }}>
              {s.id < step ? '✓' : s.icon}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A' }}>{s.label}</span>
            {s.id < STEPS.length && <div style={{ width: 22, height: 1, background: s.id < step ? '#CC785C' : '#E5DDD0' }} />}
          </div>
        ))}
      </div>

      <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px 60px' }}>
        <div style={{ width: '100%', maxWidth: 560, background: '#FFFFFF', border: '0.5px solid #E5DDD0', borderRadius: 16, padding: '32px 28px' }}>

          {/* ── Step 1 ── */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, color: '#1A1A1A', letterSpacing: -0.5 }}>
                Tell us about yourself
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(26,26,26,0.6)', marginBottom: 28, lineHeight: 1.6 }}>
                Your <strong style={{ color: '#1A1A1A', fontWeight: 800 }}><Barbaros /> Interviewer</strong> will greet you by name and adapt the interview to you.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Full Name *</label>
                <input
                  type="text" value={data.candidateName}
                  onChange={e => set('candidateName', e.target.value)}
                  placeholder="e.g. Sarah Al-Hassan"
                  style={inputStyle(!!errors.candidateName)}
                />
                {errors.candidateName && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>⚠ {errors.candidateName}</p>}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Preferred Language</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['en', 'ar', 'mixed'] as const).map(lang => (
                    <button key={lang} onClick={() => set('language', lang)}
                      style={{ ...chipStyle, ...(data.language === lang ? chipActive : {}) }}>
                      {{ en: 'English', ar: 'Arabic', mixed: 'Mixed' }[lang]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, color: '#1A1A1A', letterSpacing: -0.5 }}>
                Job you are applying for
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(26,26,26,0.6)', marginBottom: 28, lineHeight: 1.6 }}>
                The more specific you are, the sharper the interview questions will be.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Job Title *</label>
                <input type="text" value={data.jobTitle}
                  onChange={e => set('jobTitle', e.target.value)}
                  onBlur={() => {
                    if (data.jobTitle.trim()) {
                      const c = isValidJobTitle(data.jobTitle)
                      if (!c.valid) setErrors(prev => ({ ...prev, jobTitle: c.reason }))
                    }
                  }}
                  placeholder="e.g. Senior Data Analyst"
                  style={inputStyle(!!errors.jobTitle)}
                />
                {errors.jobTitle && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>⚠ {errors.jobTitle}</p>}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Company / Institution *</label>
                <input type="text" value={data.institution}
                  onChange={e => set('institution', e.target.value)}
                  placeholder="e.g. Abu Dhabi Department of Health"
                  style={inputStyle(!!errors.institution)}
                />
                {errors.institution && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>⚠ {errors.institution}</p>}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Country *</label>
                <select value={data.country} onChange={e => set('country', e.target.value)}
                  style={{ ...inputStyle(!!errors.country), appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%231A1A1A' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 36, cursor: 'pointer' }}>
                  <option value="">Select country...</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {errors.country && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>⚠ {errors.country}</p>}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Sector *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {SECTORS.map(s => (
                    <button key={s} onClick={() => set('sector', s)}
                      style={{ ...chipStyle, ...(data.sector === s ? chipActive : {}), fontSize: 11 }}>
                      {s}
                    </button>
                  ))}
                </div>
                {errors.sector && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>⚠ {errors.sector}</p>}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Years of Experience *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {EXPERIENCE_LEVELS.map(lvl => (
                    <button key={lvl} onClick={() => set('yearsExperience', lvl)}
                      style={{ ...chipStyle, ...(data.yearsExperience === lvl ? chipActive : {}), fontSize: 11 }}>
                      {lvl === 'Fresh Graduate' ? '🎓 ' + lvl : lvl}
                    </button>
                  ))}
                </div>
                {errors.yearsExperience && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>⚠ {errors.yearsExperience}</p>}
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, color: '#1A1A1A', letterSpacing: -0.5 }}>
                Your CV
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(26,26,26,0.6)', marginBottom: 10, lineHeight: 1.6 }}>
                Your <strong style={{ color: '#1A1A1A', fontWeight: 800 }}><Barbaros /> Interviewer</strong> reads your CV before the interview begins — and will question every detail.
              </p>

              <div style={{ fontSize: 12, color: '#CC785C', marginBottom: 24, fontWeight: 700, background: 'rgba(204,120,92,0.08)', border: '0.5px solid rgba(204,120,92,0.25)', padding: '10px 14px', borderRadius: 10 }}>
                ⚡ A CV-backed interview is 3× more targeted and realistic.
              </div>

              {!cvSkipped && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Upload CV — PDF, DOCX, or TXT</label>
                    <div
                      onClick={() => !isParsingCV && fileRef.current?.click()}
                      style={{
                        border: `1.5px dashed ${cvReady && cvFileName ? '#22C55E' : '#CC785C'}`,
                        borderRadius: 12, padding: '24px 14px',
                        cursor: isParsingCV ? 'wait' : 'pointer', textAlign: 'center',
                        background: cvReady && cvFileName ? 'rgba(34,197,94,0.06)' : 'rgba(204,120,92,0.05)',
                        transition: 'all 0.2s',
                      }}>
                      {isParsingCV ? (
                        <div>
                          <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
                          <div style={{ fontSize: 14, color: '#CC785C', fontWeight: 700 }}>Your Interviewer is reading your CV...</div>
                          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', marginTop: 4 }}>Please wait</div>
                        </div>
                      ) : cvReady && cvFileName ? (
                        <div>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                          <div style={{ fontSize: 13, color: '#22C55E', fontWeight: 700 }}>{cvFileName}</div>
                          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', marginTop: 4 }}>CV ready — your Interviewer has reviewed your profile</div>
                        </div>
                      ) : cvFileName ? (
                        <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{cvFileName}</div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
                          <div style={{ fontSize: 14, color: '#1A1A1A', fontWeight: 600 }}>Click to upload your CV</div>
                          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', marginTop: 4 }}>PDF, DOCX, or TXT</div>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept=".pdf,.docx,.txt"
                      style={{ display: 'none' }}
                      onChange={e => { if (e.target.files?.[0]) handleCV(e.target.files[0]) }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Or paste CV text</label>
                    <textarea
                      value={data.cvText.startsWith('[NO_CV]') ? '' : data.cvText}
                      onChange={e => {
                        set('cvText', e.target.value)
                        setCvReady(e.target.value.trim().length > 50)
                        setCvSkipped(false)
                      }}
                      placeholder="Paste your CV content here..."
                      rows={5}
                      style={{ ...inputStyle(false), resize: 'vertical', lineHeight: 1.6 }}
                    />
                    {data.cvText.trim().length > 50 && !cvFileName && (
                      <div style={{ fontSize: 11, color: '#22C55E', marginTop: 6, fontWeight: 600 }}>✓ CV text received</div>
                    )}
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Job Requirements (optional)</label>
                    <textarea
                      value={data.jobRequirements}
                      onChange={e => set('jobRequirements', e.target.value)}
                      placeholder="Paste the job posting or key requirements..."
                      rows={3}
                      style={{ ...inputStyle(false), resize: 'vertical', lineHeight: 1.6 }}
                    />
                  </div>

                  {!cvReady && (
                    <button onClick={skipCV}
                      style={{ width: '100%', padding: '12px', background: 'transparent', border: '0.5px solid #E5DDD0', borderRadius: 9, color: 'rgba(26,26,26,0.5)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                      I don't have a CV — proceed without it
                    </button>
                  )}
                </>
              )}

              {cvSkipped && (
                <div style={{ textAlign: 'center', padding: '28px 22px', background: 'linear-gradient(135deg, rgba(204,120,92,0.08), rgba(204,120,92,0.03))', border: '0.5px solid rgba(204,120,92,0.3)', borderRadius: 14 }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>🚀</div>
                  <div style={{ fontSize: 15, color: '#1A1A1A', fontWeight: 800, marginBottom: 8, letterSpacing: -0.3 }}>You're ready to start.</div>
                  <div style={{ fontSize: 13, color: 'rgba(26,26,26,0.65)', lineHeight: 1.7, marginBottom: 16 }}>
                    Your <Barbaros /> Interviewer will conduct the interview based on your role and experience.
                  </div>
                  <button onClick={() => { setCvSkipped(false); setCvReady(false); set('cvText', '') }}
                    style={{ fontSize: 13, color: '#CC785C', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', fontWeight: 700 }}>
                    Add CV now instead
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Navigation ── */}
          <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
            {step > 1 && (
              <button onClick={back}
                style={{ padding: '13px 20px', background: 'transparent', border: '0.5px solid #E5DDD0', borderRadius: 10, color: '#1A1A1A', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Back
              </button>
            )}
            <button
              onClick={next}
              disabled={step === 3 && isParsingCV}
              style={{
                flex: 1, padding: '13px 20px',
                background: step === 3 && isParsingCV ? '#E5DDD0' : '#CC785C',
                border: 'none', borderRadius: 10,
                color: step === 3 && isParsingCV ? 'rgba(26,26,26,0.4)' : '#FFFFFF',
                fontWeight: 800, fontSize: 14,
                cursor: step === 3 && isParsingCV ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', letterSpacing: -0.3,
              }}>
              {step === 3 && isParsingCV ? 'Reading CV...' : step === 3 ? 'Meet Your Interviewer →' : 'Continue →'}
            </button>
          </div>

        </div>
      </main>

      <footer style={{ background: '#EDE6D8', borderTop: '0.5px solid #E5DDD0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14 }}><Barbaros /></div>
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>© 2026 Barbaros. All rights reserved.</div>
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>Powered by AI</div>
      </footer>

    </div>
  )
}
