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

    const pairs: { question: string; answer: string; score: number }[] = [];
    scoredAssistant.forEach((assistantMsg) => {
      const idx = messages.indexOf(assistantMsg);
      let userAnswer = "";
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === "user") { userAnswer = messages[i].content; break; }
      }
      let question = "Interview Question";
      const userIdx = messages.findIndex((m, i) => i < idx && m.role === "user" && m.content === userAnswer);
      for (let i = userIdx - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") { question = messages[i].content; break; }
      }
      pairs.push({ question, answer: userAnswer, score: (assistantMsg.score as MessageScore).score });
    });

    const sortedPairs = [...pairs].sort((a, b) => b.score - a.score);
    const strongestAnswer = sortedPairs[0] || { question: "", answer: "", score: 0 };
    const weakestAnswer = sortedPairs[sortedPairs.length - 1] || { question: "", answer: "", score: 0 };

    const fillerWords = avg(
      scoredAssistant.map((m) => (m.score as MessageScore).hesitation_signals ?? 0)
    );

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

    const hiringRisks: string[] = [];
    if ((criteria.confidence ?? 0) < 55) hiringRisks.push("Low confidence under pressure");
    if ((criteria.technical_depth ?? 0) < 50) hiringRisks.push("Insufficient technical depth");
    if ((criteria.structure ?? 0) < 55) hiringRisks.push("Unstructured responses");
    if (fillerWords > 60) hiringRisks.push("Excessive filler words");
    if ((criteria.relevance ?? 0) < 55) hiringRisks.push("Answers lack focus and relevance");
    if (!hiringRisks.length) hiringRisks.push("No critical risks identified");

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

function BrandLogo() {
  return (
    <span
