// app/report/page.tsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Competency {
  name: string
  score: number
  why: string
}

interface ReplayItem {
  question: string
  answer: string
  score: number
  analysis: string
  weakened: string
  stronger: string
}

interface AssessmentCoverage {
  title: string
  summary: string
  coveredAreaKeys?: string[]
  coveredAreas: string[]
  recommendedForDeeperAssessment: string[]
  upgradeNote: string
}

interface Report {
  finalScore: number
  readinessLevel: string
  hireProbability: number
  verdict: string
  barbarosAssessment: string
  assessmentCoverage?: AssessmentCoverage
  competencies: Competency[]
  hiddenWeakness: string
  behavioralPatterns: string
  replay: ReplayItem[]
  recommendation: string
}

interface Stored {
  report: Report
  candidateName: string
  jobTitle: string
  institution: string
  sector: string
  yearsExperience: string
  language: string
  plan: string
  reportDate: string
  reportReference: string
}

type Lang = 'en' | 'ar'

/* ---------- Brand + design tokens ---------- */

const SERIF = 'Georgia, "Times New Roman", "Noto Serif", serif'

const Barbaros = ({ size = 22 }: { size?: number }) => (
  <span style={{ fontWeight: 900, fontSize: size, letterSpacing: 0.2 }}>
    <span style={{ color: '#1A1A1A' }}>Barbar</span>
    <span style={{ color: '#CC785C' }}>os</span>
  </span>
)

// Premium, brand-aligned palette (no traffic-light colors).
const scoreColor = (s: number) =>
  s >= 75 ? '#3F6B5E' : s >= 50 ? '#CC785C' : s >= 25 ? '#B07A2E' : '#A14234'

/* ---------- Arabic label guards ---------- */

const AR_READINESS_LEVELS: Record<string, string> = {
  'Strong Hire':       'جاهز بقوة',
  'Maybe Hire':        'قابل للتوصية بحذر',
  'Risky Candidate':   'مخاطرة عالية',
  'Not Recommended':   'غير جاهز حالياً',
}

const AR_COMPETENCY_NAMES: Record<string, string> = {
  'Communication':    'التواصل المهني',
  'Confidence':       'الحضور والاتزان',
  'Domain Expertise': 'التمكّن المهني في المجال',
  'Structure':        'بنية الطرح',
  'Problem Solving':  'حل المشكلات',
  'Clarity':          'وضوح الإجابة',
}

function displayReadinessLevel(level: string, isAr: boolean) {
  if (!isAr) return level
  return AR_READINESS_LEVELS[level] ?? level
}

function displayCompetencyName(name: string, isAr: boolean) {
  if (!isAr) return name
  return AR_COMPETENCY_NAMES[name] ?? name
}

// Format an ISO timestamp into a clean, localized report date.
// Returns '' for missing/invalid input so the cover can hide it gracefully.
function formatReportDate(iso: string, isAr: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  try {
    return d.toLocaleDateString(isAr ? 'ar' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

// Subtle tint from a 6-digit hex, returned as rgba() for full support.
const tint = (hex: string, alpha = 0.07) => {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Small uppercase labels: in Arabic, drop letter-spacing/uppercase so the
// connected (cursive) letters are not broken apart.
function labelType(isAr: boolean): React.CSSProperties {
  return {
    letterSpacing: isAr ? 0 : 0.5,
    textTransform: isAr ? 'none' : 'uppercase',
  }
}

function verdictStyle(level: string) {
  const l = level.toLowerCase()

  if (l.includes('strong') || level.includes('جاهز بقوة')) {
    return { color: '#2E5248', bg: '#E9EFEB', border: '#C6D8CE' }
  }

  if (l.includes('maybe') || level.includes('قابل')) {
    return { color: '#8A4A2E', bg: '#F6EAE1', border: '#E7CBBA' }
  }

  if (l.includes('risky') || level.includes('مخاطرة')) {
    return { color: '#86591D', bg: '#F4ECDB', border: '#E3D0A9' }
  }

  return { color: '#7A2E24', bg: '#F3E3DE', border: '#DFC1B8' }
}

/* ---------- Score ring (SVG, rounded cap) ---------- */

function ScoreRing({ score }: { score: number }) {
  const r = 58
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100)
  const color = scoreColor(score)

  return (
    <div style={{ position: 'relative', width: 130, height: 130, margin: '0 auto 16px' }}>
      <svg
        width="130"
        height="130"
        viewBox="0 0 130 130"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle cx="65" cy="65" r={r} fill="none" stroke="#E5DDD0" strokeWidth="9" />
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 700, color, lineHeight: 1 }}>
          {score}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>/100</div>
      </div>
    </div>
  )
}

/* ---------- Section: every section carries the Barbaros wordmark ---------- */

const Section = ({
  children,
  style,
  lang = 'en',
  className,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  lang?: Lang
  className?: string
}) => (
  <div
    className={className ? `section-card ${className}` : 'section-card'}
    style={{
      background: '#FFFFFF',
      border: '1px solid #E5DDD0',
      borderRadius: 20,
      padding: '22px',
      marginBottom: 16,
      boxShadow: '0 2px 12px rgba(26,26,26,0.05)',
      ...style,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '0.5px solid rgba(26,26,26,0.08)',
      }}
    >
      <Barbaros size={12} />
      <span
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: lang === 'ar' ? 0 : 1.4,
          textTransform: lang === 'ar' ? 'none' : 'uppercase',
          color: 'rgba(26,26,26,0.30)',
        }}
      >
        {lang === 'ar' ? 'ذكاء المقابلات' : 'Interview Intelligence'}
      </span>
    </div>

    {children}
  </div>
)

const SectionTitle = ({
  children,
  color = '#1A1A1A',
}: {
  children: React.ReactNode
  color?: string
}) => (
  <div
    style={{
      fontFamily: SERIF,
      fontSize: 16,
      fontWeight: 700,
      marginBottom: 16,
      color,
      letterSpacing: 0.2,
    }}
  >
    {children}
  </div>
)

function hasCoverage(coverage?: AssessmentCoverage): coverage is AssessmentCoverage {
  if (!coverage) return false

  return Boolean(
    coverage.summary ||
      coverage.upgradeNote ||
      (Array.isArray(coverage.coveredAreas) && coverage.coveredAreas.length > 0) ||
      (
        Array.isArray(coverage.recommendedForDeeperAssessment) &&
        coverage.recommendedForDeeperAssessment.length > 0
      )
  )
}

/* ---------- Performance path across interview questions ---------- */
/* Frontend-only: derived from replay[].score order. No timestamps exist. */

function PerformancePath({ replay, isAr }: { replay: ReplayItem[]; isAr: boolean }) {
  const scores = replay
    .map(item => item.score)
    .filter(v => typeof v === 'number' && !Number.isNaN(v))

  if (scores.length < 2) return null

  const n = scores.length
  const max = Math.max(...scores)
  const min = Math.min(...scores)
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / n)
  const peakIdx = scores.indexOf(max)
  const lowIdx = scores.indexOf(min)

  // Trend: compare average of second half vs first half.
  const half = Math.floor(n / 2)
  const firstAvg = scores.slice(0, half).reduce((a, b) => a + b, 0) / half
  const secondAvg = scores.slice(n - half).reduce((a, b) => a + b, 0) / half
  const delta = secondAvg - firstAvg
  const trend: 'up' | 'down' | 'flat' = delta >= 5 ? 'up' : delta <= -5 ? 'down' : 'flat'

  const trendLabel = isAr
    ? trend === 'up'
      ? 'الاتجاه العام: أداء يتحسن مع تقدم المقابلة'
      : trend === 'down'
        ? 'الاتجاه العام: أداء يتراجع مع تقدم المقابلة'
        : 'الاتجاه العام: أداء مستقر عبر المقابلة'
    : trend === 'up'
      ? 'Overall trend: performance improved as the interview progressed'
      : trend === 'down'
        ? 'Overall trend: performance declined as the interview progressed'
        : 'Overall trend: performance remained stable across the interview'

  const trendColor = trend === 'up' ? '#3F6B5E' : trend === 'down' ? '#A14234' : '#86591D'

  // SVG geometry
  const W = 640
  const H = 200
  const padX = 36
  const padTop = 26
  const padBottom = 40
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom

  const x = (i: number) => padX + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1))
  const y = (v: number) => padTop + innerH * (1 - Math.max(0, Math.min(100, v)) / 100)

  const points = scores.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const areaPoints = `${x(0)},${padTop + innerH} ${points} ${x(n - 1)},${padTop + innerH}`

  const statBox = (label: string, value: string, color: string) => (
    <div
      key={label}
      style={{
        background: tint(color, 0.07),
        border: `0.5px solid ${color}40`,
        borderRadius: 12,
        padding: '10px 12px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(26,26,26,0.45)', marginBottom: 4, ...labelType(isAr) }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, color }}>{value}</div>
    </div>
  )

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={isAr ? 'مسار الأداء عبر أسئلة المقابلة' : 'Performance path across interview questions'}
      >
        {[0, 25, 50, 75, 100].map(g => (
          <g key={g}>
            <line
              x1={padX}
              x2={W - padX}
              y1={y(g)}
              y2={y(g)}
              stroke="#E5DDD0"
              strokeWidth={g === 0 ? 1 : 0.5}
              strokeDasharray={g === 0 ? undefined : '3 4'}
            />
            <text
              x={padX - 8}
              y={y(g) + 3.5}
              textAnchor="end"
              fontSize="9"
              fill="rgba(26,26,26,0.35)"
            >
              {g}
            </text>
          </g>
        ))}

        <polygon points={areaPoints} fill="rgba(204,120,92,0.08)" />
        <polyline
          points={points}
          fill="none"
          stroke="#CC785C"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {scores.map((v, i) => {
          const isPeak = i === peakIdx
          const isLow = i === lowIdx
          const c = isPeak ? '#3F6B5E' : isLow ? '#A14234' : '#CC785C'
          return (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r={isPeak || isLow ? 5.5 : 3.5} fill={c} stroke="#FFFFFF" strokeWidth="1.5" />
              <text
                x={x(i)}
                y={H - padBottom + 16}
                textAnchor="middle"
                fontSize="9.5"
                fill="rgba(26,26,26,0.45)"
              >
                {isAr ? `س${i + 1}` : `Q${i + 1}`}
              </text>
              {(isPeak || isLow) && (
                <text
                  x={x(i)}
                  y={y(v) - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="800"
                  fill={c}
                >
                  {v}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginTop: 14,
          marginBottom: 12,
        }}
      >
        {statBox(
          isAr ? 'أعلى نقطة أداء' : 'Peak performance',
          `${max} · ${isAr ? `س${peakIdx + 1}` : `Q${peakIdx + 1}`}`,
          '#3F6B5E'
        )}
        {statBox(
          isAr ? 'أدنى نقطة أداء' : 'Lowest point',
          `${min} · ${isAr ? `س${lowIdx + 1}` : `Q${lowIdx + 1}`}`,
          '#A14234'
        )}
        {statBox(isAr ? 'متوسط الأداء' : 'Average', `${avg}`, '#CC785C')}
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: trendColor,
          background: tint(trendColor, 0.07),
          border: `0.5px solid ${trendColor}33`,
          borderRadius: 10,
          padding: '9px 12px',
        }}
      >
        {trendLabel}
      </div>
    </div>
  )
}

/* ---------- Premium cover helpers ---------- */

function safeText(value: string | undefined, fallback: string) {
  const v = typeof value === 'string' ? value.trim() : ''
  return v || fallback
}

function displayPlanName(plan: string) {
  const key = (plan || '').toLowerCase()
  if (key.includes('executive')) return 'Executive Interview'
  if (key.includes('professional') || key.includes('pro')) return 'Professional Interview'
  if (key.includes('essential') || key.includes('basic') || key.includes('free')) return 'Essential Interview'
  return 'Barbaros Interview'
}

function shortReference(value: string | undefined) {
  if (!value) return ''
  return value.replace(/-/g, '').slice(0, 10).toUpperCase()
}

const MetaItem = ({
  label,
  value,
  isAr,
}: {
  label: string
  value: string
  isAr: boolean
}) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.72)',
      border: '0.5px solid rgba(229,221,208,0.9)',
      borderRadius: 14,
      padding: '12px 14px',
      minHeight: 64,
    }}
  >
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        color: 'rgba(26,26,26,0.42)',
        marginBottom: 6,
        ...labelType(isAr),
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', lineHeight: 1.5 }}>
      {value}
    </div>
  </div>
)

function ReportCover({
  data,
  isAr,
  readinessLabel,
  reportDate,
  reference,
  summaryLine,
  assessment,
}: {
  data: Stored
  isAr: boolean
  readinessLabel: string
  reportDate: string
  reference: string
  summaryLine: string
  assessment: string
}) {
  return (
    <section
      className="report-cover"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8EFE7 52%, #F1E4D5 100%)',
        border: '1px solid rgba(204,120,92,0.25)',
        borderRadius: 26,
        padding: '28px',
        marginBottom: 18,
        boxShadow: '0 12px 34px rgba(26,26,26,0.08)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'rgba(204,120,92,0.10)',
          top: -86,
          insetInlineEnd: -78,
        }}
      />

      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <Barbaros size={26} />
            <div
              style={{
                marginTop: 8,
                fontSize: 10.5,
                fontWeight: 800,
                color: 'rgba(26,26,26,0.45)',
                ...labelType(isAr),
              }}
            >
              {isAr ? 'منهجية تقييم مقابلات قائمة على الكفاءات' : 'Competency-Based Interview Assessment'}
            </div>
          </div>

          <div
            style={{
              background: '#1A1A1A',
              color: '#FFFFFF',
              borderRadius: 999,
              padding: '8px 14px',
              fontSize: 11,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {displayPlanName(data.plan)}
          </div>
        </div>

        <div
          className="cover-title-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.8fr',
            gap: 18,
            alignItems: 'end',
            marginBottom: 22,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: '#CC785C',
                marginBottom: 8,
                ...labelType(isAr),
              }}
            >
              {isAr ? 'تقرير تقييم المقابلة' : 'Interview Assessment Report'}
            </div>

            <h1
              style={{
                fontFamily: SERIF,
                fontSize: 34,
                lineHeight: 1.12,
                color: '#1A1A1A',
                margin: 0,
                letterSpacing: -0.4,
              }}
            >
              {safeText(data.candidateName, isAr ? 'المرشح' : 'Candidate')}
            </h1>
          </div>

          <div
            style={{
              background: 'linear-gradient(135deg, #5A463E 0%, #3F322D 100%)',
              borderRadius: 18,
              padding: '16px 18px',
              color: '#FFFFFF',
              textAlign: isAr ? 'right' : 'left',
            }}
          >
            <div style={{ fontSize: 10, color: '#D8C7BD', fontWeight: 800, marginBottom: 7, ...labelType(isAr) }}>
              {isAr ? 'الحكم المهني' : 'Professional Verdict'}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>
              {readinessLabel}
            </div>
          </div>
        </div>

        <div
          className="cover-meta-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            marginBottom: 18,
          }}
        >
          <MetaItem
            isAr={isAr}
            label={isAr ? 'المسمى المستهدف' : 'Target Role'}
            value={safeText(data.jobTitle, isAr ? 'غير محدد' : 'Not provided')}
          />
          <MetaItem
            isAr={isAr}
            label={isAr ? 'الجهة أو القطاع' : 'Institution or Sector'}
            value={safeText(data.institution || data.sector, isAr ? 'غير محدد' : 'Not provided')}
          />
          <MetaItem
            isAr={isAr}
            label={isAr ? 'سنوات الخبرة' : 'Years of Experience'}
            value={safeText(data.yearsExperience, isAr ? 'غير محدد' : 'Not provided')}
          />
          <MetaItem
            isAr={isAr}
            label={isAr ? 'تاريخ التقرير' : 'Report Date'}
            value={reportDate || (isAr ? 'غير متاح' : 'Not available')}
          />
          <MetaItem
            isAr={isAr}
            label={isAr ? 'مرجع التقرير' : 'Report Reference'}
            value={reference || (isAr ? 'غير متاح' : 'Not available')}
          />
          <MetaItem
            isAr={isAr}
            label={isAr ? 'النتيجة الإجمالية' : 'Overall Score'}
            value={`${data.report.finalScore} / 100`}
          />
        </div>

        <div
          style={{
            padding: '16px 18px',
            background: 'rgba(255,255,255,0.78)',
            border: '0.5px solid rgba(229,221,208,0.9)',
            borderRadius: 14,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: '#CC785C',
              marginBottom: 10,
              ...labelType(isAr),
            }}
          >
            {isAr ? 'الخلاصة التقييمية' : 'Executive Summary'}
          </div>

          <div
            style={{
              fontSize: 13,
              color: '#1A1A1A',
              lineHeight: 1.9,
              marginBottom: assessment ? 12 : 0,
            }}
          >
            {summaryLine}
          </div>

          {assessment && (
            <div
              style={{
                fontSize: 12.5,
                color: '#1A1A1A',
                lineHeight: 1.9,
                fontStyle: 'italic',
                paddingTop: 12,
                borderTop: '0.5px solid rgba(26,26,26,0.08)',
              }}
            >
              "{assessment}"
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/* ---------- Premium generating screen (UI-only staged progress) ---------- */
/* Stages are presentational pacing; completion is driven solely by polling. */

const GENERATION_STAGES = {
  ar: [
    'قراءة المقابلة كاملة',
    'تحليل الإجابات والأدلة',
    'قياس الكفاءات الست',
    'رصد الأنماط السلوكية',
    'بناء التوصيات',
    'إخراج التقرير النهائي',
  ],
  en: [
    'Reading the full interview',
    'Analyzing answers and evidence',
    'Measuring the six competencies',
    'Detecting behavioral patterns',
    'Building recommendations',
    'Finalizing your report',
  ],
} as const

function GeneratingScreen({ lang }: { lang: Lang }) {
  const isAr = lang === 'ar'
  const stages = GENERATION_STAGES[isAr ? 'ar' : 'en']
  const [stage, setStage] = useState(0)

  useEffect(() => {
    // Advance through stages on a fixed cadence, hold on the last one.
    const t = setInterval(() => {
      setStage(prev => (prev < stages.length - 1 ? prev + 1 : prev))
    }, 7000)
    return () => clearInterval(t)
  }, [stages.length])

  const progress = Math.min(92, Math.round(((stage + 1) / stages.length) * 100))

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        minHeight: '100vh',
        background: '#F5F1EB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}
    >
      <style>{`
        @keyframes barbarosPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.85; }
        }
        @keyframes barbarosSheen {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#FFFFFF',
          border: '1px solid #E5DDD0',
          borderRadius: 22,
          padding: '30px 26px',
          boxShadow: '0 12px 34px rgba(26,26,26,0.07)',
          textAlign: 'center',
        }}
      >
        <div style={{ animation: 'barbarosPulse 2.4s ease-in-out infinite', display: 'inline-block' }}>
          <Barbaros size={26} />
        </div>

        <div
          style={{
            marginTop: 14,
            fontFamily: SERIF,
            fontSize: 17,
            fontWeight: 700,
            color: '#1A1A1A',
          }}
        >
          {isAr ? 'يجري إعداد تقريرك الآن' : 'Your report is being prepared'}
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: 'rgba(26,26,26,0.5)',
            lineHeight: 1.7,
          }}
        >
          {isAr
            ? 'يُرجى إبقاء هذه الصفحة مفتوحة. عادةً تستغرق العملية دقيقة إلى دقيقتين.'
            : 'Please keep this page open. This usually takes one to two minutes.'}
        </div>

        <div
          style={{
            marginTop: 20,
            height: 7,
            background: '#F5F1EB',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              borderRadius: 6,
              background:
                'linear-gradient(90deg, #CC785C 25%, #E2A088 50%, #CC785C 75%)',
              backgroundSize: '200% 100%',
              animation: 'barbarosSheen 2.2s linear infinite',
              transition: 'width 1.2s ease',
            }}
          />
        </div>

        <div style={{ marginTop: 22, textAlign: isAr ? 'right' : 'left' }}>
          {stages.map((label, i) => {
            const done = i < stage
            const active = i === stage
            const color = done ? '#3F6B5E' : active ? '#CC785C' : 'rgba(26,26,26,0.30)'

            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 0',
                  fontSize: 12.5,
                  fontWeight: active ? 800 : 600,
                  color,
                  transition: 'color 0.4s ease',
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 900,
                    color: done || active ? '#FFFFFF' : 'rgba(26,26,26,0.35)',
                    background: done
                      ? '#3F6B5E'
                      : active
                        ? '#CC785C'
                        : '#EDE6D8',
                    animation: active ? 'barbarosPulse 1.6s ease-in-out infinite' : undefined,
                  }}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span>{label}</span>
              </div>
            )
          })}
        </div>

        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '0.5px solid rgba(26,26,26,0.08)',
            fontSize: 11,
            color: 'rgba(26,26,26,0.38)',
            lineHeight: 1.7,
          }}
        >
          {isAr
            ? 'يُبنى كل قسم في تقريرك على أدلة فعلية من إجاباتك في المقابلة.'
            : 'Every section of your report is built on actual evidence from your interview answers.'}
        </div>
      </div>
    </div>
  )
}

/* ---------- Shared centered screen for non-report states ---------- */


function CenteredScreen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F5F1EB',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )
}

/* ---------- Report view (premium restyle, fed by props) ---------- */

function ReportView({ data }: { data: Stored }) {
  const router = useRouter()
  const [showReplay, setShowReplay] = useState(true)

  const isAr = data.language === 'ar'
  const lang: Lang = isAr ? 'ar' : 'en'
  const r = data.report
  const readinessLabel = displayReadinessLevel(r.readinessLevel, isAr)
  const v = verdictStyle(readinessLabel)
  const coverage = r.assessmentCoverage

  const footerText = isAr
    ? 'تم إعداد هذا التقرير وفق منهجية تقييم منظمة قائمة على الكفاءات، ومتوافقة مع ممارسات التوظيف الحديثة المستخدمة في الجهات الحكومية، والمؤسسات العالمية، والشركات الرائدة في القطاع الخاص.'
    : 'Generated through a structured, competency-based evaluation methodology aligned with modern hiring practices used across government entities, global organizations, and leading private-sector companies.'

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="report-root"
      style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#F5F1EB',
        color: '#1A1A1A',
        minHeight: '100vh',
      }}
    >
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-show { display: block !important; }
          .print-header { display: flex !important; }
          body { background: #F5F1EB !important; }
          html, body, .report-root, .section-card {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .report-shell {
            max-width: 100% !important;
            padding: 0 !important;
          }
          .section-card {
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
          }
          .report-cover {
            break-after: page;
            page-break-after: always;
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
          }
          .cover-title-grid { grid-template-columns: 1.35fr 0.85fr !important; }
          .cover-meta-grid { grid-template-columns: repeat(3, 1fr) !important; }
          @page { margin: 16mm; }
        }
        @media screen {
          .print-header { display: none; }
        }
        @media screen and (max-width: 720px) {
          .report-shell { padding: 20px 14px 80px !important; }
          .report-cover { border-radius: 22px !important; padding: 22px !important; }
          .cover-title-grid { grid-template-columns: 1fr !important; }
          .cover-meta-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      {/* Print-only header */}
      <div
        className="print-header"
        style={{
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid #E5DDD0',
        }}
      >
        <Barbaros size={20} />
        <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.45)' }}>
          {isAr ? 'تقرير المقابلة' : 'Interview Report'}
        </div>
      </div>
      <nav
        className="no-print"
        style={{
          background: '#F5F1EB',
          borderBottom: '0.5px solid #E5DDD0',
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Barbaros size={20} />

        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#CC785C',
          }}
        >
          {isAr ? 'تقرير المقابلة' : 'Interview Report'}
        </div>

        <button
          onClick={() => router.push('/')}
          style={{
            background: '#FFFFFF',
            border: '0.5px solid #E5DDD0',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            color: '#1A1A1A',
            fontFamily: 'inherit',
          }}
        >
          {isAr ? 'الرئيسية' : 'Home'}
        </button>
      </nav>

      <div
        className="report-shell"
        style={{ maxWidth: 780, margin: '0 auto', padding: '24px 16px 80px' }}
      >
        <ReportCover
          data={data}
          isAr={isAr}
          readinessLabel={readinessLabel}
          reportDate={formatReportDate(data.reportDate, isAr)}
          reference={shortReference(data.reportReference)}
          summaryLine={
            (isAr
              ? `حصل المرشّح على ${r.finalScore} من 100 ضمن مستوى «${readinessLabel}»`
              : `Overall score of ${r.finalScore} out of 100 — readiness level: “${readinessLabel}”`) +
            (typeof r.hireProbability === 'number'
              ? isAr
                ? `، باحتمالية توظيف ${r.hireProbability}%.`
                : `, with a ${r.hireProbability}% probability of hire.`
              : '.')
          }
          assessment={r.barbarosAssessment || ''}
        />

        {/* 1. SCORE */}
        <Section lang={lang} style={{ textAlign: 'center' }}>
          <ScoreRing score={r.finalScore} />

          {typeof r.hireProbability === 'number' && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(204,120,92,0.08)',
                border: '0.5px solid rgba(204,120,92,0.25)',
                borderRadius: 20,
                padding: '6px 16px',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: 'rgba(26,26,26,0.5)',
                  fontWeight: 600,
                }}
              >
                {isAr ? 'مؤشر احتمالية التوظيف' : 'Hire Probability'}
              </span>

              <span
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: '#CC785C',
                }}
              >
                {r.hireProbability}%
              </span>
            </div>
          )}
        </Section>

        {/* 2. VERDICT */}
        {r.verdict && (
          <Section lang={lang} style={{ background: v.bg, border: `1px solid ${v.border}` }}>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 17,
                fontWeight: 700,
                color: v.color,
                marginBottom: 10,
              }}
            >
              {readinessLabel}
            </div>

            <div style={{ fontSize: 13, color: v.color, lineHeight: 1.8 }}>
              {r.verdict}
            </div>
          </Section>
        )}

        {/* 3. ASSESSMENT COVERAGE
            - background: gradient واضح من أبيض إلى برتقالي كريمي دافئ
            - عنوان "محاور لم تُقَس" أغمق بوضوح
        */}
        {hasCoverage(coverage) && (
          <Section
            lang={lang}
            style={{
              background: 'linear-gradient(160deg, #FFFFFF 0%, #FDEEE4 100%)',
              border: '1px solid rgba(204,120,92,0.28)',
            }}
          >
            <SectionTitle>
              {isAr ? 'نطاق التقييم في هذه الباقة' : 'Assessment Coverage for This Package'}
            </SectionTitle>

            {coverage.summary && (
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.8,
                  color: '#1A1A1A',
                  marginBottom: 14,
                }}
              >
                {coverage.summary}
              </div>
            )}

            {Array.isArray(coverage.coveredAreas) &&
              coverage.coveredAreas.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: 'rgba(26,26,26,0.5)',
                      marginBottom: 8,
                      ...labelType(isAr),
                    }}
                  >
                    {isAr
                      ? 'الأبعاد المقاسة فعلياً في هذه الباقة'
                      : 'Measured in this package'}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {coverage.coveredAreas.map((area, i) => (
                      <span
                        key={`${area}-${i}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: 999,
                          padding: '7px 11px',
                          background: 'rgba(204,120,92,0.09)',
                          border: '0.5px solid rgba(204,120,92,0.28)',
                          color: '#8A3F2B',
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {Array.isArray(coverage.recommendedForDeeperAssessment) &&
              coverage.recommendedForDeeperAssessment.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: 'rgba(26,26,26,0.62)',
                      marginBottom: 8,
                      ...labelType(isAr),
                    }}
                  >
                    {isAr
                      ? 'أبعاد لم تُقَس في هذه الباقة — متاحة بتفصيل أعمق في الباقات الأعلى'
                      : 'Not measured here · available in greater depth in higher-tier plans'}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr',
                      gap: 7,
                    }}
                  >
                    {coverage.recommendedForDeeperAssessment.map((item, i) => (
                      <div
                        key={`${item}-${i}`}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          fontSize: 12,
                          lineHeight: 1.6,
                          color: '#1A1A1A',
                          background: 'rgba(26,26,26,0.025)',
                          border: '0.5px solid rgba(26,26,26,0.06)',
                          borderRadius: 10,
                          padding: '8px 10px',
                        }}
                      >
                        <span
                          style={{
                            color: '#CC785C',
                            fontWeight: 900,
                            flexShrink: 0,
                          }}
                        >
                          +
                        </span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {coverage.upgradeNote && (
              <div
                style={{
                  fontSize: 12,
                  lineHeight: 1.8,
                  color: '#6B2D1F',
                  background: 'rgba(204,120,92,0.08)',
                  border: '0.5px solid rgba(204,120,92,0.22)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  fontWeight: 600,
                }}
              >
                {coverage.upgradeNote}
              </div>
            )}
          </Section>
        )}

        {/* 4. COMPETENCIES */}
        {Array.isArray(r.competencies) && r.competencies.length > 0 && (
          <Section lang={lang}>
            <SectionTitle>
              {isAr ? 'مصفوفة الكفاءات' : 'Competency Breakdown'}
            </SectionTitle>

            {r.competencies.map((c, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 20,
                  paddingBottom: 20,
                  borderBottom:
                    i < r.competencies.length - 1 ? '0.5px solid #F5F1EB' : 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{displayCompetencyName(c.name, isAr)}</span>

                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: scoreColor(c.score),
                    }}
                  >
                    {c.score}/100
                  </span>
                </div>

                <div
                  style={{
                    height: 6,
                    background: '#F5F1EB',
                    borderRadius: 4,
                    overflow: 'hidden',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 4,
                      width: `${c.score}%`,
                      background: scoreColor(c.score),
                    }}
                  />
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: '#1A1A1A',
                    lineHeight: 1.7,
                    padding: '8px 12px',
                    background: tint(scoreColor(c.score), 0.07),
                    borderRadius: 8,
                    borderLeft: isAr ? 'none' : `3px solid ${scoreColor(c.score)}`,
                    borderRight: isAr ? `3px solid ${scoreColor(c.score)}` : 'none',
                  }}
                >
                  {c.why}
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* 4.5 PERFORMANCE PATH — derived from replay scores (question order, not time) */}
        {Array.isArray(r.replay) && r.replay.length >= 2 && (
          <Section lang={lang}>
            <SectionTitle>
              {isAr ? 'مسار الأداء عبر أسئلة المقابلة' : 'Performance Path Across Interview Questions'}
            </SectionTitle>

            <PerformancePath replay={r.replay} isAr={isAr} />
          </Section>
        )}

        {/* 5. HIDDEN WEAKNESS */}
        {r.hiddenWeakness && (
          <Section
            lang={lang}
            style={{
              background: tint('#A14234', 0.07),
              border: '1px solid rgba(161,66,52,0.22)',
              borderInlineStart: '4px solid #A14234',
            }}
          >
            <SectionTitle color="#A14234">
              {isAr ? 'المخاطرة الجوهرية في الأداء' : 'Hidden Weakness'}
            </SectionTitle>

            <div style={{ fontSize: 13, color: '#7A2E24', lineHeight: 1.8 }}>
              {r.hiddenWeakness}
            </div>
          </Section>
        )}

        {/* 6. BEHAVIORAL PATTERNS */}
        {r.behavioralPatterns && (
          <Section lang={lang}>
            <SectionTitle>
              {isAr ? 'الأنماط السلوكية' : 'Behavioral Patterns'}
            </SectionTitle>

            <div
              style={{
                fontSize: 13,
                color: '#1A1A1A',
                lineHeight: 1.8,
                fontStyle: 'italic',
              }}
            >
              {r.behavioralPatterns}
            </div>
          </Section>
        )}

        {/* 7. INTERVIEW REPLAY */}
        {Array.isArray(r.replay) && r.replay.length > 0 && (
          <Section lang={lang}>
            <button
              className="no-print"
              onClick={() => setShowReplay(p => !p)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700 }}
              >
                {isAr ? 'تحليل الإجابات والتدريب' : 'Interview Analysis'}
              </span>

              <span
                style={{
                  fontSize: 12,
                  color: '#CC785C',
                  fontWeight: 700,
                }}
              >
                {showReplay
                  ? isAr
                    ? 'إخفاء التحليل ▲'
                    : 'Hide Analysis ▲'
                  : isAr
                    ? 'عرض التحليل ▼'
                    : 'Show Analysis ▼'}
              </span>
            </button>

            <div
              style={{
                fontSize: 12,
                color: 'rgba(26,26,26,0.52)',
                lineHeight: 1.7,
                marginTop: 8,
                marginBottom: 16,
              }}
            >
              {isAr
                ? 'يراجع هذا القسم إجاباتك كما قُدّمت، ويوضح سبب التقييم، وما أضعف كل إجابة، وكيف يمكن صياغتها بصورة أقوى.'
                : 'This section reviews your submitted answers, explains the score, identifies what weakened each response, and shows how to strengthen it.'}
            </div>

            {showReplay && (
              <div className="print-show" style={{ marginTop: 16 }}>
                {r.replay.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 28,
                      paddingBottom: 28,
                      borderBottom:
                        i < r.replay.length - 1 ? '1px solid #F5F1EB' : 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: '#CC785C',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </div>

                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          color: scoreColor(item.score),
                          marginLeft: isAr ? 0 : 'auto',
                          marginRight: isAr ? 'auto' : 0,
                        }}
                      >
                        {item.score}/100
                      </span>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: 'rgba(26,26,26,0.4)',
                          marginBottom: 4,
                          ...labelType(isAr),
                        }}
                      >
                        {isAr ? 'السؤال محل التقييم' : 'Evaluated Question'}
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          color: '#1A1A1A',
                          lineHeight: 1.7,
                          padding: '10px 14px',
                          background: '#F5F1EB',
                          borderRadius: 10,
                          fontWeight: 600,
                        }}
                      >
                        {item.question}
                      </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: 'rgba(26,26,26,0.4)',
                          marginBottom: 4,
                          ...labelType(isAr),
                        }}
                      >
                        {isAr ? 'الإجابة كما وردت' : 'Your Submitted Answer'}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: '#1A1A1A',
                          lineHeight: 1.7,
                          padding: '10px 14px',
                          background: 'rgba(204,120,92,0.06)',
                          border: `0.5px solid ${scoreColor(item.score)}33`,
                          borderRadius: 10,
                        }}
                      >
                        {item.answer}
                      </div>
                    </div>

                    {item.analysis && (
                      <div style={{ marginBottom: 10 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#86591D',
                            marginBottom: 4,
                            ...labelType(isAr),
                          }}
                        >
                          {isAr ? 'تحليل الأداء' : 'Performance Analysis'}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: '#86591D',
                            lineHeight: 1.7,
                            padding: '10px 14px',
                            background: tint('#B07A2E', 0.07),
                            border: '0.5px solid rgba(176,122,46,0.25)',
                            borderRadius: 10,
                          }}
                        >
                          {item.analysis}
                        </div>
                      </div>
                    )}

                    {item.weakened && (
                      <div style={{ marginBottom: 10 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#A14234',
                            marginBottom: 4,
                            ...labelType(isAr),
                          }}
                        >
                          {isAr ? 'مواطن الضعف في الطرح' : 'What Weakened the Answer'}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: '#7A2E24',
                            lineHeight: 1.7,
                            padding: '10px 14px',
                            background: tint('#A14234', 0.055),
                            border: '0.5px solid rgba(161,66,52,0.22)',
                            borderRadius: 10,
                          }}
                        >
                          {item.weakened}
                        </div>
                      </div>
                    )}

                    {item.stronger && (
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#3F6B5E',
                            marginBottom: 4,
                            ...labelType(isAr),
                          }}
                        >
                          {isAr ? 'النموذج المرجعي للإجابة' : 'Suggested Stronger Response'}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: '#2E5248',
                            lineHeight: 1.8,
                            padding: '10px 14px',
                            background: tint('#3F6B5E', 0.07),
                            border: '0.5px solid rgba(63,107,94,0.30)',
                            borderRadius: 10,
                          }}
                        >
                          {item.stronger}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* 8. RECOMMENDATION */}
        {r.recommendation && (
          <Section
            lang={lang}
            style={{
              background: 'rgba(204,120,92,0.06)',
              border: '1px solid rgba(204,120,92,0.3)',
            }}
          >
            <SectionTitle>
              {isAr ? 'التوصية الختامية' : 'Your Next Step'}
            </SectionTitle>

            <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.9 }}>
              {r.recommendation}
            </div>
          </Section>
        )}

               {/* 9. CTA / PRINT FOOTER */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <div className="no-print">
            <button
              onClick={() => window.print()}
              style={{
                background: '#1A1A1A',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 14,
                padding: '12px 36px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                width: '100%',
                marginBottom: 10,
              }}
            >
              {isAr ? 'طباعة التقرير / حفظ PDF' : 'Print Report / Save PDF'}
            </button>

            <button
              onClick={() => router.push('/onboarding')}
              style={{
                background: 'transparent',
                color: '#CC785C',
                border: '1px solid #CC785C',
                borderRadius: 14,
                padding: '12px 36px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                width: '100%',
                marginBottom: 12,
              }}
            >
              {isAr ? 'مقابلة جديدة' : 'Start New Interview'}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              color: 'rgba(26,26,26,0.38)',
              marginTop: 18,
              paddingTop: 14,
              borderTop: '0.5px solid rgba(26,26,26,0.10)',
            }}
          >
            <Barbaros size={11} />

            <div
              style={{
                fontSize: 12,
                lineHeight: 1.7,
                maxWidth: 430,
                margin: '0 auto',
              }}
            >
              {footerText}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Orchestrator: reads reportJobId, polls status ---------- */

type Phase = 'loading' | 'ready' | 'failed' | 'error'

function ReportContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reportJobId = searchParams.get('reportJobId')

  const [phase, setPhase] = useState<Phase>('loading')
  const [data, setData] = useState<Stored | null>(null)
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    if (!reportJobId) return

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    const readLang = (cfg: Record<string, unknown>) => {
      if (cfg && typeof cfg.language === 'string') {
        setLang(cfg.language === 'ar' ? 'ar' : 'en')
      }
    }

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/report/status?reportJobId=${encodeURIComponent(reportJobId)}`,
          { cache: 'no-store' }
        )
        const json = await res.json()
        if (cancelled) return

        const cfg = (json?.config ?? {}) as Record<string, unknown>
        readLang(cfg)

        if (!res.ok) {
          stop()
          setPhase('error')
          return
        }

        if (json.status === 'completed' && json.report) {
          const str = (k: string) =>
            typeof cfg[k] === 'string' ? (cfg[k] as string) : ''

          // Report date comes from an existing field on the status response.
          // Prefer completedAt (when the report was finalized), fall back to createdAt.
          const ts = (json?.timestamps ?? {}) as Record<string, unknown>
          const reportDate =
            typeof ts.completedAt === 'string'
              ? ts.completedAt
              : typeof ts.createdAt === 'string'
                ? ts.createdAt
                : ''

          stop()
          setData({
            report: json.report as Report,
            candidateName: str('candidateName'),
            jobTitle: str('jobTitle'),
            institution: str('institution'),
            sector: str('sector'),
            yearsExperience: str('yearsExperience'),
            language: str('language') || 'en',
            plan: str('plan'),
            reportDate,
            reportReference: reportJobId,
          })
          setPhase('ready')
          return
        }

        if (json.status === 'failed') {
          stop()
          setPhase('failed')
          return
        }

        // pending | processing -> keep polling
        setPhase('loading')
      } catch {
        // transient network issue: keep polling, do not crash
        if (!cancelled) setPhase('loading')
      }
    }

    poll()
    timer = setInterval(poll, 3000)

    return () => {
      cancelled = true
      stop()
    }
  }, [reportJobId])

  if (!reportJobId) {
    return (
      <CenteredScreen>
        <Barbaros size={20} />
        <div style={{ marginTop: 16, fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>
          {lang === 'ar' ? 'رابط التقرير غير مكتمل' : 'Incomplete report link'}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 12.5,
            color: 'rgba(26,26,26,0.5)',
            maxWidth: 360,
            lineHeight: 1.7,
            marginBottom: 20,
          }}
        >
          {lang === 'ar'
            ? 'لا يحتوي هذا الرابط على مُعرّف تقرير صالح. ابدأ مقابلة للحصول على تقريرك.'
            : 'This link does not include a valid report reference. Start an interview to generate your report.'}
        </div>
        <button
          onClick={() => router.push('/onboarding')}
          style={{
            background: '#CC785C',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '12px 28px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {lang === 'ar' ? 'ابدأ مقابلة' : 'Start an Interview'}
        </button>
      </CenteredScreen>
    )
  }

  if (phase === 'ready' && data) {
    return <ReportView data={data} />
  }

  if (phase === 'failed' || phase === 'error') {
    return (
      <CenteredScreen>
        <Barbaros size={20} />
        <div style={{ marginTop: 16, fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>
          {lang === 'ar' ? 'تعذّر إنشاء التقرير' : 'We could not generate your report'}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 12.5,
            color: 'rgba(26,26,26,0.5)',
            maxWidth: 360,
            lineHeight: 1.7,
            marginBottom: 20,
          }}
        >
          {lang === 'ar'
            ? 'حدث خطأ أثناء تجهيز التقييم. يمكنك المحاولة مجدداً بإجراء مقابلة جديدة.'
            : 'Something went wrong while preparing the assessment. You can try again with a new interview.'}
        </div>
        <button
          onClick={() => router.push('/onboarding')}
          style={{
            background: '#CC785C',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '12px 28px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {lang === 'ar' ? 'مقابلة جديدة' : 'Start a New Interview'}
        </button>
      </CenteredScreen>
    )
  }

  // loading (pending | processing | initial)
  return <GeneratingScreen lang={lang} />
}

/* ---------- Page export: Suspense wrapper required for useSearchParams ---------- */

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <CenteredScreen>
          <Barbaros size={20} />
        </CenteredScreen>
      }
    >
      <ReportContent />
    </Suspense>
  )
}
