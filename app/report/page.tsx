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
}

const Barbaros = ({ size = 22 }: { size?: number }) => (
  <span style={{ fontWeight: 900, fontSize: size }}>
    <span style={{ color: '#1A1A1A' }}>Barbar</span>
    <span style={{ color: '#CC785C' }}>os</span>
  </span>
)

const scoreColor = (s: number) =>
  s >= 75 ? '#10B981' : s >= 50 ? '#F59E0B' : s >= 25 ? '#EF4444' : '#9CA3AF'

const AR_READINESS_LEVELS: Record<string, string> = {
  'Strong Hire': 'جاهز بقوة',
  'Maybe Hire': 'قابل للتوصية بحذر',
  'Risky Candidate': 'مخاطرة عالية',
  'Not Recommended': 'غير جاهز حالياً',
}

const AR_COMPETENCY_NAMES: Record<string, string> = {
  Communication: 'التواصل',
  Confidence: 'الثقة',
  'Domain Expertise': 'الخبرة في المجال',
  Structure: 'تنظيم الإجابة',
  'Problem Solving': 'حل المشكلات',
  Clarity: 'الوضوح',
}

function displayReadinessLevel(level: string, isAr: boolean) {
  if (!isAr) return level
  return AR_READINESS_LEVELS[level] ?? level
}

function displayCompetencyName(name: string, isAr: boolean) {
  if (!isAr) return name
  return AR_COMPETENCY_NAMES[name] ?? name
}

function verdictStyle(level: string) {
  const l = level.toLowerCase()

  if (l.includes('strong') || level.includes('جاهز بقوة')) {
    return { color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' }
  }

  if (l.includes('maybe') || level.includes('قابل للتوصية')) {
    return { color: '#78350F', bg: '#FEF3C7', border: '#FCD34D' }
  }

  if (l.includes('risky') || level.includes('مخاطرة')) {
    return { color: '#7C2D12', bg: '#FEE2E2', border: '#FCA5A5' }
  }

  return { color: '#7F1D1D', bg: '#FEE2E2', border: '#F87171' }
}

const Section = ({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) => (
  <div
    style={{
      background: '#FFFFFF',
      border: '1px solid #E5DDD0',
      borderRadius: 20,
      padding: '20px',
      marginBottom: 16,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      ...style,
    }}
  >
    {children}
  </div>
)

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: 13,
      fontWeight: 800,
      marginBottom: 14,
      color: '#1A1A1A',
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

/* ---------- Report view (unchanged design, fed by props) ---------- */

function ReportView({ data }: { data: Stored }) {
  const router = useRouter()
  const [showReplay, setShowReplay] = useState(true)

  const isAr = data.language === 'ar'
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
      style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#F5F1EB',
        color: '#1A1A1A',
        minHeight: '100vh',
      }}
    >
      <nav
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

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 80px' }}>
        {/* 1. SCORE */}
        <Section style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(26,26,26,0.5)',
              marginBottom: 2,
            }}
          >
            {data.candidateName} · {data.jobTitle}
          </div>

          <div
            style={{
              fontSize: 11,
              color: 'rgba(26,26,26,0.35)',
              marginBottom: 24,
            }}
          >
            {data.institution}
          </div>

          <div
            style={{
              width: 130,
              height: 130,
              borderRadius: '50%',
              margin: '0 auto 16px',
              background: `conic-gradient(${scoreColor(r.finalScore)} ${
                r.finalScore * 3.6
              }deg, #E5DDD0 0deg)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 900,
                  color: scoreColor(r.finalScore),
                  lineHeight: 1,
                }}
              >
                {r.finalScore}
              </div>

              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>
                /100
              </div>
            </div>
          </div>

          {r.barbarosAssessment && (
            <div
              style={{
                margin: '16px 0',
                padding: '14px 16px',
                background: '#F5F1EB',
                border: '0.5px solid #E5DDD0',
                borderRadius: 12,
                textAlign: isAr ? 'right' : 'left',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#CC785C',
                  marginBottom: 6,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                {isAr ? 'تقييم باربروس' : 'Barbaros Assessment'}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: '#1A1A1A',
                  lineHeight: 1.8,
                  fontStyle: 'italic',
                }}
              >
                "{r.barbarosAssessment}"
              </div>
            </div>
          )}

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
                {isAr ? 'احتمال القبول' : 'Hire Probability'}
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
          <div
            style={{
              background: v.bg,
              border: `1px solid ${v.border}`,
              borderRadius: 20,
              padding: '20px',
              marginBottom: 16,
            }}
         
