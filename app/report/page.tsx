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
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  lang?: Lang
}) => (
  <div
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
  const v = verdictStyle(r.readinessLevel)
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
        <Section lang={lang} style={{ textAlign: 'center' }}>
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

          <ScoreRing score={r.finalScore} />

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
                  ...labelType(isAr),
                }}
              >
                {isAr ? 'تقييم بارباروس' : 'Barbaros Assessment'}
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
              {r.readinessLevel}
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
              {isAr ? 'نطاق التقييم' : 'Assessment Coverage'}
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
                      ? 'المحاور التي تم قياسها في هذه الباقة'
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
                      ? 'محاور لم تُقَس هنا — متاحة في الباقات الأعلى'
                      : 'Not measured here · available in higher-tier plans'}
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
              {isAr ? 'تفصيل الكفاءات' : 'Competency Breakdown'}
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
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{c.name}</span>

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
              {isAr ? 'نقطة الضعف الخفية' : 'Hidden Weakness'}
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
                {isAr ? 'إعادة المقابلة' : 'Interview Replay'}
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
                    ? 'إخفاء ▲'
                    : 'Hide ▲'
                  : isAr
                    ? 'عرض ▼'
                    : 'Show ▼'}
              </span>
            </button>

            {showReplay && (
              <div style={{ marginTop: 16 }}>
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
                        {isAr ? 'سؤال بارباروس' : 'Barbaros Question'}
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
                        {isAr ? 'جوابك' : 'Your Answer'}
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
                          {isAr ? 'ملاحظة المحاور' : 'Interviewer Notes'}
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
                          {isAr ? 'ما أضعف إجابتك' : 'What Weakened It'}
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
                          {isAr ? 'إجابة أقوى' : 'Stronger Response'}
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
              {isAr ? 'خطوتك التالية' : 'Your Next Step'}
            </SectionTitle>

            <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.9 }}>
              {r.recommendation}
            </div>
          </Section>
        )}

        {/* 9. CTA */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
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

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              color: 'rgba(26,26,26,0.38)',
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
  return (
    <CenteredScreen>
      <Barbaros size={22} />
      <div
        style={{
          marginTop: 18,
          fontSize: 14,
          fontWeight: 700,
          color: '#1A1A1A',
          lineHeight: 1.6,
        }}
      >
        {lang === 'ar' ? (
          <>يتم الآن إعداد تقرير <Barbaros size={14} /> الخاص بك...</>
        ) : (
          <>Your <Barbaros size={14} /> report is being prepared...</>
        )}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12.5,
          color: 'rgba(26,26,26,0.5)',
          lineHeight: 1.7,
          maxWidth: 340,
        }}
      >
        {lang === 'ar'
          ? 'نقوم بتحليل المقابلة وتجهيز التقييم. يُرجى إبقاء هذه الصفحة مفتوحة.'
          : 'We are analyzing your interview and compiling the assessment. Please keep this page open.'}
      </div>
    </CenteredScreen>
  )
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
