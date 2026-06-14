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
  countsTowardPath?: boolean
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
  hireProbability?: number
  verdict: string
  barbarosAssessment: string
  assessmentCoverage?: AssessmentCoverage
  competencies: Competency[]
  hiddenWeakness: string
  behavioralPatterns: string
  replay: ReplayItem[]
  recommendation: string
  interviewIncomplete?: boolean
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
  'Strong Readiness': 'جاهزية قوية',
  'Moderate Readiness': 'جاهزية متوسطة',
  'Developing Readiness': 'جاهزية قيد التطوير',
  'Limited Readiness': 'جاهزية محدودة',
  'Interview Incomplete': 'المقابلة غير مكتملة',

  // Legacy labels remain readable for previously generated reports.
  'Strong Hire': 'جاهز بقوة',
  'Maybe Hire': 'قابل للتوصية بحذر',
  'Risky Candidate': 'مخاطرة عالية',
  'Not Recommended': 'غير جاهز حالياً',
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

  if (
    l.includes('strong readiness') ||
    l.includes('strong hire') ||
    level.includes('جاهزية قوية') ||
    level.includes('جاهز بقوة')
  ) {
    return { color: '#2E5248', bg: '#E9EFEB', border: '#C6D8CE' }
  }

  if (l.includes('moderate readiness') || level.includes('جاهزية متوسطة')) {
    return { color: '#5A463E', bg: '#F1E8DF', border: '#D9C7B8' }
  }

  if (
    l.includes('developing readiness') ||
    l.includes('maybe hire') ||
    level.includes('قيد التطوير') ||
    level.includes('قابل')
  ) {
    return { color: '#8A4A2E', bg: '#F6EAE1', border: '#E7CBBA' }
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
  const pathItems = replay
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .filter(item => item.countsTowardPath !== false)
    .filter(item => typeof item.score === 'number' && !Number.isNaN(item.score))

  if (pathItems.length < 2) return null

  const scores = pathItems.map(item => item.score)
  const n = scores.length
  const max = Math.max(...scores)
  const min = Math.min(...scores)
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / n)
  const peakIdx = scores.indexOf(max)
  const lowIdx = scores.indexOf(min)
  const range = max - min

  const deltas = scores.slice(1).map((score, index) => score - scores[index])
  const meaningfulDirections = deltas
    .map(delta => (Math.abs(delta) < 5 ? 0 : Math.sign(delta)))
    .filter(direction => direction !== 0)

  let directionChanges = 0
  for (let i = 1; i < meaningfulDirections.length; i++) {
    if (meaningfulDirections[i] !== meaningfulDirections[i - 1]) {
      directionChanges++
    }
  }

  const biggestDrop = Math.min(0, ...deltas)
  const biggestRise = Math.max(0, ...deltas)
  const xMean = (n - 1) / 2
  const yMean = scores.reduce((sum, score) => sum + score, 0) / n
  const slopeDenominator = scores.reduce(
    (sum, _score, index) => sum + (index - xMean) ** 2,
    0
  )
  const slope =
    slopeDenominator === 0
      ? 0
      : scores.reduce(
          (sum, score, index) =>
            sum + (index - xMean) * (score - yMean),
          0
        ) / slopeDenominator

  const volatile =
    range >= 25 &&
    (directionChanges >= 1 || biggestDrop <= -20 || biggestRise >= 20)
  const lastDelta = deltas[deltas.length - 1] ?? 0
  const trend: 'volatile' | 'up' | 'down' | 'stable' = volatile
    ? 'volatile'
    : slope >= 3
      ? 'up'
      : slope <= -3
        ? 'down'
        : 'stable'

  const trendLabel = isAr
    ? trend === 'volatile'
      ? lastDelta <= -15
        ? 'الاتجاه العام: أداء متذبذب، تحسن في بعض مراحل المقابلة ثم انخفض بوضوح في الإجابة الأخيرة'
        : 'الاتجاه العام: أداء متذبذب بين إجابات المقابلة'
      : trend === 'up'
        ? 'الاتجاه العام: تحسن الأداء مع تقدم المقابلة'
        : trend === 'down'
          ? 'الاتجاه العام: تراجع الأداء مع تقدم المقابلة'
          : 'الاتجاه العام: أداء متقارب عبر المقابلة دون تغير حاد'
    : trend === 'volatile'
      ? lastDelta <= -15
        ? 'Overall trend: performance fluctuated, improved in parts of the interview, then dropped clearly in the final answer'
        : 'Overall trend: performance fluctuated across the interview answers'
      : trend === 'up'
        ? 'Overall trend: performance improved as the interview progressed'
        : trend === 'down'
          ? 'Overall trend: performance declined as the interview progressed'
          : 'Overall trend: performance remained broadly consistent without sharp changes'

  const trendColor =
    trend === 'up' ? '#3F6B5E' : trend === 'down' ? '#A14234' : '#86591D'

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

  const questionLabel = (pathIndex: number) => {
    const originalNumber = pathItems[pathIndex].originalIndex + 1
    return isAr ? `س${originalNumber}` : `Q${originalNumber}`
  }

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
                {questionLabel(i)}
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
          `${max} · ${questionLabel(peakIdx)}`,
          '#3F6B5E'
        )}
        {statBox(
          isAr ? 'أدنى نقطة أداء' : 'Lowest point',
          `${min} · ${questionLabel(lowIdx)}`,
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

/* ---------- Executive glance helpers (derive-only, no invented values) ---------- */

// First complete sentence, word-safe capped at ~140 chars.
function firstSentence(text: string | undefined): string {
  const t = typeof text === 'string' ? text.trim() : ''
  if (!t) return ''

  const m = t.match(/^[^.!?؟۔]+[.!?؟۔]?/)
  let out = (m ? m[0] : t).trim()

  if (out.length > 140) {
    out = out.slice(0, 140)
    const cut = out.lastIndexOf(' ')
    if (cut > 80) out = out.slice(0, cut)
    out = out.trimEnd() + '…'
  }

  return out
}

function topCompetency(list: Competency[] | undefined): Competency | null {
  if (!Array.isArray(list) || list.length === 0) return null
  return list.reduce((best, c) =>
    typeof c.score === 'number' && c.score > best.score ? c : best
  , list[0])
}

/* ---------- Premium cover helpers ---------- */

function safeText(value: string | undefined, fallback: string) {
  const v = typeof value === 'string' ? value.trim() : ''
  return v || fallback
}

function formatYearsExperience(value: string, isAr: boolean): string {
  const clean = typeof value === 'string' ? value.trim() : ''
  if (!clean) return ''

  const normalized = clean.toLowerCase().replace(/\s+/g, ' ')
  const match = normalized.match(
    /^(?:years?\s*)?\+?\s*(\d+)\s*\+?(?:\s*years?)?$/
  )

  if (match && clean.includes('+')) {
    const years = Number(match[1])
    return isAr ? `أكثر من ${years} سنوات` : `More than ${years} years`
  }

  return clean
}

function displayPlanName(plan: string) {
  const key = (plan || '').toLowerCase()
  if (key.includes('expert')) return 'Expert Interview'
  if (key.includes('executive')) return 'Executive Interview'
  if (key.includes('professional') || key.includes('pro')) return 'Professional Interview'
  if (key.includes('essential') || key.includes('basic') || key.includes('free')) return 'Essential Interview'
  if (key.includes('go')) return 'Go Interview'
  return 'Barbaros Interview'
}

/* Plan tier resolution (client-safe mirror of the server resolver in
   lib/barbaros/report/generate-report-data.ts — kept local because that
   module instantiates the Anthropic client and is server-only). */
type PlanTier = 'go' | 'pro' | 'expert'

function resolvePlanTier(plan: string): PlanTier {
  const key = (plan || '').toLowerCase()
  if (key.includes('expert') || key.includes('executive')) return 'expert'
  if (key.includes('professional') || key.includes('pro')) return 'pro'
  return 'go'
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
  value: React.ReactNode
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
  summaryLine: React.ReactNode
  assessment: string
}) {
  const incomplete = data.report.interviewIncomplete === true

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
              {incomplete
                ? isAr
                  ? 'سجل جلسة المقابلة'
                  : 'Interview Session Record'
                : isAr
                  ? 'منهجية تقييم مقابلات قائمة على الكفاءات'
                  : 'Competency-Based Interview Assessment'}
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
              {incomplete
                ? isAr
                  ? 'تقرير جلسة المقابلة'
                  : 'Interview Session Report'
                : isAr
                  ? 'تقرير تقييم المقابلة'
                  : 'Interview Assessment Report'}
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
              {safeText(data.candidateName, isAr ? 'الاسم غير متاح' : 'Name not available')}
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
              {incomplete
                ? isAr
                  ? 'حالة التقرير'
                  : 'Report Status'
                : isAr
                  ? 'مؤشر جاهزية الجلسة'
                  : 'Session Readiness'}
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
            value={safeText(
              formatYearsExperience(data.yearsExperience, isAr),
              isAr ? 'غير محدد' : 'Not provided'
            )}
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
            label={
              incomplete
                ? isAr
                  ? 'حالة التقرير'
                  : 'Report Status'
                : isAr
                  ? 'النتيجة الإجمالية'
                  : 'Overall Score'
            }
            value={
              incomplete
                ? isAr
                  ? 'المقابلة غير مكتملة'
                  : 'Interview Incomplete'
                : (
                  <bdi dir="ltr">{data.report.finalScore} / 100</bdi>
                )
            }
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
            {incomplete
              ? isAr
                ? 'ملخص الحالة'
                : 'Status Summary'
              : isAr
                ? 'الخلاصة التقييمية'
                : 'Executive Summary'}
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

        {(() => {
          const r = data.report
          const top = topCompetency(r.competencies)
          const risk = firstSentence(r.hiddenWeakness)
          const action = firstSentence(r.recommendation)

          const GlanceCard = ({
            label,
            value,
            sub,
            accent,
          }: {
            label: string
            value: React.ReactNode
            sub?: string
            accent: string
          }) => (
            <div
              style={{
                background: 'rgba(255,255,255,0.78)',
                border: `0.5px solid ${accent}40`,
                borderInlineStart: `3px solid ${accent}`,
                borderRadius: 14,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: accent,
                  marginBottom: 6,
                  ...labelType(isAr),
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', lineHeight: 1.55 }}>
                {value}
              </div>
              {sub && (
                <div style={{ fontSize: 11.5, color: 'rgba(26,26,26,0.55)', lineHeight: 1.6, marginTop: 3 }}>
                  {sub}
                </div>
              )}
            </div>
          )

          return (
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: 'rgba(26,26,26,0.42)',
                  marginBottom: 10,
                  ...labelType(isAr),
                }}
              >
                {incomplete
                  ? isAr
                    ? 'لمحة عن حالة التقرير'
                    : 'Report Status at a Glance'
                  : isAr
                    ? 'لمحة تنفيذية سريعة'
                    : 'Executive Glance'}
              </div>

              <div
                className="cover-glance-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                }}
              >
                <GlanceCard
                  accent="#5A463E"
                  label={
                    incomplete
                      ? isAr
                        ? 'حالة التقرير'
                        : 'Report Status'
                      : isAr
                        ? 'الجاهزية في هذه الجلسة'
                        : 'Session Readiness'
                  }
                  value={
                    incomplete
                      ? readinessLabel
                      : (
                          <>
                            {readinessLabel} · <bdi dir="ltr">{r.finalScore} / 100</bdi>
                          </>
                        )
                  }
                />

                {!incomplete && top && (
                  <GlanceCard
                    accent="#3F6B5E"
                    label={isAr ? 'أقوى ميزة في أدائك' : 'Your Strongest Asset'}
                    value={
                      <>
                        {isAr ? AR_COMPETENCY_NAMES[top.name] ?? top.name : top.name}
                        {' · '}
                        <bdi dir="ltr">{top.score} / 100</bdi>
                      </>
                    }
                  />
                )}

                {!incomplete && risk && (
                  <GlanceCard
                    accent="#A14234"
                    label={isAr ? 'أولوية التحسين الأساسية' : 'Primary Improvement Priority'}
                    value={risk}
                  />
                )}

                {action && (
                  <GlanceCard
                    accent="#CC785C"
                    label={
                      incomplete
                        ? isAr
                          ? 'الخطوة التالية'
                          : 'Next Step'
                        : isAr
                          ? 'أول إجراء مطلوب للتحسن'
                          : 'First Action to Improve'
                    }
                    value={action}
                  />
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </section>
  )
}

/* ---------- Premium generating screen (UI-only staged progress) ---------- */
/* Stages are presentational pacing; completion is driven solely by polling. */

const GENERATION_STAGES: Record<PlanTier, Record<'ar' | 'en', readonly string[]>> = {
  go: {
    ar: [
      'قراءة المقابلة',
      'تحليل الإجابات الأساسية',
      'قياس الجاهزية العامة',
      'إعداد التقرير المختصر',
    ],
    en: [
      'Reading the interview',
      'Analyzing core answers',
      'Measuring overall readiness',
      'Preparing the summary report',
    ],
  },
  pro: {
    ar: [
      'قراءة المقابلة الكاملة',
      'تحليل السلوك والكفاءات',
      'قياس الاتساق والوضوح',
      'بناء خطة التحسين',
      'إعداد تقرير Pro',
    ],
    en: [
      'Reading the full interview',
      'Analyzing behavior and competencies',
      'Measuring consistency and clarity',
      'Building your improvement plan',
      'Preparing your Pro report',
    ],
  },
  expert: {
    ar: [
      'قراءة المقابلة الكاملة',
      'تحليل أدوار اللجنة',
      'تقييم الضغط والحكم المهني',
      'بناء الرؤية التنفيذية',
      'إعداد تقرير Expert',
    ],
    en: [
      'Reading the full interview',
      'Analyzing panel role dynamics',
      'Evaluating pressure and professional judgment',
      'Building the executive view',
      'Preparing your Expert report',
    ],
  },
} as const

function GeneratingScreen({ lang, tier }: { lang: Lang; tier: PlanTier }) {
  const isAr = lang === 'ar'
  const stages = GENERATION_STAGES[tier][isAr ? 'ar' : 'en']
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
  const incomplete = r.interviewIncomplete === true
  const performancePathItemCount = Array.isArray(r.replay)
    ? r.replay.filter(
        item =>
          item.countsTowardPath !== false &&
          typeof item.score === 'number' &&
          !Number.isNaN(item.score)
      ).length
    : 0

  const footerText = incomplete
    ? isAr
      ? 'يسجل هذا التقرير جلسة مقابلة غير مكتملة، ولم يصدر عنها حكم على الأداء أو الكفاءة.'
      : 'This report records an incomplete interview session and does not issue a judgment on performance or ability.'
    : isAr
      ? 'تم إعداد هذا التقرير وفق مبادئ التقييم المنظم القائم على الكفاءات.'
      : 'This report was prepared using structured, competency-based assessment principles.'

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
          .cover-glance-grid { grid-template-columns: 1fr !important; }
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
            incomplete
              ? isAr
                ? 'المقابلة غير مكتملة — لم تتضمن هذه الجلسة أدلة كافية لإصدار تقييم كامل.'
                : 'Interview incomplete — this session did not include enough evidence to issue a full assessment.'
              : isAr
                ? (
                    <>
                      حصلت في هذه الجلسة على <bdi dir="ltr">{r.finalScore} / 100</bdi>{' '}
                      ضمن مستوى «{readinessLabel}».
                    </>
                  )
                : (
                    <>
                      Your score in this session is <bdi dir="ltr">{r.finalScore} / 100</bdi>{' '}
                      with a “{readinessLabel}” level.
                    </>
                  )
          }
          assessment={r.barbarosAssessment || ''}
        />

        {incomplete && (
          <Section
            lang={lang}
            style={{
              background: '#FFFFFF',
              border: '1px solid rgba(26,26,26,0.14)',
              borderInlineStart: '4px solid #5A463E',
            }}
          >
            <SectionTitle>
              {isAr ? 'المقابلة غير مكتملة' : 'Interview Incomplete'}
            </SectionTitle>
            <div
              style={{
                fontSize: 13,
                color: '#1A1A1A',
                lineHeight: 1.9,
              }}
            >
              {isAr
                ? 'لم يتم إصدار تقييم كامل لأن الجلسة لم تتضمن ثلاث إجابات فعلية على الأقل. هذا ليس حكماً على أدائك أو كفاءتك، بل يعني فقط أن المقابلة لم تكتمل. أكمل مقابلة كاملة للحصول على تقييمك الكامل.'
                : 'No full assessment was issued because the session did not include at least three substantive answers. This is not a judgment of your performance or ability; it only means the interview was not completed. Complete a full interview to receive your full assessment.'}
            </div>
          </Section>
        )}

        {/* 1. SCORE */}
        {!incomplete && (
        <Section lang={lang} style={{ textAlign: 'center' }}>
          <ScoreRing score={r.finalScore} />
        </Section>
        )}

        {/* 2. VERDICT */}
        {!incomplete && r.verdict && (
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
              {incomplete
                ? isAr
                  ? 'نطاق التقييم في هذه الجلسة'
                  : 'Assessment Coverage for This Session'
                : isAr
                  ? 'نطاق التقييم في هذه الجلسة'
                  : 'Assessment Coverage for This Session'}
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
                      ? 'الأبعاد المقاسة فعلياً في هذه الجلسة'
                      : 'Measured in this session'}
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
                      ? 'محاور متقدمة متاحة بعمق أكبر في الباقات الأعلى'
                      : 'Advanced areas available in greater depth in higher-tier plans'}
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
                  color: incomplete ? '#1A1A1A' : '#6B2D1F',
                  background: incomplete
                    ? 'rgba(26,26,26,0.035)'
                    : 'rgba(204,120,92,0.08)',
                  border: incomplete
                    ? '0.5px solid rgba(26,26,26,0.10)'
                    : '0.5px solid rgba(204,120,92,0.22)',
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
        {!incomplete && Array.isArray(r.competencies) && r.competencies.length > 0 && (
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
                    <bdi dir="ltr">{c.score} / 100</bdi>
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
        {!incomplete && performancePathItemCount >= 2 && (
          <Section lang={lang}>
            <SectionTitle>
              {isAr ? 'مسار الأداء عبر أسئلة المقابلة' : 'Performance Path Across Interview Questions'}
            </SectionTitle>

            <PerformancePath replay={r.replay} isAr={isAr} />

            <div
              style={{
                marginTop: 12,
                fontSize: 11.5,
                lineHeight: 1.7,
                color: 'rgba(26,26,26,0.55)',
              }}
            >
              {isAr
                ? 'النتيجة الإجمالية محسوبة من درجات الكفاءات الست. أما متوسط مسار الأداء فيعكس درجات الإجابات المختارة عبر تسلسل المقابلة، لذلك قد يختلف الرقمان.'
                : 'The overall score is calculated from the six competency scores. The performance-path average reflects selected answer scores across the interview sequence, so the two figures may differ.'}
            </div>
          </Section>
        )}

        {/* 5. HIDDEN WEAKNESS */}
        {!incomplete && r.hiddenWeakness && (
          <Section
            lang={lang}
            style={{
              background: tint('#A14234', 0.07),
              border: '1px solid rgba(161,66,52,0.22)',
              borderInlineStart: '4px solid #A14234',
            }}
          >
            <SectionTitle color="#A14234">
              {isAr ? 'أولوية التحسين الأساسية' : 'Primary Improvement Priority'}
            </SectionTitle>

            <div style={{ fontSize: 13, color: '#7A2E24', lineHeight: 1.8 }}>
              {r.hiddenWeakness}
            </div>
          </Section>
        )}

        {/* 6. BEHAVIORAL PATTERNS */}
        {!incomplete && r.behavioralPatterns && (
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
                {incomplete
                  ? isAr
                    ? 'سجل الجلسة'
                    : 'Session Record'
                  : isAr
                    ? 'تحليل الإجابات والتدريب'
                    : 'Interview Analysis'}
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
              {incomplete
                ? isAr
                  ? 'يعرض هذا القسم التبادلات التي حدثت فعلياً في الجلسة دون درجات أو حكم على الأداء.'
                  : 'This section records the exchanges that actually occurred, without scores or performance judgment.'
                : isAr
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
                          background: incomplete ? '#5A463E' : '#CC785C',
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

                      {!incomplete && item.countsTowardPath === false && (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: 'rgba(26,26,26,0.5)',
                            background: 'rgba(26,26,26,0.045)',
                            border: '0.5px solid rgba(26,26,26,0.10)',
                            borderRadius: 999,
                            padding: '4px 8px',
                          }}
                        >
                          {isAr
                            ? 'قراءة إضافية للدليل نفسه'
                            : 'Additional reading of the same evidence'}
                        </span>
                      )}

                      {!incomplete && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            color: scoreColor(item.score),
                            marginLeft: isAr ? 0 : 'auto',
                            marginRight: isAr ? 'auto' : 0,
                          }}
                        >
                          <bdi dir="ltr">{item.score} / 100</bdi>
                        </span>
                      )}
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
                        {incomplete
                          ? isAr
                            ? 'السؤال'
                            : 'Question'
                          : isAr
                            ? 'السؤال محل التقييم'
                            : 'Evaluated Question'}
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
                          border: incomplete
                            ? '0.5px solid rgba(26,26,26,0.12)'
                            : `0.5px solid ${scoreColor(item.score)}33`,
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
                          {incomplete
                            ? isAr
                              ? 'ملاحظة الجلسة'
                              : 'Session Note'
                            : isAr
                              ? 'تحليل الأداء'
                              : 'Performance Analysis'}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: incomplete ? 'rgba(26,26,26,0.70)' : '#86591D',
                            lineHeight: 1.7,
                            padding: '10px 14px',
                            background: incomplete
                              ? 'rgba(26,26,26,0.035)'
                              : tint('#B07A2E', 0.07),
                            border: incomplete
                              ? '0.5px solid rgba(26,26,26,0.10)'
                              : '0.5px solid rgba(176,122,46,0.25)',
                            borderRadius: 10,
                          }}
                        >
                          {item.analysis}
                        </div>
                      </div>
                    )}

                    {!incomplete && item.weakened && (
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

                    {!incomplete && item.stronger && (
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
              {incomplete
                ? isAr
                  ? 'الخطوة التالية'
                  : 'Next Step'
                : isAr
                  ? 'التوصية الختامية'
                  : 'Your Next Step'}
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
  const [planTier, setPlanTier] = useState<PlanTier>('go')

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
      if (cfg && typeof cfg.plan === 'string') {
        setPlanTier(resolvePlanTier(cfg.plan))
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
    const isArF = lang === 'ar'
    const ref = shortReference(reportJobId)

    return (
      <div
        dir={isArF ? 'rtl' : 'ltr'}
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
          <Barbaros size={24} />

          <div
            style={{
              marginTop: 16,
              fontFamily: SERIF,
              fontSize: 17,
              fontWeight: 700,
              color: '#1A1A1A',
            }}
          >
            {isArF ? 'تعذّر تجهيز التقرير حالياً' : 'Your report could not be prepared right now'}
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 12.5,
              color: 'rgba(26,26,26,0.55)',
              lineHeight: 1.8,
            }}
          >
            {isArF
              ? 'بيانات مقابلتك محفوظة ولم تُفقد. يمكنك إعادة المحاولة لاحقاً بفتح هذا الرابط نفسه، أو بدء مقابلة جديدة.'
              : 'Your interview data is saved and has not been lost. You can retry later by reopening this same link, or start a new interview.'}
          </div>

          {ref && (
            <div
              style={{
                marginTop: 16,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#F5F1EB',
                border: '0.5px solid #E5DDD0',
                borderRadius: 10,
                padding: '8px 14px',
              }}
            >
              <span style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', fontWeight: 600 }}>
                {isArF ? 'الرقم المرجعي' : 'Reference'}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#1A1A1A',
                  letterSpacing: 1,
                  fontFamily: 'ui-monospace, monospace',
                  direction: 'ltr',
                }}
              >
                {ref}
              </span>
            </div>
          )}

          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#1A1A1A',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 12,
                padding: '12px 28px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {isArF ? 'تحديث حالة التقرير' : 'Refresh Report Status'}
            </button>

            <button
              onClick={() => router.push('/onboarding')}
              style={{
                background: 'transparent',
                color: '#CC785C',
                border: '1px solid #CC785C',
                borderRadius: 12,
                padding: '12px 28px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {isArF ? 'بدء مقابلة جديدة' : 'Start a New Interview'}
            </button>
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
            {isArF
              ? 'احتفظ بالرقم المرجعي عند التواصل مع الدعم.'
              : 'Keep the reference number when contacting support.'}
          </div>
        </div>
      </div>
    )
  }

  // loading (pending | processing | initial)
  return <GeneratingScreen lang={lang} tier={planTier} />
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
