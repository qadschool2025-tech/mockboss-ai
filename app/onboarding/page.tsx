'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ParsedCv } from '@/lib/barbaros/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingData {
  candidateName: string
  jobTitle: string
  institution: string
  yearsExperience: string
  language: string
  jobRequirements: string
  cvFileName: string
  cvMimeType: string
  cvSize: number
  cvText: string
  cvSummary: string
  parsedCv: ParsedCv | null
}

type RoleStatus = 'idle' | 'checking' | 'valid' | 'invalid'

interface FieldErrors {
  candidateName?: string
  jobTitle?: string
  institution?: string
}

const EXPERIENCE_LEVELS = [
  { value: 'fresh-graduate', label: 'Fresh Graduate' },
  { value: 'less than 1 year', label: '< 1 year' },
  { value: '1-3 years',        label: '1–3 years' },
  { value: '3-5 years',        label: '3–5 years' },
  { value: '5-10 years',       label: '5–10 years' },
  { value: '10+ years',        label: '10+ years' },
]

const LANGUAGES = [
  { value: 'en',    label: 'English' },
  { value: 'ar',    label: 'العربية' },
  { value: 'mixed', label: 'Mixed' },
]

const MAX_CV_BYTES = 5 * 1024 * 1024 // 5 MB

// ─── Validation helpers ─────────────────────────────────────────────────────

const hasLetter = (s: string) => /\p{L}/u.test(s)

const isReasonableText = (s: string, min: number, max: number) => {
  const t = s.trim()
  return t.length >= min && t.length <= max && hasLetter(t)
}

const roleFormatOk = (s: string) => {
  const t = s.trim()
  return /^[\p{L}\p{N}\s\-\/.,()]{2,80}$/u.test(t) && hasLetter(t)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: '100vh',
    background: '#F5F1EB',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '0 16px 56px',
    fontFamily: "'Georgia', 'Times New Roman', serif",
  },
  nav: {
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '22px 0 0',
    marginBottom: 32,
  },
  logo: { fontWeight: 900, fontSize: 26, letterSpacing: '-0.8px', fontFamily: "'Georgia', serif" },
  stepIndicator: { display: 'flex', gap: 6, alignItems: 'center' },
  dot: (active: boolean, done: boolean) => ({
    width: active ? 26 : 8,
    height: 8,
    borderRadius: 4,
    background: done ? '#CC785C' : active ? '#1A1A1A' : '#E5DDD0',
    transition: 'all 0.3s ease',
  }),
  card: {
    width: '100%',
    maxWidth: 560,
    background: '#fff',
    border: '1px solid #E5DDD0',
    borderRadius: 18,
    padding: '36px 32px',
    boxShadow: '0 1px 2px rgba(26,26,26,0.04), 0 12px 32px -16px rgba(26,26,26,0.12)',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: '#CC785C',
    marginBottom: 10,
    fontFamily: "'Georgia', serif",
  },
  heading: {
    fontSize: 25,
    fontWeight: 700,
    color: '#1A1A1A',
    marginBottom: 6,
    lineHeight: 1.25,
    letterSpacing: '-0.3px',
    fontFamily: "'Georgia', serif",
  },
  subtext: { fontSize: 13.5, color: '#8a8278', marginBottom: 30, lineHeight: 1.55 },
  label: {
    display: 'block',
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: '#1A1A1A',
    marginBottom: 7,
    textTransform: 'uppercase' as const,
    fontFamily: "'Georgia', serif",
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid #E5DDD0',
    borderRadius: 10,
    fontSize: 14.5,
    color: '#1A1A1A',
    background: '#FAF8F5',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: "'Georgia', serif",
  },
  textarea: {
    width: '100%',
    padding: '13px 15px',
    border: '1px solid #E5DDD0',
    borderRadius: 12,
    fontSize: 14.5,
    color: '#1A1A1A',
    background: '#FAF8F5',
    outline: 'none',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    minHeight: 130,
    fontFamily: "'Georgia', serif",
    lineHeight: 1.65,
  },
  fieldGroup: { marginBottom: 22 },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 },
  chipRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8 },
  chip: (active: boolean) => ({
    padding: '8px 15px',
    borderRadius: 9,
    border: `1px solid ${active ? '#CC785C' : '#E5DDD0'}`,
    background: active ? '#CC785C' : '#FAF8F5',
    color: active ? '#fff' : '#1A1A1A',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: active ? 700 : 400,
    fontFamily: "'Georgia', serif",
    transition: 'all 0.15s',
  }),
  fieldError: { fontSize: 11.5, color: '#C0392B', marginTop: 6, fontFamily: "'Georgia', serif", lineHeight: 1.4 },
  fieldChecking: { fontSize: 11.5, color: '#a59c8e', marginTop: 6, fontFamily: "'Georgia', serif" },
  fieldOk: { fontSize: 11.5, color: '#CC785C', marginTop: 6, fontWeight: 700, fontFamily: "'Georgia', serif" },
  recommendBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 9px',
    borderRadius: 20,
    background: '#FDF1EB',
    border: '1px solid #F0D5C7',
    color: '#CC785C',
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    fontFamily: "'Georgia', serif",
  },
  blockLabelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  dropzone: (filled: boolean) => ({
    width: '100%',
    border: `2px dashed ${filled ? '#CC785C' : '#D8C9B6'}`,
    borderRadius: 14,
    background: filled ? '#FDF6F2' : '#FBF8F4',
    padding: filled ? '18px 20px' : '32px 24px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    display: 'block',
    transition: 'all 0.18s',
    boxSizing: 'border-box' as const,
  }),
  dropIcon: {
    width: 44,
    height: 44,
    margin: '0 auto 12px',
    borderRadius: '50%',
    background: '#F3E3D9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#CC785C',
    fontSize: 22,
  },
  dropTitle: { fontSize: 16, fontWeight: 700, color: '#1A1A1A', marginBottom: 4, fontFamily: "'Georgia', serif" },
  dropMeta: { fontSize: 12, color: '#9a9082', fontFamily: "'Georgia', serif" },
  fileCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    textAlign: 'left' as const,
  },
  fileInfo: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  fileGlyph: {
    width: 38,
    height: 38,
    borderRadius: 9,
    background: '#CC785C',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 800,
    flexShrink: 0,
    fontFamily: "'Georgia', serif",
  },
  fileName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#1A1A1A',
    fontFamily: "'Georgia', serif",
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 280,
  },
  fileSize: { fontSize: 12, color: '#9a9082', marginTop: 2, fontFamily: "'Georgia', serif" },
  fileRemove: {
    border: '1px solid #E5DDD0',
    background: '#fff',
    color: '#8a8278',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Georgia', serif",
    flexShrink: 0,
  },
  cvHook: { fontSize: 12.5, color: '#8a8278', lineHeight: 1.55, marginTop: 10, fontStyle: 'italic' as const },
  cvParsing: {
    fontSize: 12,
    color: '#CC785C',
    marginTop: 8,
    fontFamily: "'Georgia', serif",
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  cvParsed: {
    fontSize: 12,
    color: '#5a8a5a',
    marginTop: 8,
    fontWeight: 700,
    fontFamily: "'Georgia', serif",
  },
  errorText: { fontSize: 12, color: '#C0392B', marginTop: 8, fontFamily: "'Georgia', serif" },
  valueBox: { background: '#1A1A1A', borderRadius: 14, padding: '20px 22px', marginTop: 26 },
  valueTitle: { fontSize: 12.5, fontWeight: 700, color: '#F5F1EB', marginBottom: 12, fontFamily: "'Georgia', serif", lineHeight: 1.5 },
  valueItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    fontSize: 13,
    color: '#D8D2C8',
    marginBottom: 8,
    fontFamily: "'Georgia', serif",
    lineHeight: 1.5,
  },
  valueDot: { color: '#CC785C', fontWeight: 900, lineHeight: 1.4, flexShrink: 0 },
  btnRow: { display: 'flex', gap: 10, marginTop: 30 },
  btnBack: {
    flex: 1,
    padding: '14px',
    border: '1px solid #E5DDD0',
    borderRadius: 11,
    background: 'transparent',
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Georgia', serif",
  },
  btnNext: (disabled: boolean) => ({
    flex: 2,
    padding: '14px',
    border: 'none',
    borderRadius: 11,
    background: disabled ? '#E5DDD0' : '#1A1A1A',
    color: disabled ? '#aaa' : '#F5F1EB',
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Georgia', serif",
    transition: 'all 0.15s',
  }),
  btnStart: (disabled: boolean) => ({
    flex: 2,
    padding: '15px',
    border: 'none',
    borderRadius: 11,
    background: disabled ? '#E5DDD0' : '#CC785C',
    color: disabled ? '#aaa' : '#fff',
    fontSize: 15,
    fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Georgia', serif",
    letterSpacing: 0.3,
    transition: 'all 0.15s',
  }),
  hint: { fontSize: 11.5, color: '#a59c8e', marginTop: 6, lineHeight: 1.5 },
  footer: { marginTop: 26, fontSize: 11, color: '#bbb', fontFamily: "'Georgia', serif" },
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function BarbarosLogo() {
  return (
    <div style={S.logo}>
      <span style={{ color: '#1A1A1A' }}>Barbar</span>
      <span style={{ color: '#CC785C' }}>os</span>
    </div>
  )
}

function StepDots({ current }: { current: number }) {
  return (
    <div style={S.stepIndicator}>
      {[0, 1].map(i => (
        <div key={i} style={S.dot(i === current, i < current)} />
      ))}
    </div>
  )
}

function RecommendedBadge() {
  return <span style={S.recommendBadge}>★ Recommended</span>
}

function StepLabel({ text }: { text: string }) {
  return (
    <div style={S.stepLabel}>
      {text.split('').map((ch, i) =>
        /\d/.test(ch)
          ? <span key={i} style={{ color: '#1A1A1A', fontWeight: 700 }}>{ch}</span>
          : <span key={i}>{ch}</span>
      )}
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Step 1: Candidate Profile ─────────────────────────────────────────────────

function Step1({
  data, onChange, onNext, onJobTitleBlur, errors, roleStatus, busy
}: {
  data: OnboardingData
  onChange: (key: keyof OnboardingData, val: string) => void
  onNext: () => void
  onJobTitleBlur: () => void
  errors: FieldErrors
  roleStatus: RoleStatus
  busy: boolean
}) {
  const filled =
    data.candidateName.trim() &&
    data.jobTitle.trim() &&
    data.institution.trim() &&
    data.yearsExperience &&
    data.language

  const roleInputStyle = errors.jobTitle   ? { ...S.input, borderColor: '#C0392B' } : S.input
  const nameInputStyle = errors.candidateName ? { ...S.input, borderColor: '#C0392B' } : S.input
  const instInputStyle = errors.institution   ? { ...S.input, borderColor: '#C0392B' } : S.input

  return (
    <>
      <StepLabel text="Step 1 of 2 · Candidate Profile" />
      <div style={S.heading}>Tell us about yourself</div>
      <div style={S.subtext}>Barbaros uses this to align every question with your exact role.</div>

      <div style={S.row}>
        <div>
          <label style={S.label}>Full Name</label>
          <input
            style={nameInputStyle}
            placeholder="e.g. Sarah Ahmed"
            value={data.candidateName}
            onChange={e => onChange('candidateName', e.target.value)}
          />
          {errors.candidateName && <div style={S.fieldError}>{errors.candidateName}</div>}
        </div>
        <div>
          <label style={S.label}>Target Role</label>
          <input
            style={roleInputStyle}
            placeholder="e.g. Data Analyst"
            value={data.jobTitle}
            onChange={e => onChange('jobTitle', e.target.value)}
            onBlur={onJobTitleBlur}
          />
          {errors.jobTitle
            ? <div style={S.fieldError}>{errors.jobTitle}</div>
            : roleStatus === 'checking'
              ? <div style={S.fieldChecking}>Checking…</div>
              : null}
        </div>
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Company / Institution</label>
        <input
          style={instInputStyle}
          placeholder="e.g. Ministry of Health"
          value={data.institution}
          onChange={e => onChange('institution', e.target.value)}
        />
        {errors.institution && <div style={S.fieldError}>{errors.institution}</div>}
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Years of Experience</label>
        <div style={S.chipRow}>
          {EXPERIENCE_LEVELS.map(l => (
            <button
              key={l.value}
              style={S.chip(data.yearsExperience === l.value)}
              onClick={() => onChange('yearsExperience', l.value)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Interview Language</label>
        <div style={S.chipRow}>
          {LANGUAGES.map(l => (
            <button
              key={l.value}
              style={S.chip(data.language === l.value)}
              onClick={() => onChange('language', l.value)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.btnRow}>
        <button
          style={S.btnNext(busy || !filled)}
          disabled={busy || !filled}
          onClick={onNext}
        >
          {busy ? 'Checking…' : 'Continue →'}
        </button>
      </div>
    </>
  )
}

// ─── Step 2: Interview Intelligence ────────────────────────────────────────────

function Step2({
  data, onChange, onCvSelect, onCvClear, onBack, onStart, error, cvParsing
}: {
  data: OnboardingData
  onChange: (key: keyof OnboardingData, val: string) => void
  onCvSelect: (file: File) => void
  onCvClear: () => void
  onBack: () => void
  onStart: () => void
  error: string
  cvParsing: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hasCv = Boolean(data.cvFileName)
  const ext = data.cvFileName.split('.').pop()?.toUpperCase() || 'CV'
  const cvReady = !hasCv || (!cvParsing)

  return (
    <>
      <StepLabel text="Step 2 of 2 · Interview Intelligence" />
      <div style={S.heading}>Give Barbaros your context</div>
      <div style={S.subtext}>
        The more Barbaros knows, the closer the interview gets to a real hiring panel.
        This is where a generic interview becomes a tailored assessment.
      </div>

      {/* CV Upload */}
      <div style={S.fieldGroup}>
        <div style={S.blockLabelRow}>
          <label style={{ ...S.label, marginBottom: 0 }}>Resume / CV</label>
          <RecommendedBadge />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onCvSelect(f)
            e.target.value = ''
          }}
        />

        {!hasCv ? (
          <div style={S.dropzone(false)} onClick={() => inputRef.current?.click()}>
            <div style={S.dropIcon}>↑</div>
            <div style={S.dropTitle}>Upload your CV</div>
            <div style={S.dropMeta}>PDF or DOCX · up to 5 MB</div>
          </div>
        ) : (
          <div style={S.dropzone(true)}>
            <div style={S.fileCard}>
              <div style={S.fileInfo}>
                <div style={S.fileGlyph}>{ext}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={S.fileName}>{data.cvFileName}</div>
                  <div style={S.fileSize}>{formatSize(data.cvSize)} · attached</div>
                </div>
              </div>
              <button style={S.fileRemove} onClick={onCvClear} disabled={cvParsing}>
                Remove
              </button>
            </div>
          </div>
        )}

        {cvParsing && (
          <div style={S.cvParsing}>
            <span>⟳</span> Analysing CV…
          </div>
        )}
        {!cvParsing && hasCv && data.parsedCv && (
          <div style={S.cvParsed}>✓ CV analysed</div>
        )}
        {error && <div style={S.errorText}>{error}</div>}
        <div style={S.cvHook}>
          Candidates who upload a CV receive significantly more personalized interviews and deeper evaluation.
        </div>
      </div>

      {/* Job Description */}
      <div style={S.fieldGroup}>
        <div style={S.blockLabelRow}>
          <label style={{ ...S.label, marginBottom: 0 }}>Job Description / Key Requirements</label>
          <RecommendedBadge />
        </div>
        <textarea
          style={S.textarea}
          placeholder="Paste the job description, or the key skills and requirements from the posting..."
          value={data.jobRequirements}
          onChange={e => onChange('jobRequirements', e.target.value)}
        />
        <div style={S.hint}>Barbaros maps your profile against these requirements during the interview.</div>
      </div>

      {/* Value box */}
      <div style={S.valueBox}>
        <div style={S.valueTitle}>Barbaros uses your CV and job requirements to:</div>
        {[
          'Generate role-specific questions',
          'Detect skill gaps',
          'Evaluate experience relevance',
          'Produce a more accurate final report',
        ].map(item => (
          <div key={item} style={S.valueItem}>
            <span style={S.valueDot}>•</span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div style={S.btnRow}>
        <button style={S.btnBack} onClick={onBack} disabled={cvParsing}>← Back</button>
        <button
          style={S.btnStart(!cvReady)}
          disabled={!cvReady}
          onClick={onStart}
        >
          {cvParsing ? 'Analysing CV…' : 'Start Interview →'}
        </button>
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [cvError, setCvError] = useState('')
  const [cvParsing, setCvParsing] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [roleStatus, setRoleStatus] = useState<RoleStatus>('idle')
  const [checking, setChecking] = useState(false)
  const roleCache = useRef<Map<string, boolean>>(new Map())

  const [data, setData] = useState<OnboardingData>({
    candidateName:   '',
    jobTitle:        '',
    institution:     '',
    yearsExperience: '',
    language:        'en',
    jobRequirements: '',
    cvFileName:      '',
    cvMimeType:      '',
    cvSize:          0,
    cvText:          '',
    cvSummary:       '',
    parsedCv:        null,
  })

  const update = (key: keyof OnboardingData, val: any) => {
    setData(prev => ({ ...prev, [key]: val }))
    if (key === 'jobTitle') {
      setRoleStatus('idle')
      setErrors(e => ({ ...e, jobTitle: undefined }))
    }
    if (key === 'candidateName') setErrors(e => ({ ...e, candidateName: undefined }))
    if (key === 'institution')   setErrors(e => ({ ...e, institution: undefined }))
  }

  const validateRole = async (title: string): Promise<boolean> => {
    const cacheKey = title.trim().toLowerCase()
    if (roleCache.current.has(cacheKey)) {
      const cached = roleCache.current.get(cacheKey)!
      setRoleStatus(cached ? 'valid' : 'invalid')
      return cached
    }
    setRoleStatus('checking')
    try {
      const res = await fetch('/api/validate-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle: title.trim(), language: data.language }),
      })
      const json = await res.json()
      const valid = Boolean(json?.valid)
      roleCache.current.set(cacheKey, valid)
      setRoleStatus(valid ? 'valid' : 'invalid')
      return valid
    } catch {
      setRoleStatus('valid')
      return true
    }
  }

  const handleJobTitleBlur = async () => {
    const t = data.jobTitle.trim()
    setErrors(e => ({ ...e, jobTitle: undefined }))
    if (!t) { setRoleStatus('idle'); return }
    if (!roleFormatOk(t)) {
      setRoleStatus('invalid')
      setErrors(e => ({ ...e, jobTitle: 'Please enter a valid job title.' }))
      return
    }
    const ok = await validateRole(t)
    if (!ok) setErrors(e => ({ ...e, jobTitle: 'Please enter a real job title.' }))
  }

  const handleStep1Next = async () => {
    const next: FieldErrors = {}

    if (!isReasonableText(data.candidateName, 2, 60)) next.candidateName = 'Please enter your name.'
    if (!isReasonableText(data.institution, 2, 80))   next.institution = 'Please enter a valid company or institution.'

    const role = data.jobTitle.trim()
    if (!roleFormatOk(role)) next.jobTitle = 'Please enter a valid job title.'

    if (Object.keys(next).length > 0) {
      setErrors(prev => ({ ...prev, ...next }))
      return
    }

    setChecking(true)
    const ok = await validateRole(role)
    setChecking(false)
    if (!ok) {
      setErrors(prev => ({ ...prev, jobTitle: 'Please enter a real job title.' }))
      return
    }

    setStep(1)
  }

  const handleCvSelect = async (file: File) => {
    setCvError('')
    const name = file.name.toLowerCase()
    const allowed = name.endsWith('.pdf') || name.endsWith('.docx')
    if (!allowed) {
      setCvError('Unsupported file. Please upload a PDF or DOCX.')
      return
    }
    if (file.size > MAX_CV_BYTES) {
      setCvError('File is too large. Maximum size is 5 MB.')
      return
    }

    setData(prev => ({
      ...prev,
      cvFileName: file.name,
      cvMimeType: file.type || (name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      cvSize:     file.size,
      cvText:     '',
      cvSummary:  '',
      parsedCv:   null,
    }))

    setCvParsing(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/parse-cv', { method: 'POST', body: form })
      if (res.ok) {
        const json = await res.json()
        setData(prev => ({
          ...prev,
          cvText:    json.text      ?? '',
          cvSummary: json.cvSummary ?? '',
          parsedCv:  json.parsedCv  ?? null,
        }))
      } else {
        setCvError('CV attached, but analysis did not complete. The interview will continue without CV analysis.')
      }
    } catch {
      setCvError('CV attached, but analysis did not complete. The interview will continue without CV analysis.')
    } finally {
      setCvParsing(false)
    }
  }

  const handleCvClear = () => {
    setCvError('')
    setCvParsing(false)
    setData(prev => ({
      ...prev,
      cvFileName: '',
      cvMimeType: '',
      cvSize:     0,
      cvText:     '',
      cvSummary:  '',
      parsedCv:   null,
    }))
  }

  const generateSessionId = () =>
    `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  const handleStart = () => {
    let plan = 'go'
    try {
      const raw = sessionStorage.getItem('barbaros_config')
      if (raw) {
        const prev = JSON.parse(raw)
        if (prev?.plan) plan = prev.plan
      }
    } catch {}
    try {
      const urlPlan = new URLSearchParams(window.location.search).get('plan')
      if (urlPlan) plan = urlPlan
    } catch {}

    const config = {
      sessionId:       generateSessionId(),
      candidateName:   data.candidateName.trim(),
      jobTitle:        data.jobTitle.trim(),
      institution:     data.institution.trim(),
      yearsExperience: data.yearsExperience,
      language:        data.language,
      plan,
      jobRequirements: data.jobRequirements.trim(),
      hasCv:           Boolean(data.cvFileName),
      cvFileName:      data.cvFileName,
      cvMimeType:      data.cvMimeType,
      cvText:          data.cvText,
      cvSummary:       data.cvSummary,
      parsedCv:        data.parsedCv,
      createdAt:       Date.now(),
    }

    try {
      sessionStorage.setItem('barbaros_config', JSON.stringify(config))
    } catch {
      setCvError('Storage limit reached. Try a smaller CV file, or continue without one.')
      return
    }

    router.push('/interview')
  }

  return (
    <div style={S.page}>
      <div style={S.nav}>
        <BarbarosLogo />
        <StepDots current={step} />
      </div>

      <div style={S.card}>
        {step === 0 && (
          <Step1
            data={data}
            onChange={update}
            onNext={handleStep1Next}
            onJobTitleBlur={handleJobTitleBlur}
            errors={errors}
            roleStatus={roleStatus}
            busy={checking}
          />
        )}
        {step === 1 && (
          <Step2
            data={data}
            onChange={update}
            onCvSelect={handleCvSelect}
            onCvClear={handleCvClear}
            onBack={() => setStep(0)}
            onStart={handleStart}
            error={cvError}
            cvParsing={cvParsing}
          />
        )}
      </div>

      <div style={S.footer}>
        <span style={{ color: '#1A1A1A', fontWeight: 900 }}>Barbar</span>
        <span style={{ color: '#CC785C', fontWeight: 900 }}>os</span>
        {' '}· Engineered to the highest hiring standards
      </div>
    </div>
  )
}
