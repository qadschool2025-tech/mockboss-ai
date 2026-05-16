'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingData {
  // Step 1
  candidateName: string
  jobTitle: string
  institution: string
  sector: string
  // Step 2
  yearsExperience: string
  language: string
  plan: string
  jobRequirements: string
  isCareerSwitch: boolean
  // Step 3
  cvSummary: string
}

const SECTORS = [
  'Education', 'Healthcare', 'Engineering', 'Finance', 'Technology',
  'Legal', 'Marketing', 'Operations', 'HR', 'Sales', 'Other'
]

const EXPERIENCE_LEVELS = [
  { value: 'less than 1 year', label: '< 1 year' },
  { value: '1-3 years',        label: '1–3 years' },
  { value: '3-5 years',        label: '3–5 years' },
  { value: '5-10 years',       label: '5–10 years' },
  { value: '10+ years',        label: '10+ years' },
]

const PLANS = [
  { value: 'go',     label: 'Go',     desc: '$2.50 / session · 15 min' },
  { value: 'pro',    label: 'Pro',    desc: '$15 / mo · 30 min' },
  { value: 'expert', label: 'Expert', desc: '$49 / mo · 45 min' },
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: '100vh',
    background: '#F5F1EB',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '0 16px 48px',
    fontFamily: "'Georgia', 'Times New Roman', serif",
  },
  nav: {
    width: '100%',
    maxWidth: 520,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 0 0',
    marginBottom: 36,
  },
  logo: {
    fontWeight: 900,
    fontSize: 18,
    letterSpacing: '-0.5px',
    fontFamily: "'Georgia', serif",
  },
  stepIndicator: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  dot: (active: boolean, done: boolean) => ({
    width: active ? 24 : 8,
    height: 8,
    borderRadius: 4,
    background: done ? '#CC785C' : active ? '#1A1A1A' : '#E5DDD0',
    transition: 'all 0.3s ease',
  }),
  card: {
    width: '100%',
    maxWidth: 520,
    background: '#fff',
    border: '1px solid #E5DDD0',
    borderRadius: 16,
    padding: '32px 28px',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: '#CC785C',
    marginBottom: 8,
    fontFamily: "'Georgia', serif",
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1A1A1A',
    marginBottom: 4,
    lineHeight: 1.3,
    fontFamily: "'Georgia', serif",
  },
  subtext: {
    fontSize: 13,
    color: '#888',
    marginBottom: 28,
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: '#1A1A1A',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    fontFamily: "'Georgia', serif",
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid #E5DDD0',
    borderRadius: 10,
    fontSize: 14,
    color: '#1A1A1A',
    background: '#FAF8F5',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: "'Georgia', serif",
  },
  textarea: {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid #E5DDD0',
    borderRadius: 10,
    fontSize: 14,
    color: '#1A1A1A',
    background: '#FAF8F5',
    outline: 'none',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    minHeight: 100,
    fontFamily: "'Georgia', serif",
    lineHeight: 1.6,
  },
  select: {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid #E5DDD0',
    borderRadius: 10,
    fontSize: 14,
    color: '#1A1A1A',
    background: '#FAF8F5',
    outline: 'none',
    boxSizing: 'border-box' as const,
    appearance: 'none' as const,
    cursor: 'pointer',
    fontFamily: "'Georgia', serif",
  },
  fieldGroup: {
    marginBottom: 20,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
    marginBottom: 20,
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 20,
  },
  chip: (active: boolean) => ({
    padding: '7px 14px',
    borderRadius: 8,
    border: `1px solid ${active ? '#CC785C' : '#E5DDD0'}`,
    background: active ? '#CC785C' : '#FAF8F5',
    color: active ? '#fff' : '#1A1A1A',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: active ? 700 : 400,
    fontFamily: "'Georgia', serif",
    transition: 'all 0.15s',
  }),
  planRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    marginBottom: 20,
  },
  planCard: (active: boolean) => ({
    padding: '12px 16px',
    borderRadius: 10,
    border: `1.5px solid ${active ? '#CC785C' : '#E5DDD0'}`,
    background: active ? '#FDF6F2' : '#FAF8F5',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.15s',
  }),
  planName: (active: boolean) => ({
    fontWeight: 800,
    fontSize: 14,
    color: active ? '#CC785C' : '#1A1A1A',
    fontFamily: "'Georgia', serif",
  }),
  planDesc: {
    fontSize: 12,
    color: '#888',
    fontFamily: "'Georgia', serif",
  },
  toggle: (active: boolean) => ({
    width: 40,
    height: 22,
    borderRadius: 11,
    background: active ? '#CC785C' : '#E5DDD0',
    display: 'flex',
    alignItems: 'center',
    padding: '0 3px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  }),
  toggleKnob: (active: boolean) => ({
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    transform: active ? 'translateX(18px)' : 'translateX(0)',
    transition: 'transform 0.2s',
  }),
  btnRow: {
    display: 'flex',
    gap: 10,
    marginTop: 28,
  },
  btnBack: {
    flex: 1,
    padding: '13px',
    border: '1px solid #E5DDD0',
    borderRadius: 10,
    background: 'transparent',
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Georgia', serif",
  },
  btnNext: (disabled: boolean) => ({
    flex: 2,
    padding: '13px',
    border: 'none',
    borderRadius: 10,
    background: disabled ? '#E5DDD0' : '#1A1A1A',
    color: disabled ? '#aaa' : '#F5F1EB',
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Georgia', serif",
    transition: 'all 0.15s',
  }),
  btnStart: {
    width: '100%',
    padding: '15px',
    border: 'none',
    borderRadius: 10,
    background: '#CC785C',
    color: '#fff',
    fontSize: 15,
    fontWeight: 900,
    cursor: 'pointer',
    fontFamily: "'Georgia', serif",
    letterSpacing: 0.3,
    marginTop: 28,
  },
  hint: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 5,
    lineHeight: 1.4,
  },
  divider: {
    height: 1,
    background: '#E5DDD0',
    margin: '24px 0',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: 13,
    borderBottom: '1px solid #F0EDE8',
  },
  summaryKey: {
    color: '#888',
    fontFamily: "'Georgia', serif",
  },
  summaryVal: {
    color: '#1A1A1A',
    fontWeight: 700,
    fontFamily: "'Georgia', serif",
    textAlign: 'right' as const,
    maxWidth: 240,
  },
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

// ─── Step Dots ────────────────────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
  return (
    <div style={S.stepIndicator}>
      {[0, 1, 2].map(i => (
        <div key={i} style={S.dot(i === current, i < current)} />
      ))}
    </div>
  )
}

// ─── Step 1: Identity ─────────────────────────────────────────────────────────

function Step1({
  data, onChange, onNext
}: {
  data: OnboardingData
  onChange: (key: keyof OnboardingData, val: string) => void
  onNext: () => void
}) {
  const valid = data.candidateName.trim() && data.jobTitle.trim() && data.institution.trim() && data.sector

  return (
    <>
      <div style={S.stepLabel}>Step 1 of 3</div>
      <div style={S.heading}>Tell us about yourself</div>
      <div style={S.subtext}>Barbaros uses this to tailor every question to your exact role.</div>

      <div style={S.row}>
        <div>
          <label style={S.label}>Your name</label>
          <input
            style={S.input}
            placeholder="e.g. Sarah"
            value={data.candidateName}
            onChange={e => onChange('candidateName', e.target.value)}
          />
        </div>
        <div>
          <label style={S.label}>Job title</label>
          <input
            style={S.input}
            placeholder="e.g. Data Analyst"
            value={data.jobTitle}
            onChange={e => onChange('jobTitle', e.target.value)}
          />
        </div>
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Institution / Company</label>
        <input
          style={S.input}
          placeholder="e.g. Ministry of Health"
          value={data.institution}
          onChange={e => onChange('institution', e.target.value)}
        />
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Sector</label>
        <div style={S.chipRow}>
          {SECTORS.map(s => (
            <button
              key={s}
              style={S.chip(data.sector === s)}
              onClick={() => onChange('sector', s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={S.btnRow}>
        <button
          style={S.btnNext(!valid)}
          disabled={!valid}
          onClick={onNext}
        >
          Continue →
        </button>
      </div>
    </>
  )
}

// ─── Step 2: Session Config ────────────────────────────────────────────────────

function Step2({
  data, onChange, onNext, onBack
}: {
  data: OnboardingData
  onChange: (key: keyof OnboardingData, val: any) => void
  onNext: () => void
  onBack: () => void
}) {
  const valid = data.yearsExperience && data.language && data.plan

  return (
    <>
      <div style={S.stepLabel}>Step 2 of 3</div>
      <div style={S.heading}>Session settings</div>
      <div style={S.subtext}>Configure your interview experience.</div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Years of experience</label>
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
        <label style={S.label}>Interview language</label>
        <div style={S.chipRow}>
          {[
            { value: 'en', label: 'English' },
            { value: 'ar', label: 'العربية' },
            { value: 'mixed', label: 'Mixed' },
          ].map(l => (
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

      <div style={S.fieldGroup}>
        <label style={S.label}>Plan</label>
        <div style={S.planRow}>
          {PLANS.map(p => (
            <div
              key={p.value}
              style={S.planCard(data.plan === p.value)}
              onClick={() => onChange('plan', p.value)}
            >
              <div>
                <div style={S.planName(data.plan === p.value)}>{p.label}</div>
                <div style={S.planDesc}>{p.desc}</div>
              </div>
              {data.plan === p.value && (
                <div style={{ color: '#CC785C', fontSize: 18 }}>✓</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Job requirements <span style={{ fontWeight: 400, color: '#aaa' }}>(optional)</span></label>
        <textarea
          style={{ ...S.textarea, minHeight: 70 }}
          placeholder="Paste key skills or requirements from the job posting..."
          value={data.jobRequirements}
          onChange={e => onChange('jobRequirements', e.target.value)}
        />
        <div style={S.hint}>Barbaros will tailor questions to match these requirements.</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', fontFamily: "'Georgia', serif" }}>Career switch?</div>
          <div style={{ fontSize: 12, color: '#888' }}>Coming from a different field</div>
        </div>
        <div
          style={S.toggle(data.isCareerSwitch)}
          onClick={() => onChange('isCareerSwitch', !data.isCareerSwitch)}
        >
          <div style={S.toggleKnob(data.isCareerSwitch)} />
        </div>
      </div>

      <div style={S.btnRow}>
        <button style={S.btnBack} onClick={onBack}>← Back</button>
        <button style={S.btnNext(!valid)} disabled={!valid} onClick={onNext}>
          Continue →
        </button>
      </div>
    </>
  )
}

// ─── Step 3: CV + Confirm ──────────────────────────────────────────────────────

function Step3({
  data, onChange, onBack, onStart
}: {
  data: OnboardingData
  onChange: (key: keyof OnboardingData, val: string) => void
  onBack: () => void
  onStart: () => void
}) {
  const summaryItems = [
    { key: 'Role',       val: `${data.jobTitle} · ${data.institution}` },
    { key: 'Sector',     val: data.sector },
    { key: 'Experience', val: data.yearsExperience },
    { key: 'Language',   val: data.language === 'en' ? 'English' : data.language === 'ar' ? 'Arabic' : 'Mixed' },
    { key: 'Plan',       val: PLANS.find(p => p.value === data.plan)?.desc ?? data.plan },
  ]

  return (
    <>
      <div style={S.stepLabel}>Step 3 of 3</div>
      <div style={S.heading}>Almost ready</div>
      <div style={S.subtext}>Add your CV summary for tailored questions, then start.</div>

      <div style={S.fieldGroup}>
        <label style={S.label}>CV summary <span style={{ fontWeight: 400, color: '#aaa' }}>(optional)</span></label>
        <textarea
          style={S.textarea}
          placeholder="Brief summary of your background, key skills, and notable achievements. Barbaros will use this to ask targeted questions."
          value={data.cvSummary}
          onChange={e => onChange('cvSummary', e.target.value)}
        />
        <div style={S.hint}>You can paste 2–5 sentences. Full CV upload coming soon.</div>
      </div>

      <div style={S.divider} />

      <div style={{ marginBottom: 4 }}>
        {summaryItems.map(item => (
          <div key={item.key} style={S.summaryRow}>
            <span style={S.summaryKey}>{item.key}</span>
            <span style={S.summaryVal}>{item.val}</span>
          </div>
        ))}
        {data.isCareerSwitch && (
          <div style={S.summaryRow}>
            <span style={S.summaryKey}>Career switch</span>
            <span style={{ ...S.summaryVal, color: '#CC785C' }}>Yes</span>
          </div>
        )}
      </div>

      <button style={S.btnStart} onClick={onStart}>
        Start Interview →
      </button>

      <div style={S.btnRow}>
        <button style={{ ...S.btnBack, flex: 1, marginTop: 0 }} onClick={onBack}>
          ← Back
        </button>
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<OnboardingData>({
    candidateName:  '',
    jobTitle:       '',
    institution:    '',
    sector:         '',
    yearsExperience: '',
    language:       'en',
    plan:           'go',
    jobRequirements: '',
    isCareerSwitch: false,
    cvSummary:      '',
  })

  const update = (key: keyof OnboardingData, val: any) => {
    setData(prev => ({ ...prev, [key]: val }))
  }

  const generateSessionId = () =>
    `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  const handleStart = () => {
    const sessionId = generateSessionId()
    const params = new URLSearchParams({
      sessionId,
      candidateName:   data.candidateName,
      jobTitle:        data.jobTitle,
      institution:     data.institution,
      sector:          data.sector,
      yearsExperience: data.yearsExperience,
      language:        data.language,
      plan:            data.plan,
      isCareerSwitch:  String(data.isCareerSwitch),
      ...(data.jobRequirements && { jobRequirements: data.jobRequirements }),
      ...(data.cvSummary       && { cvSummary: data.cvSummary }),
    })
    router.push(`/interview?${params.toString()}`)
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
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <Step2
            data={data}
            onChange={update}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <Step3
            data={data}
            onChange={update}
            onBack={() => setStep(1)}
            onStart={handleStart}
          />
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#bbb', fontFamily: "'Georgia', serif" }}>
        <span style={{ color: '#1A1A1A', fontWeight: 900 }}>Barbar</span>
        <span style={{ color: '#CC785C', fontWeight: 900 }}>os</span>
        {' '}· Based on the highest hiring standards
      </div>
    </div>
  )
}
