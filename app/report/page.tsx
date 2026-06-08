'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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

function verdictStyle(level: string) {
  const l = level.toLowerCase()

  if (l.includes('strong')) {
    return { color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' }
  }

  if (l.includes('maybe')) {
    return { color: '#78350F', bg: '#FEF3C7', border: '#FCD34D' }
  }

  if (l.includes('risky')) {
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

export default function ReportPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<Stored | null>(null)
  const [showReplay, setShowReplay] = useState(true)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('barbaros_report')

      if (raw) {
        const parsed = JSON.parse(raw)

        if (parsed.report) {
          setData(parsed)
        }
      }
    } catch {}

    setMounted(true)
  }, [])

  const isAr = data?.language === 'ar'

  if (!mounted) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#F5F1EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: 14,
            color: 'rgba(26,26,26,0.4)',
            fontFamily: 'system-ui',
          }}
        >
          Loading report...
        </div>
      </div>
    )
  }

  if (!data || !data.report) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#F5F1EB',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 15,
            color: '#1A1A1A',
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          No report found
        </div>

        <div
          style={{
            fontSize: 13,
            color: 'rgba(26,26,26,0.5)',
            marginBottom: 20,
          }}
        >
          Complete an interview to generate your report.
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
          Start an Interview
        </button>
      </div>
    )
  }

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
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: v.color,
                marginBottom: 10,
              }}
            >
              {r.readinessLevel}
            </div>

            <div style={{ fontSize: 13, color: v.color, lineHeight: 1.7 }}>
              {r.verdict}
            </div>
          </div>
        )}

        {/* 3. ASSESSMENT COVERAGE */}
        {hasCoverage(coverage) && (
          <Section
            style={{
              background: 'linear-gradient(180deg, #FFFFFF 0%, #FFF8F3 100%)',
              border: '1px solid rgba(204,120,92,0.22)',
            }}
          >
            <SectionTitle>
              {isAr ? '🧭 نطاق التقييم' : '🧭 Assessment Coverage'}
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
                      letterSpacing: 0.4,
                      textTransform: 'uppercase',
                    }}
                  >
                {isAr ? 'المحاور التي تغطيها باقة Essential' : 'Covered by your Essential Assessment'}
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
                          fontWeight: 750,
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
                      color: 'rgba(26,26,26,0.5)',
                      marginBottom: 8,
                      letterSpacing: 0.4,
                      textTransform: 'uppercase',
                    }}
                  >
                    {isAr
                      ? 'تغطيه الباقات الأعلى بعمق أكبر'
                      : 'Expanded in higher packages'}
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
          <Section>
            <SectionTitle>
              {isAr ? '📊 تفصيل الكفاءات' : '📊 Competency Breakdown'}
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
                    background:
                      c.score >= 75
                        ? 'rgba(16,185,129,0.05)'
                        : c.score >= 50
                          ? 'rgba(245,158,11,0.05)'
                          : 'rgba(239,68,68,0.05)',
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
          <div
            style={{
              background: 'rgba(239,68,68,0.04)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 20,
              padding: '20px',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#DC2626',
                marginBottom: 10,
              }}
            >
              {isAr ? '⚠️ نقطة الضعف الخفية' : '⚠️ Hidden Weakness'}
            </div>

            <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.8 }}>
              {r.hiddenWeakness}
            </div>
          </div>
        )}

        {/* 6. BEHAVIORAL PATTERNS */}
        {r.behavioralPatterns && (
          <Section>
            <SectionTitle>
              {isAr ? '🧠 الأنماط السلوكية' : '🧠 Behavioral Patterns'}
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
          <Section>
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
              <span style={{ fontSize: 13, fontWeight: 800 }}>
                {isAr ? '🎬 إعادة المقابلة' : '🎬 Interview Replay'}
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
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                        }}
                      >
                        {isAr ? 'سؤال باربروس' : 'Barbaros Question'}
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
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
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
                            color: '#92400E',
                            marginBottom: 4,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                          }}
                        >
                          {isAr ? '🔎 ملاحظة المحاور' : '🔎 Interviewer Notes'}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: '#78350F',
                            lineHeight: 1.7,
                            padding: '10px 14px',
                            background: 'rgba(245,158,11,0.06)',
                            border: '0.5px solid rgba(245,158,11,0.2)',
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
                            color: '#DC2626',
                            marginBottom: 4,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                          }}
                        >
                          {isAr ? '⚠️ ما أضعف إجابتك' : '⚠️ What Weakened It'}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: '#7F1D1D',
                            lineHeight: 1.7,
                            padding: '10px 14px',
                            background: 'rgba(239,68,68,0.04)',
                            border: '0.5px solid rgba(239,68,68,0.2)',
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
                            color: '#10B981',
                            marginBottom: 4,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                          }}
                        >
                          {isAr ? '💡 إجابة أقوى' : '💡 Stronger Response'}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: '#065F46',
                            lineHeight: 1.8,
                            padding: '10px 14px',
                            background: 'rgba(16,185,129,0.05)',
                            border: '0.5px solid rgba(16,185,129,0.25)',
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
          <div
            style={{
              background: 'rgba(204,120,92,0.06)',
              border: '1px solid rgba(204,120,92,0.3)',
              borderRadius: 20,
              padding: '20px',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: '#CC785C',
                marginBottom: 12,
              }}
            >
              {isAr ? '🎯 خطوتك التالية' : '🎯 Your Next Step'}
            </div>

            <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.9 }}>
              {r.recommendation}
            </div>
          </div>
        )}

        {/* 9. CTA */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            onClick={() => {
              sessionStorage.removeItem('barbaros_report')
              router.push('/onboarding')
            }}
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
            {isAr ? '🔁 مقابلة جديدة' : '🔁 Start New Interview'}
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
                fontSize: 10.5,
                lineHeight: 1.6,
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
