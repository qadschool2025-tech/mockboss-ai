"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface MessageScore {
  score: number;
  clarity: number;
  confidence: number;
  relevance: number;
  technical_depth: number;
  structure: number;
  communication: number;
  problem_solving: number;
  leadership: number;
  hesitation_signals: number;
  question_type: string;
  coaching_note: string;
  notes: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  score?: MessageScore | null;
  rebuilt?: string;
  coaching_note?: string;
  question_type?: string;
}

interface BarbarosConfig {
  candidateName: string;
  jobTitle: string;
  institution: string;
  sector: string;
  experienceLevel: string;
  language: string;
  plan: string;
  country?: string;
  freshGraduate?: boolean;
}

interface ReportData {
  config: BarbarosConfig;
  messages: Message[];
  overallScore: number;
  criteria: {
    clarity: number;
    confidence: number;
    relevance: number;
    technical_depth: number;
    structure: number;
    communication: number;
    problem_solving: number;
    leadership: number;
  };
  strongestAnswer: { question: string; answer: string; score: number };
  weakestAnswer: { question: string; answer: string; score: number };
  repeatedMistakes: string[];
  fillerWords: number;
  hiringRisks: string[];
  improvementPlan: string[];
  rebuiltExamples: { original: string; improved: string; question: string }[];
  recruiterEvaluation: string;
  readiness: number;
}

const CRITERIA_LABELS: Record<string, string> = {
  clarity: "Clarity",
  confidence: "Confidence",
  relevance: "Relevance",
  technical_depth: "Technical Depth",
  structure: "Structure",
  communication: "Communication",
  problem_solving: "Problem Solving",
  leadership: "Leadership",
};

const CRITERIA_ICONS: Record<string, string> = {
  clarity: "◎",
  confidence: "◈",
  relevance: "◆",
  technical_depth: "◉",
  structure: "▣",
  communication: "◐",
  problem_solving: "◑",
  leadership: "★",
};

function avg(arr: number[]): number {
  const valid = arr.filter((v) => typeof v === "number" && !isNaN(v));
  if (!valid.length) return 0;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function scoreColor(score: number): string {
  if (score >= 80) return "#4CAF7A";
  if (score >= 60) return "#CC785C";
  return "#C84B4B";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Exceptional";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Developing";
  if (score >= 40) return "Needs Work";
  return "Critical";
}

function readinessLabel(pct: number): string {
  if (pct >= 80) return "Ready to Hire";
  if (pct >= 65) return "Strong Candidate";
  if (pct >= 50) return "Conditional Hire";
  if (pct >= 35) return "Needs Preparation";
  return "Not Ready Yet";
}

function buildReport(): ReportData | null {
  try {
    const rawConfig = sessionStorage.getItem("barbaros_config");
    const rawMessages = sessionStorage.getItem("barbaros_messages");
    const rawScore = sessionStorage.getItem("barbaros_score");
    const rawRebuilt = sessionStorage.getItem("barbaros_rebuilt");

    if (!rawConfig || !rawMessages) return null;

    const config: BarbarosConfig = JSON.parse(rawConfig);
    const messages: Message[] = JSON.parse(rawMessages);
    const overallScore: number = rawScore ? parseInt(rawScore) : 0;
    const rebuiltMap: Record<string, string> = rawRebuilt ? JSON.parse(rawRebuilt) : {};

    // ✅ Scores are on assistant messages
    const scoredAssistant = messages.filter(
      (m) => m.role === "assistant" && m.score && (m.score as MessageScore).score > 0
    );

    if (!scoredAssistant.length) return null;

    const criteriaKeys = [
      "clarity", "confidence", "relevance", "technical_depth",
      "structure", "communication", "problem_solving", "leadership",
    ] as const;

    const criteria: Record<string, number> = {};
    criteriaKeys.forEach((key) => {
      criteria[key] = avg(
        scoredAssistant.map((m) => (m.score as MessageScore)[key]).filter((v) => v > 0)
      );
    });

    // For strongest/weakest: pair each scored assistant msg with the preceding user msg
    const pairs: { question: string; answer: string; score: number }[] = [];
    scoredAssistant.forEach((assistantMsg) => {
      const idx = messages.indexOf(assistantMsg);
      // Find the user message just before this assistant message
      let userAnswer = "";
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          userAnswer = messages[i].content;
          break;
        }
      }
      // Find the assistant question before the user answer
      let question = "Interview Question";
      const userIdx = messages.findIndex((m, i) => i < idx && m.role === "user" && m.content === userAnswer);
      for (let i = userIdx - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          question = messages[i].content;
          break;
        }
      }
      pairs.push({
        question,
        answer: userAnswer,
        score: (assistantMsg.score as MessageScore).score,
      });
    });

    const sortedPairs = [...pairs].sort((a, b) => b.score - a.score);
    const strongestAnswer = sortedPairs[0] || { question: "", answer: "", score: 0 };
    const weakestAnswer = sortedPairs[sortedPairs.length - 1] || { question: "", answer: "", score: 0 };

    // Filler / hesitation
    const fillerWords = avg(
      scoredAssistant.map((m) => (m.score as MessageScore).hesitation_signals ?? 0)
    );

    // Repeated mistakes from coaching_notes
    const coachingNotes = scoredAssistant
      .map((m) => (m.score as MessageScore).coaching_note ?? m.coaching_note ?? "")
      .filter(Boolean);

    const mistakeCounts: Record<string, number> = {};
    coachingNotes.forEach((note) => {
      const lower = note.toLowerCase();
      ["vague", "no example", "too short", "off-topic", "filler", "unclear",
       "repetitive", "structure", "confidence", "pause"].forEach((p) => {
        if (lower.includes(p)) mistakeCounts[p] = (mistakeCounts[p] || 0) + 1;
      });
    });
    const repeatedMistakes = Object.entries(mistakeCounts)
      .filter(([, count]) => count >= 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([label]) => label.charAt(0).toUpperCase() + label.slice(1));

    // Hiring risks
    const hiringRisks: string[] = [];
    if ((criteria.confidence ?? 0) < 55) hiringRisks.push("Low confidence under pressure");
    if ((criteria.technical_depth ?? 0) < 50) hiringRisks.push("Insufficient technical depth");
    if ((criteria.structure ?? 0) < 55) hiringRisks.push("Unstructured responses");
    if (fillerWords > 60) hiringRisks.push("Excessive filler words");
    if ((criteria.relevance ?? 0) < 55) hiringRisks.push("Answers lack focus and relevance");
    if (!hiringRisks.length) hiringRisks.push("No critical risks identified");

    // Improvement plan
    const improvementPlan: string[] = [];
    const plans: Record<string, string> = {
      clarity: "Practice the STAR method — Situation, Task, Action, Result",
      confidence: "Record yourself answering aloud; reduce hedging language",
      relevance: "Before answering, pause 3 seconds and align to the question",
      technical_depth: "Prepare 3 deep technical examples from your career",
      structure: "Use signposting: 'First... Then... Finally...'",
      communication: "Simplify vocabulary; speak in shorter, clearer sentences",
      problem_solving: "Prepare case-study examples that show your process",
      leadership: "Identify and rehearse 2 leadership moments from your experience",
    };
    criteriaKeys.forEach((key) => {
      if ((criteria[key] ?? 0) < 60 && plans[key]) improvementPlan.push(plans[key]);
    });
    if (!improvementPlan.length)
      improvementPlan.push("Excellent foundation — focus on refining technical depth with concrete examples");

    // Rebuilt examples — match user answers to rebuiltMap
    const userAnswers = messages.filter((m) => m.role === "user" && !m.content.startsWith("["));
    const rebuiltExamples = userAnswers
      .filter((m) => rebuiltMap[m.content])
      .slice(0, 3)
      .map((m) => {
        const idx = messages.indexOf(m);
        let question = "Interview Question";
        for (let i = idx - 1; i >= 0; i--) {
          if (messages[i].role === "assistant") { question = messages[i].content; break; }
        }
        return { original: m.content, improved: rebuiltMap[m.content], question };
      });

    // Recruiter evaluation
    const s = overallScore;
    let recruiterEvaluation = "";
    if (s >= 80)
      recruiterEvaluation = `${config.candidateName} presents as a confident, well-prepared candidate. Responses were structured, relevant, and demonstrated genuine command of their field. Recommend advancing to final stage.`;
    else if (s >= 65)
      recruiterEvaluation = `${config.candidateName} shows solid potential with a few areas to develop. Core competencies are present; however, some responses lacked depth or specific examples. Consider a second interview with targeted questions.`;
    else if (s >= 50)
      recruiterEvaluation = `${config.candidateName} demonstrated foundational knowledge but struggled with confidence and structured delivery. Recommend preparation coaching before progressing in competitive roles.`;
    else
      recruiterEvaluation = `${config.candidateName} would benefit significantly from structured interview preparation. Key competencies were not sufficiently demonstrated. Not recommended for this position at this stage.`;

    const readiness = Math.min(100, Math.round(
      s * 0.5 +
      (criteria.confidence ?? 0) * 0.15 +
      (criteria.technical_depth ?? 0) * 0.2 +
      (criteria.structure ?? 0) * 0.15
    ));

    return {
      config, messages, overallScore,
      criteria: criteria as ReportData["criteria"],
      strongestAnswer, weakestAnswer,
      repeatedMistakes, fillerWords,
      hiringRisks, improvementPlan, rebuiltExamples,
      recruiterEvaluation, readiness,
    };
  } catch (e) {
    console.error("buildReport error:", e);
    return null;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BrandLogo() {
  return (
    <span style={{ fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.02em" }}>
      <span style={{ color: "#1A1A1A" }}>Barbar</span>
      <span style={{ color: "#CC785C" }}>os</span>
    </span>
  );
}

function ScoreCircle({ score, size = 140 }: { score: number; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5DDD0" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease" }} />
      </svg>
      <div style={{ textAlign: "center", zIndex: 1 }}>
        <div style={{ fontSize: size > 100 ? "2rem" : "1.4rem", fontWeight: 800, color: "#1A1A1A", lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: "0.65rem", color: "#666", fontWeight: 500, marginTop: 2 }}>/ 100</div>
      </div>
    </div>
  );
}

function CriteriaBar({ label, icon, value, delay = 0 }: { label: string; icon: string; value: number; delay?: number }) {
  const [width, setWidth] = useState(0);
  const color = scoreColor(value);
  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 200 + delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
        <span style={{ fontSize: "0.82rem", color: "#1A1A1A", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ color: "#CC785C", fontSize: "0.9rem" }}>{icon}</span>{label}
        </span>
        <span style={{ fontSize: "0.82rem", fontWeight: 700, color }}>
          {value}<span style={{ fontWeight: 400, color: "#999", fontSize: "0.72rem" }}>/100</span>
        </span>
      </div>
      <div style={{ height: 7, background: "#E5DDD0", borderRadius: 999, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${width}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 999, transition: "width 0.9s cubic-bezier(0.4, 0, 0.2, 1)",
        }} />
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, accent = false }: { title: string; icon: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? "rgba(204, 120, 92, 0.04)" : "#FDFAF6",
      border: `1px solid ${accent ? "rgba(204, 120, 92, 0.25)" : "#E5DDD0"}`,
      borderRadius: 12, padding: "1.4rem 1.6rem", marginBottom: "1.2rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid #E5DDD0" }}>
        <span style={{ fontSize: "1.1rem" }}>{icon}</span>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1A1A1A", letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRebuilt, setExpandedRebuilt] = useState<number | null>(null);

  useEffect(() => {
    const data = buildReport();
    setReport(data);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F1EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #E5DDD0", borderTopColor: "#CC785C", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 1rem" }} />
          <p style={{ color: "#666", fontSize: "0.9rem" }}>Generating your report…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F1EB", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }}>
        <p style={{ color: "#666" }}>No interview data found.</p>
        <button onClick={() => router.push("/onboarding")} style={{ background: "#CC785C", color: "#fff", border: "none", borderRadius: 8, padding: "0.6rem 1.4rem", cursor: "pointer", fontWeight: 600 }}>
          Start an Interview
        </button>
      </div>
    );
  }

  const { config, overallScore, criteria, readiness } = report;
  const isArabic = config.language === "ar";

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      style={{ minHeight: "100vh", background: "#F5F1EB", fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif', color: "#1A1A1A" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @media print { .no-print { display: none !important; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.5s ease both; }
      `}</style>

      {/* Header */}
      <header style={{ background: "#1A1A1A", padding: "1rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BrandLogo />
        <span style={{ fontSize: "0.75rem", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase" }}>Interview Report</span>
        <div className="no-print" style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => window.print()} style={{ background: "transparent", border: "1px solid #444", color: "#aaa", borderRadius: 6, padding: "0.35rem 0.9rem", fontSize: "0.78rem", cursor: "pointer" }}>Print</button>
          <button onClick={() => router.push("/onboarding")} style={{ background: "#CC785C", border: "none", color: "#fff", borderRadius: 6, padding: "0.35rem 0.9rem", fontSize: "0.78rem", cursor: "pointer", fontWeight: 600 }}>New Interview</button>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>

        {/* Hero */}
        <div className="fade-up" style={{ background: "#FDFAF6", border: "1px solid #E5DDD0", borderRadius: 16, padding: "2rem", marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "2rem", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            <ScoreCircle score={overallScore} size={140} />
            <span style={{ fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: scoreColor(overallScore) }}>
              {scoreLabel(overallScore)}
            </span>
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.25rem", color: "#1A1A1A" }}>{config.candidateName}</h1>
            <p style={{ margin: "0 0 1rem", color: "#555", fontSize: "0.9rem" }}>
              {config.jobTitle}{config.institution ? ` · ${config.institution}` : ""}{config.country ? ` · ${config.country}` : ""}
            </p>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", color: "#555", fontWeight: 500 }}>Job Readiness</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: scoreColor(readiness) }}>{readiness}% — {readinessLabel(readiness)}</span>
              </div>
              <div style={{ height: 10, background: "#E5DDD0", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${readiness}%`, background: "linear-gradient(90deg, #CC785C88, #CC785C)", borderRadius: 999, transition: "width 1.4s cubic-bezier(0.4, 0, 0.2, 1)" }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minWidth: 130 }}>
            {[
              { label: "Questions", value: report.messages.filter((m) => m.role === "assistant" && m.score).length },
              { label: "Plan", value: config.plan.charAt(0).toUpperCase() + config.plan.slice(1) },
              { label: "Experience", value: (config as any).yearsExperience || config.experienceLevel || "—" },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "#F0EBE3", borderRadius: 8, padding: "0.45rem 0.8rem", fontSize: "0.78rem" }}>
                <span style={{ color: "#888" }}>{label}: </span>
                <span style={{ fontWeight: 700 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 8 Criteria */}
        <SectionCard title="Performance Criteria" icon="◈">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "0 2.5rem" }}>
            {Object.entries(criteria).map(([key, val], i) => (
              <CriteriaBar key={key} label={CRITERIA_LABELS[key] || key} icon={CRITERIA_ICONS[key] || "●"} value={val as number} delay={i * 80} />
            ))}
          </div>
        </SectionCard>

        {/* Strongest + Weakest */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1.2rem", marginBottom: "1.2rem" }}>
          <div style={{ background: "rgba(76, 175, 122, 0.05)", border: "1px solid rgba(76, 175, 122, 0.3)", borderRadius: 12, padding: "1.3rem 1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <span>✦</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#4CAF7A" }}>Strongest Answer</span>
              <span style={{ marginLeft: "auto", fontWeight: 800, color: "#4CAF7A", fontSize: "0.9rem" }}>{report.strongestAnswer.score}/100</span>
            </div>
            {report.strongestAnswer.question && (
              <p style={{ fontSize: "0.78rem", color: "#888", marginBottom: "0.5rem", fontStyle: "italic" }}>
                "{report.strongestAnswer.question.slice(0, 100)}{report.strongestAnswer.question.length > 100 ? "…" : ""}"
              </p>
            )}
            <p style={{ fontSize: "0.84rem", color: "#1A1A1A", lineHeight: 1.55 }}>
              {report.strongestAnswer.answer.slice(0, 220)}{report.strongestAnswer.answer.length > 220 ? "…" : ""}
            </p>
          </div>

          <div style={{ background: "rgba(200, 75, 75, 0.04)", border: "1px solid rgba(200, 75, 75, 0.25)", borderRadius: 12, padding: "1.3rem 1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <span>⚠</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#C84B4B" }}>Weakest Answer</span>
              <span style={{ marginLeft: "auto", fontWeight: 800, color: "#C84B4B", fontSize: "0.9rem" }}>{report.weakestAnswer.score}/100</span>
            </div>
            {report.weakestAnswer.question && (
              <p style={{ fontSize: "0.78rem", color: "#888", marginBottom: "0.5rem", fontStyle: "italic" }}>
                "{report.weakestAnswer.question.slice(0, 100)}{report.weakestAnswer.question.length > 100 ? "…" : ""}"
              </p>
            )}
            <p style={{ fontSize: "0.84rem", color: "#1A1A1A", lineHeight: 1.55 }}>
              {report.weakestAnswer.answer.slice(0, 220)}{report.weakestAnswer.answer.length > 220 ? "…" : ""}
            </p>
          </div>
        </div>

        {/* Patterns & Filler */}
        <SectionCard title="Patterns & Filler Words" icon="⟲">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: "0.8rem", color: "#888", marginBottom: "0.6rem", fontWeight: 500 }}>Repeated Patterns</p>
              {report.repeatedMistakes.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {report.repeatedMistakes.map((m) => (
                    <span key={m} style={{ background: "rgba(200,75,75,0.08)", color: "#C84B4B", border: "1px solid rgba(200,75,75,0.2)", borderRadius: 6, padding: "0.25rem 0.6rem", fontSize: "0.78rem", fontWeight: 600 }}>{m}</span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: "0.82rem", color: "#666" }}>No consistent issues detected ✓</span>
              )}
            </div>
            <div style={{ minWidth: 160, textAlign: "center" }}>
              <p style={{ fontSize: "0.8rem", color: "#888", marginBottom: "0.5rem", fontWeight: 500 }}>Hesitation Index</p>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: report.fillerWords > 60 ? "rgba(200,75,75,0.1)" : "rgba(76,175,122,0.1)", border: `2px solid ${report.fillerWords > 60 ? "#C84B4B" : "#4CAF7A"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", flexDirection: "column" }}>
                <span style={{ fontSize: "1.4rem", fontWeight: 800, color: report.fillerWords > 60 ? "#C84B4B" : "#4CAF7A", lineHeight: 1 }}>{report.fillerWords}</span>
                <span style={{ fontSize: "0.6rem", color: "#888" }}>avg/answer</span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Hiring Risks */}
        <SectionCard title="Hiring Risk Factors" icon="⚑" accent>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {report.hiringRisks.map((risk, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.86rem", color: risk.startsWith("No critical") ? "#4CAF7A" : "#1A1A1A" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: risk.startsWith("No critical") ? "#4CAF7A" : "#C84B4B", flexShrink: 0 }} />
                {risk}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Improvement Plan */}
        <SectionCard title="Suggested Improvement Plan" icon="◎">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {report.improvementPlan.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", fontSize: "0.86rem", lineHeight: 1.5 }}>
                <span style={{ background: "#CC785C", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Rebuilt Examples */}
        {report.rebuiltExamples.length > 0 && (
          <SectionCard title="Example Improved Answers" icon="✦">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              {report.rebuiltExamples.map((ex, i) => (
                <div key={i} style={{ border: "1px solid #E5DDD0", borderRadius: 10, overflow: "hidden" }}>
                  <button onClick={() => setExpandedRebuilt(expandedRebuilt === i ? null : i)}
                    style={{ width: "100%", background: "#F5F1EB", border: "none", padding: "0.75rem 1rem", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", color: "#1A1A1A", fontWeight: 600 }}>
                    <span>Q{i + 1}: {ex.question.slice(0, 80)}…</span>
                    <span style={{ color: "#CC785C", fontSize: "1rem" }}>{expandedRebuilt === i ? "−" : "+"}</span>
                  </button>
                  {expandedRebuilt === i && (
                    <div style={{ padding: "1rem" }}>
                      <div style={{ marginBottom: "0.75rem" }}>
                        <p style={{ fontSize: "0.72rem", color: "#999", marginBottom: "0.35rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your Answer</p>
                        <p style={{ fontSize: "0.84rem", color: "#555", lineHeight: 1.55, background: "#F5F1EB", padding: "0.6rem 0.8rem", borderRadius: 6 }}>{ex.original}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: "0.72rem", color: "#CC785C", marginBottom: "0.35rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Improved Version</p>
                        <p style={{ fontSize: "0.84rem", color: "#1A1A1A", lineHeight: 1.6, background: "rgba(204,120,92,0.06)", padding: "0.6rem 0.8rem", borderRadius: 6, borderLeft: "3px solid #CC785C" }}>{ex.improved}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Recruiter Evaluation */}
        <div style={{ background: "#1A1A1A", borderRadius: 12, padding: "1.5rem 1.8rem", marginBottom: "1.2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
            <span>👔</span>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#CC785C" }}>Recruiter Evaluation</span>
          </div>
          <p style={{ fontSize: "0.92rem", color: "#E5DDD0", lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>"{report.recruiterEvaluation}"</p>
          <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid #333", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontWeight: 900, fontSize: "0.85rem" }}>
              <span style={{ color: "#fff" }}>Barbar</span><span style={{ color: "#CC785C" }}>os</span>
            </span>
            <span style={{ fontSize: "0.75rem", color: "#666" }}>Interview Intelligence</span>
          </div>
        </div>

        {/* CTA */}
        <div className="no-print" style={{ textAlign: "center", paddingTop: "1rem" }}>
          <button
            onClick={() => router.push("/onboarding")}
            style={{ background: "#CC785C", color: "#fff", border: "none", borderRadius: 10, padding: "0.85rem 2.4rem", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em", boxShadow: "0 4px 20px rgba(204,120,92,0.35)" }}
          >
            Practice Again →
          </button>
          <p style={{ fontSize: "0.78rem", color: "#aaa", marginTop: "0.6rem" }}>Each session brings you closer to the offer.</p>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: "#EDE6D8", borderTop: "1px solid #E5DDD0", padding: "1.2rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <BrandLogo />
        <span style={{ fontSize: "0.75rem", color: "#999" }}>AI-powered interview intelligence · mockboss-ai.vercel.app</span>
        <span style={{ fontSize: "0.75rem", color: "#bbb" }}>© {new Date().getFullYear()} Barbaros</span>
      </footer>
    </div>
  );
}
