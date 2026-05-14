'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface ScoreData {
  score: number
  clarity: number
  confidence: number
  relevance: number
  technical_depth: number
  structure: number
  communication: number
  problem_solving: number
  leadership: number
  hesitation_signals: number
  question_type: string
  coaching_note: string
  notes: string
  question?: string
  answer_summary?: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  score?: ScoreData
  coaching_note?: string
  question_type?: string
}

interface Config {
  candidateName: string
  jobTitle: string
  institution: string
  sector: string
  yearsExperience: string
  language: string
  plan: string
}

interface QAPair {
  question: string
  answer: string
  score: ScoreData
  qType: string
}

const Barbaros = ({ size = 22 }: { size?: number }) => (
  <span style={{ fontWeight: 900, fontSize: size }}>
    <span style={{ color: '#1A1A1A' }}>Barbar</span>
    <span style={{ color: '#CC785C' }}>os</span>
  </span>
)

const getScoreColor = (score: number) => {
  if (score >= 75) return '#10B981'
  if (score >= 50) return '#F59E0B'
  if (score >= 25) return '#EF4444'
  return '#9CA3AF'
}

const getScoreLabel = (score: number, isAr: boolean) => {
  if (score >= 80) return isAr ? 'ممتاز' : 'Excellent'
  if (score >= 65) return isAr ? 'جيد جداً' : 'Good'
  if (score >= 50) return isAr ? 'مقبول' : 'Fair'
  if (score >= 25) return isAr ? 'ضعيف' : 'Weak'
  return isAr ? 'لم يُقيَّم' : 'Not Assessed'
}

const criteriaInfo = [
  {
    key: 'clarity', en: 'Clarity', ar: 'الوضوح',
    descEn: 'Your ability to express ideas clearly and directly without confusion.',
    descAr: 'قدرتك على التعبير عن أفكارك بشكل مفهوم ومباشر دون تشتيت.',
    reasonEn: (v: number) => v >= 75 ? 'Your answers were clear and easy to follow throughout.'
      : v >= 50 ? 'Some answers were clear, but others lacked focus and drifted from the point.'
      : 'Your answers were often vague. You described ideas without giving concrete examples or direct conclusions.',
    reasonAr: (v: number) => v >= 75 ? 'كانت إجاباتك واضحة وسهلة المتابعة طوال المقابلة.'
      : v >= 50 ? 'بعض الإجابات كانت واضحة، لكن البعض الآخر افتقر للتركيز وخرج عن الموضوع.'
      : 'كانت إجاباتك مبهمة في الغالب. وصفت الأفكار دون تقديم أمثلة ملموسة أو استنتاجات مباشرة.',
  },
  {
    key: 'confidence', en: 'Confidence', ar: 'الثقة',
    descEn: 'How assured and decisive you sound when presenting your experience.',
    descAr: 'مدى ثقتك وحسمك عند تقديم خبراتك وآرائك.',
    reasonEn: (v: number) => v >= 75 ? 'You spoke with clear conviction and ownership throughout the interview.'
      : v >= 50 ? 'You showed confidence in some areas but hesitated or qualified your answers unnecessarily.'
      : 'Frequent hesitation and hedging language reduced your perceived confidence. Avoid filler words and own your answers.',
    reasonAr: (v: number) => v >= 75 ? 'تحدثت بقناعة واضحة وامتلاك للموضوع طوال المقابلة.'
      : v >= 50 ? 'أظهرت ثقة في بعض المجالات لكنك ترددت أو قيّدت إجاباتك دون داعٍ.'
      : 'أدى التردد المتكرر واستخدام لغة التحوط إلى تقليل الثقة المُدركة. تجنب كلمات الحشو وتملّك إجاباتك.',
  },
  {
    key: 'relevance', en: 'Relevance', ar: 'الصلة بالوظيفة',
    descEn: 'How well your answers connect directly to the job requirements.',
    descAr: 'مدى ارتباط إجاباتك بمتطلبات الوظيفة المحددة.',
    reasonEn: (v: number) => v >= 75 ? 'Your answers consistently addressed the job requirements and stayed on topic.'
      : v >= 50 ? 'Most answers were relevant, but some drifted into unrelated territory.'
      : 'Several answers went off-topic. Keep your responses tied directly to the role and what the interviewer is asking.',
    reasonAr: (v: number) => v >= 75 ? 'تناولت إجاباتك باستمرار متطلبات الوظيفة وبقيت في الموضوع.'
      : v >= 50 ? 'كانت معظم الإجابات ذات صلة، لكن بعضها انجرف إلى موضوعات غير ذات صلة.'
      : 'خرجت عدة إجابات عن الموضوع. احرص على ربط ردودك مباشرة بالدور ومتطلبات المحاور.',
  },
  {
    key: 'technical_depth', en: 'Domain Expertise', ar: 'الخبرة التخصصية',
    descEn: 'The depth of specialized knowledge you demonstrated for this specific role — regardless of field.',
    descAr: 'عمق المعرفة المتخصصة التي أظهرتها في مجال هذا الدور — بغض النظر عن المجال.',
    reasonEn: (v: number) => v >= 75 ? 'You demonstrated strong specialized knowledge with specific examples relevant to your field.'
      : v >= 50 ? 'You showed general awareness but lacked the depth expected for this role.'
      : 'Your answers stayed at a surface level. Interviewers expect field-specific knowledge, not general descriptions.',
    reasonAr: (v: number) => v >= 75 ? 'أظهرت معرفة متخصصة قوية مع أمثلة محددة ذات صلة بمجالك.'
      : v >= 50 ? 'أظهرت وعياً عاماً لكنك افتقرت إلى العمق المتوقع لهذا الدور.'
      : 'بقيت إجاباتك على مستوى سطحي. يتوقع المحاورون معرفة متخصصة بالمجال وليس أوصافاً عامة.',
  },
  {
    key: 'structure', en: 'Structure', ar: 'التنظيم',
    descEn: 'How logically organized your answers are — beginning, middle, and end.',
    descAr: 'مدى تنظيم إجاباتك بشكل منطقي — بداية ووسط ونهاية.',
    reasonEn: (v: number) => v >= 75 ? 'Your answers followed a clear, logical structure that was easy to follow.'
      : v >= 50 ? 'Some answers were structured, but others felt unorganized or jumped between points.'
      : 'Your answers lacked a clear structure. Practice using the STAR method: Situation, Task, Action, Result.',
    reasonAr: (v: number) => v >= 75 ? 'اتبعت إجاباتك هيكلاً واضحاً ومنطقياً سهل المتابعة.'
      : v >= 50 ? 'بعض الإجابات كانت منظمة، لكن البعض الآخر بدا غير منظم أو قفز بين النقاط.'
      : 'افتقرت إجاباتك إلى هيكل واضح. تدرب على استخدام أسلوب STAR: الموقف، المهمة، الإجراء، النتيجة.',
  },
  {
    key: 'communication', en: 'Communication', ar: 'التواصل',
    descEn: 'Your overall ability to engage professionally and articulate your thoughts.',
    descAr: 'قدرتك العامة على التفاعل المهني والتعبير عن أفكارك بوضوح.',
    reasonEn: (v: number) => v >= 75 ? 'You communicated professionally and engaged well throughout the interview.'
      : v >= 50 ? 'Communication was generally good but inconsistent in some moments.'
      : 'Communication gaps were noticeable — work on pacing, word choice, and professional tone.',
    reasonAr: (v: number) => v >= 75 ? 'تواصلت باحترافية وتفاعلت بشكل جيد طوال المقابلة.'
      : v >= 50 ? 'كان التواصل جيداً بشكل عام لكنه كان غير متسق في بعض اللحظات.'
      : 'كانت فجوات التواصل واضحة — اعمل على الإيقاع واختيار الكلمات والنبرة المهنية.',
  },
  {
    key: 'problem_solving', en: 'Problem Solving', ar: 'حل المشكلات',
    descEn: 'Your ability to analyze challenges and walk through structured solutions.',
    descAr: 'قدرتك على تحليل التحديات والمرور بحلول منظمة خطوة بخطوة.',
    reasonEn: (v: number) => v >= 75 ? 'You approached problems analytically with clear reasoning and actionable steps.'
      : v >= 50 ? 'You identified problems well but the solutions lacked detail or clear steps.'
      : 'You tended to describe problems rather than solve them. Show your thinking process step by step.',
    reasonAr: (v: number) => v >= 75 ? 'تعاملت مع المشكلات بشكل تحليلي مع منطق واضح وخطوات قابلة للتنفيذ.'
      : v >= 50 ? 'حددت المشكلات بشكل جيد لكن الحلول افتقرت إلى التفاصيل أو الخطوات الواضحة.'
      : 'كنت تميل إلى وصف المشكلات بدلاً من حلها. أظهر عملية تفكيرك خطوة بخطوة.',
  },
  {
    key: 'leadership', en: 'Leadership', ar: 'القيادة',
    descEn: 'How much you positioned yourself as a decision-maker and owner of outcomes.',
    descAr: 'مدى تقديمك لنفسك كصاحب قرار ومسؤول عن النتائج.',
    reasonEn: (v: number) => v >= 75 ? 'You consistently positioned yourself as the owner and decision-maker in your examples.'
      : v >= 50 ? 'You showed some leadership but often shared credit or minimized your personal role.'
      : 'Your answers rarely positioned you as the decision-maker. Use "I" more than "we" and own your contributions.',
    reasonAr: (v: number) => v >= 75 ? 'قدّمت نفسك باستمرار كصاحب قرار ومسؤول في أمثلتك.'
      : v >= 50 ? 'أظهرت بعض القيادة لكنك غالباً شاركت الفضل أو قللت من دورك الشخصي.'
      : 'نادراً ما قدّمت نفسك كصاحب قرار. استخدم "أنا" أكثر من "نحن" وتملّك مساهماتك.',
  },
] as const

function getHiringVerdict(score: number, isAr: boolean) {
  if (score >= 80) return { label: '✅ Strong Hire', verdict: isAr ? 'بناءً على هذا الأداء — أنت مؤهل للمقابلات الحقيقية. معظم المحاورين سيكملون معك.' : 'Based on this performance — you are ready for real interviews. Most interviewers would move you forward.', color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' }
  if (score >= 65) return { label: '🟡 Maybe Hire', verdict: isAr ? 'أداء جيد لكن هناك ثغرات قد تُحدث فرقاً في اللحظة الحاسمة. تدرّب على نقاط الضعف أدناه.' : 'Solid performance — but gaps exist that could cost you at the critical moment. Work on the weaknesses below.', color: '#78350F', bg: '#FEF3C7', border: '#FCD34D' }
  if (score >= 45) return { label: '⚠️ Risky Candidate', verdict: isAr ? 'المحاور الحقيقي سيلاحظ نقاط ضعفك. تحتاج تحضيراً أعمق قبل المقابلة الفعلية.' : 'A real interviewer would notice your weaknesses. You need deeper preparation before the real interview.', color: '#7C2D12', bg: '#FEE2E2', border: '#FCA5A5' }
  return { label: '❌ Not Recommended', verdict: isAr ? 'الأداء الحالي سيؤدي إلى رفض في معظم المقابلات الحقيقية. راجع التقرير بعناية وابدأ من جديد.' : 'Current performance would likely result in rejection in most real interviews. Review this report carefully and start again.', color: '#7F1D1D', bg: '#FEE2E2', border: '#F87171' }
}

function getHireProbability(score: number): number {
  if (score >= 80) return Math.round(65 + (score - 80) * 1.5)
  if (score >= 65) return Math.round(45 + (score - 65) * 1.3)
  if (score >= 45) return Math.round(20 + (score - 45) * 1.25)
  return Math.round(score * 0.4)
}

function getBarbarosEvaluation(score: number, isAr: boolean): string {
  if (score >= 80) return isAr ? 'أداؤك في هذه المقابلة كان قوياً ومقنعاً — أظهرت عمقاً وثقة يميّزانك عن معظم المرشحين. إذا حافظت على هذا المستوى، فأنت جاهز للمقابلات الحقيقية.' : 'Your performance in this interview was strong and convincing — you demonstrated depth and confidence that set you apart from most candidates. If you maintain this level, you are ready for real interviews.'
  if (score >= 65) return isAr ? 'أظهرت كفاءة واضحة في أجزاء من المقابلة، لكن بعض الإجابات كشفت عن ثغرات قد يلاحظها المحاور الحقيقي. ركّز على نقاط الضعف الموضحة أدناه قبل مقابلتك القادمة.' : 'You showed clear competence in parts of the interview, but some answers revealed gaps that a real interviewer would notice. Focus on the weaknesses outlined below before your next interview.'
  if (score >= 45) return isAr ? 'الإمكانية موجودة لكن الأداء الحالي لن يُقنع معظم المحاورين في المواقف التنافسية. تحتاج إلى تحضير أعمق وتدريب منتظم على الإجابة بأمثلة محددة.' : 'The potential is there but the current performance would not convince most interviewers in competitive situations. You need deeper preparation and regular practice answering with specific examples.'
  return isAr ? 'الأداء الحالي يحتاج تطويراً جوهرياً قبل التقديم على الوظيفة. راجع كل قسم في هذا التقرير بعناية وابدأ بالتدريب المنتظم — مقابلة أخرى ستُحدث فرقاً كبيراً.' : 'The current performance needs substantial improvement before applying for the role. Review every section of this report carefully and start regular practice — another interview session will make a significant difference.'
}

function getInterviewPersona(scoredMessages: Message[], isAr: boolean): { title: string; description: string } {
  const avg = (key: string) => { const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0)); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 }
  const conf = avg('confidence'), tech = avg('technical_depth'), lead = avg('leadership'), clarity = avg('clarity'), hesit = avg('hesitation_signals')
  if (conf >= 70 && tech >= 70) return { title: isAr ? 'الخبير الواثق' : 'The Confident Expert', description: isAr ? 'تُقدّم نفسك بثقة وعمق تخصصي واضح. المحاورون يثقون بك من الدقائق الأولى.' : 'You present with confidence and clear domain depth. Interviewers trust you from the first minutes.' }
  if (conf >= 60 && clarity >= 65) return { title: isAr ? 'المتواصل المحترف' : 'The Clear Communicator', description: isAr ? 'إجاباتك منظمة وواضحة. نقطة قوتك الأكبر هي قدرتك على الشرح — لكن العمق التخصصي يحتاج تطوير.' : 'Your answers are structured and clear. Your biggest strength is explanation — but domain expertise needs work.' }
  if (lead >= 65) return { title: isAr ? 'المفكر الاستراتيجي' : 'The Strategic Thinker', description: isAr ? 'تفكيرك استراتيجي وتُظهر مبادرة واضحة. لكن أحياناً تبتعد عن الإجابة المباشرة.' : 'Your thinking is strategic and you show clear initiative. But you sometimes drift from the direct answer.' }
  if (hesit > 2) return { title: isAr ? 'المرشح المتردد' : 'The Hesitant Candidate', description: isAr ? 'تمتلك المعرفة لكن التردد يُخفيها. المحاور يرى الكفاءة لكن يشكّك في ثقتك بنفسك.' : 'You have the knowledge but hesitation hides it. The interviewer sees competence but doubts your self-confidence.' }
  return { title: isAr ? 'المرشح القابل للتطوير' : 'The Developing Candidate', description: isAr ? 'أنت في بداية رحلتك المهنية. الإمكانية واضحة — لكن التجربة والتدرب سيحدثان الفرق.' : 'You are early in your professional journey. The potential is clear — but practice and experience will make the difference.' }
}

function getHiddenWeakness(scoredMessages: Message[], isAr: boolean): string {
  const avg = (key: string) => { const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0)); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 }
  const scores = { confidence: avg('confidence'), technical_depth: avg('technical_depth'), structure: avg('structure'), problem_solving: avg('problem_solving'), leadership: avg('leadership'), relevance: avg('relevance') }
  const worst = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0]
  const weaknesses: Record<string, { en: string; ar: string }> = {
    confidence: { en: 'You communicate confidently at the start of answers — but precision and conviction drop when challenged or asked for specifics.', ar: 'تبدأ إجاباتك بثقة — لكن الحسم والدقة يتراجعان عند التحدي أو طلب التفاصيل.' },
    technical_depth: { en: 'Your answers show general awareness but lack the field-specific depth that separates strong candidates from average ones.', ar: 'إجاباتك تُظهر وعياً عاماً لكنها تفتقر إلى العمق التخصصي الذي يُميّز المرشحين الأقوياء.' },
    structure: { en: 'Your ideas are valuable but the lack of clear structure makes it hard for the interviewer to follow your reasoning.', ar: 'أفكارك قيّمة لكن غياب الهيكل الواضح يجعل من الصعب على المحاور متابعة منطقك.' },
    problem_solving: { en: 'When faced with complex scenarios, you tend to describe the problem rather than walk through a structured solution.', ar: 'عند مواجهة سيناريوهات معقدة، تميل إلى وصف المشكلة بدلاً من تقديم حل منظم خطوة بخطوة.' },
    leadership: { en: 'You rarely position yourself as the decision-maker or owner in your examples — which raises questions about initiative.', ar: 'نادراً ما تضع نفسك كصاحب قرار في أمثلتك — مما يُثير تساؤلات حول قدرتك على المبادرة.' },
    relevance: { en: 'Some of your answers drift from the actual question — a pattern interviewers notice immediately.', ar: 'بعض إجاباتك تبتعد عن السؤال الفعلي — وهذا نمط يلاحظه المحاورون فوراً.' },
  }
  return isAr ? weaknesses[worst].ar : weaknesses[worst].en
}

function getHiringRisk(scoredMessages: Message[], overallScore: number, isAr: boolean): string {
  const totalHesitation = scoredMessages.reduce((sum, m) => sum + ((m.score as any)?.hesitation_signals ?? 0), 0)
  if (totalHesitation > 6) return isAr ? 'مخاطرة توظيف: تردد ملحوظ في الإجابات يُشير إلى ضعف في الثقة تحت الضغط — وهو ما يُقلق المحاورين في الأدوار الحساسة.' : 'Hiring concern: Noticeable hesitation across answers signals low pressure confidence — a red flag for high-stakes roles.'
  if (overallScore < 50) return isAr ? 'مخاطرة توظيف: الأداء الحالي أقل من الحد المطلوب لمعظم الوظيفات التنافسية. يُنصح بالتدريب المكثف قبل التقديم.' : 'Hiring concern: Current performance falls below the threshold for most competitive roles. Intensive preparation is advised before applying.'
  const avgTech = scoredMessages.reduce((sum, m) => sum + ((m.score as any)?.technical_depth ?? 0), 0) / (scoredMessages.length || 1)
  if (avgTech < 50) return isAr ? 'مخاطرة توظيف: ضعف في الخبرة التخصصية قد يُعيق قبولك في الأدوار التي تتطلب معرفة متعمقة.' : 'Hiring concern: Weak domain expertise may prevent acceptance in roles requiring specialized knowledge.'
  return isAr ? 'لا مخاطر توظيف حرجة — لكن راجع نقاط الضعف أعلاه لرفع احتمالية القبول.' : 'No critical hiring risks detected — but review the weaknesses above to increase your acceptance probability.'
}

function getBestAndWorst(scoredMessages: Message[]): { best: Message | null; worst: Message | null } {
  if (!scoredMessages.length) return { best: null, worst: null }
  const sorted = [...scoredMessages].sort((a, b) => ((b.score?.score ?? 0) - (a.score?.score ?? 0)))
  return { best: sorted[0], worst: sorted[sorted.length - 1] }
}

function getRecommendation(score: number, plan: string, isAr: boolean): { title: string; body: string; cta: string; isUpgrade: boolean } {
  if (score < 50) return {
    title: isAr ? '🎯 خطوتك التالية' : '🎯 Your Next Step',
    body: isAr
      ? `درجتك الحالية ${score}/100 تُظهر أن هناك فرصة حقيقية للتطور. مقابلة أخرى مع باربروس ستساعدك على:\n• تحديد الأنماط المتكررة في إجاباتك\n• بناء ثقة أعلى تحت الضغط\n• الوصول لدرجة تؤهلك للوظائف التنافسية\n\nالمرشحون الذين أجروا مقابلتين أو أكثر حققوا تحسناً بمعدل 28 نقطة في المتوسط.`
      : `Your current score of ${score}/100 shows there is real room for growth. Another session with Barbaros will help you:\n• Identify recurring patterns in your answers\n• Build higher confidence under pressure\n• Reach a score that qualifies you for competitive roles\n\nCandidates who completed two or more sessions improved by an average of 28 points.`,
    cta: isAr ? '🔁 ابدأ مقابلة جديدة' : '🔁 Start a New Interview',
    isUpgrade: false
  }
  if (plan === 'go') return {
    title: isAr ? '⬆️ ارفع مستواك' : '⬆️ Take It Further',
    body: isAr
      ? `درجتك ${score}/100 قوية — لكن جلسة الـ Go تمنحك 15 دقيقة فقط. مع باقة Pro ($15/شهر) ستحصل على 7 جلسات كاملة، أو Expert ($49/شهر) لـ 20 جلسة:\n• وقت أطول يكشف أداءك الحقيقي تحت الضغط المتراكم\n• أسئلة أعمق مخصصة لمستواك\n• باربروس يتذكر نقاط ضعفك ويشدد عليها في كل جلسة`
      : `Your score of ${score}/100 is strong — but the Go session gives you only 15 minutes. With Pro ($15/mo) you get 7 sessions, or Expert ($49/mo) for 20 full sessions:\n• More time that reveals your true performance under accumulated pressure\n• Deeper questions tailored to your level\n• Barbaros remembers your weaknesses and targets them every session`,
    cta: isAr ? '⬆️ ترقية للباقة Pro' : '⬆️ Upgrade to Pro',
    isUpgrade: true
  }
  return {
    title: isAr ? '⬆️ الخطوة التالية' : '⬆️ Next Level',
    body: isAr
      ? `درجتك ${score}/100 تضعك في الفئة العليا. باقة Expert ($49/شهر) تمنحك 20 جلسة كاملة 45 دقيقة:\n• أسئلة CV معمّقة\n• سيناريوهات ضغط حقيقية\n• تقرير شامل يُغطي كل كفاءة بالتفصيل`
      : `Your score of ${score}/100 puts you in the top tier. The Expert plan ($49/mo) gives you 20 full 45-minute sessions:\n• Deep CV-based questions\n• Real pressure scenarios\n• A comprehensive report covering every competency in detail`,
    cta: isAr ? '⬆️ ترقية للباقة Expert' : '⬆️ Upgrade to Expert',
    isUpgrade: true
  }
}

const Section = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: '#FFFFFF', border: '1px solid #E5DDD0', borderRadius: 20, padding: '20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', ...style }}>{children}</div>
)
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: '#1A1A1A' }}>{children}</div>
)

export default function ReportPage() {
  const router = useRouter()
  const [mounted, setMounted]                     = useState(false)
  const [messages, setMessages]                   = useState<Message[]>([])
  const [config, setConfig]                       = useState<Config | null>(null)
  const [overallScore, setOverallScore]           = useState<number>(0)
  const [isAr, setIsAr]                           = useState(false)
  const [showConvo, setShowConvo]                 = useState(false)
  const [showQA, setShowQA]                       = useState(false)
  const [correctiveAnswers, setCorrectiveAnswers] = useState<Record<number, string>>({})
  const [loadingIdx, setLoadingIdx]               = useState<number | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('barbaros_report')
      if (raw) {
        const report  = JSON.parse(raw)
        const msgs: Message[] = report.messages || []
        const score: number   = report.finalScore || 0
        const cfg: Config     = {
          candidateName:  report.candidateName  || '',
          jobTitle:       report.jobTitle        || '',
          institution:    report.institution     || '',
          sector:         report.sector          || '',
          yearsExperience:report.yearsExperience || '',
          language:       report.language        || 'en',
          plan:           report.plan            || 'go',
        }
        setMessages(msgs)
        setOverallScore(isNaN(score) ? 0 : score)
        setConfig(cfg)
        setIsAr(cfg.language === 'ar')
      } else {
        const msgs: Message[] = JSON.parse(sessionStorage.getItem('barbaros_messages') || '[]')
        const score = parseInt(sessionStorage.getItem('barbaros_score') || '0')
        const cfg: Config = JSON.parse(sessionStorage.getItem('barbaros_config') || '{}')
        setMessages(msgs)
        setOverallScore(isNaN(score) ? 0 : score)
        setConfig(cfg)
        setIsAr(cfg?.language === 'ar')
      }
    } catch {
      setMessages([])
      setOverallScore(0)
    }
    setMounted(true)
  }, [])

  // ✅ Fetch corrective answer with localStorage cache
  const fetchCorrective = useCallback(async (
    index: number,
    pair: QAPair,
    cfg: Config,
    ar: boolean
  ) => {
    // تحقق من Cache أولاً
    const cacheKey = `barbaros_corrective_${cfg.candidateName}_${cfg.jobTitle}_${index}`
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        setCorrectiveAnswers(prev => ({ ...prev, [index]: cached }))
        return
      }
    } catch {}

    // إجابة قوية لا تحتاج توليد
    if (pair.score.score >= 75) {
      const msg = ar ? '✅ إجابة قوية — لا تحتاج تصحيحاً.' : '✅ Strong answer — no correction needed.'
      setCorrectiveAnswers(prev => ({ ...prev, [index]: msg }))
      try { localStorage.setItem(cacheKey, msg) } catch {}
      return
    }

    setLoadingIdx(index)
    try {
      const res = await fetch('/api/report/corrective-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:   pair.question,
          userAnswer: pair.answer,
          jobTitle:   cfg.jobTitle,
          sector:     cfg.sector,
          score:      pair.score.score,
          language:   cfg.language
        })
      })
      const data = await res.json()
      const answer = data.correctiveAnswer || (ar ? 'تعذّر توليد الإجابة.' : 'Could not generate answer.')
      setCorrectiveAnswers(prev => ({ ...prev, [index]: answer }))
      try { localStorage.setItem(cacheKey, answer) } catch {}
    } catch {
      const err = ar ? 'تعذّر التوليد. حاول مرة أخرى.' : 'Generation failed. Please try again.'
      setCorrectiveAnswers(prev => ({ ...prev, [index]: err }))
    } finally {
      setLoadingIdx(null)
    }
  }, [])

  if (!mounted) return (
    <div style={{ minHeight: '100vh', background: '#F5F1EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 14, color: 'rgba(26,26,26,0.4)', fontFamily: 'system-ui' }}>
        {isAr ? 'جاري تحميل التقرير...' : 'Loading report...'}
      </div>
    </div>
  )

  const scoredMessages  = messages.filter(m => m.score)
  const visibleMessages = messages.filter(m => !m.content.startsWith('['))

  const avg = (key: string) => {
    const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0)).filter(v => !isNaN(v))
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  }

  const questionTypes = scoredMessages.reduce((acc, m) => {
    const qt = m.question_type || (m.score as any)?.question_type || 'General'
    acc[qt] = (acc[qt] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const verdict        = getHiringVerdict(overallScore, isAr)
  const hirePct        = getHireProbability(overallScore)
  const persona        = getInterviewPersona(scoredMessages, isAr)
  const hiddenWeak     = scoredMessages.length ? getHiddenWeakness(scoredMessages, isAr) : null
  const hiringRisk     = scoredMessages.length ? getHiringRisk(scoredMessages, overallScore, isAr) : null
  const { best, worst } = getBestAndWorst(scoredMessages)
  const pressureData   = scoredMessages.map((m, i) => ({ i: i + 1, s: m.score?.score ?? 0 }))
  const barbarosEval   = getBarbarosEvaluation(overallScore, isAr)
  const recommendation = getRecommendation(overallScore, config?.plan || 'go', isAr)

  // بناء Q&A pairs
  const qaPairs: QAPair[] = []
  for (let i = 0; i < visibleMessages.length - 1; i++) {
    const msg  = visibleMessages[i]
    const next = visibleMessages[i + 1]
    if (msg.role === 'assistant' && next?.role === 'user' && next.score) {
      const questionText  = msg.content
      const questionMatch = questionText.match(/[^.!؟?]*[?؟][^?؟]*$/)?.[0]?.trim() || questionText.slice(-200).trim()
      qaPairs.push({
        question: questionMatch,
        answer:   next.content,
        score:    next.score,
        qType:    next.question_type || (next.score as any)?.question_type || 'General',
      })
    }
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ fontFamily: 'system-ui, sans-serif', background: '#F5F1EB', color: '#1A1A1A', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ background: '#F5F1EB', borderBottom: '0.5px solid #E5DDD0', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Barbaros size={20} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#CC785C' }}>{isAr ? 'تقرير المقابلة' : 'Interview Report'}</div>
        <button onClick={() => router.push('/')} style={{ background: '#FFFFFF', border: '0.5px solid #E5DDD0', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#1A1A1A', fontFamily: 'inherit' }}>
          {isAr ? 'الرئيسية' : 'Home'}
        </button>
      </nav>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 80px' }}>

        {/* 1. SCORE CIRCLE */}
        <Section style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'rgba(26,26,26,0.5)', marginBottom: 2 }}>{config?.candidateName} · {config?.jobTitle}</div>
          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)', marginBottom: 24 }}>{config?.institution}</div>
          <div style={{ width: 130, height: 130, borderRadius: '50%', margin: '0 auto 16px', background: `conic-gradient(${getScoreColor(overallScore)} ${overallScore * 3.6}deg, #E5DDD0 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: getScoreColor(overallScore), lineHeight: 1 }}>{overallScore}</div>
              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>/100</div>
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: getScoreColor(overallScore), marginBottom: 6 }}>{getScoreLabel(overallScore, isAr)}</div>
          <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.45)', marginBottom: 16 }}>
            {scoredMessages.length > 0
              ? (isAr ? `بناءً على ${scoredMessages.length} إجابة` : `Based on ${scoredMessages.length} answer${scoredMessages.length !== 1 ? 's' : ''}`)
              : (isAr ? 'لم تُسجَّل إجابات كافية' : 'No answers recorded')}
          </div>
          <div style={{ margin: '16px 0', padding: '14px 16px', background: '#F5F1EB', border: '0.5px solid #E5DDD0', borderRadius: 12, textAlign: isAr ? 'right' : 'left' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#CC785C', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>{isAr ? 'تقييم باربروس' : 'Barbaros Assessment'}</div>
            <div style={{ fontSize: 12, color: '#1A1A1A', lineHeight: 1.8, fontStyle: 'italic' }}>"{barbarosEval}"</div>
          </div>
          {scoredMessages.length > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(204,120,92,0.08)', border: '0.5px solid rgba(204,120,92,0.25)', borderRadius: 20, padding: '6px 16px' }}>
              <span style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', fontWeight: 600 }}>{isAr ? 'احتمال القبول' : 'Hire Probability'}</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#CC785C' }}>{hirePct}%</span>
            </div>
          )}
        </Section>

        {/* 2. HIRING VERDICT */}
        {scoredMessages.length > 0 && (
          <div style={{ background: verdict.bg, border: `1px solid ${verdict.border}`, borderRadius: 20, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: verdict.color, marginBottom: 10 }}>{verdict.label}</div>
            <div style={{ fontSize: 13, color: verdict.color, lineHeight: 1.7 }}>{verdict.verdict}</div>
          </div>
        )}

        {/* 3. INTERVIEW PERSONA */}
        {scoredMessages.length > 0 && (
          <Section>
            <SectionTitle>{isAr ? '🧠 شخصية المقابلة' : '🧠 Interview Persona'}</SectionTitle>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#CC785C', marginBottom: 8 }}>{persona.title}</div>
            <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.8, fontStyle: 'italic' }}>"{persona.description}"</div>
          </Section>
        )}

        {/* 4. HIDDEN WEAKNESS */}
        {hiddenWeak && (
          <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', marginBottom: 10 }}>{isAr ? '⚠️ نقطة الضعف الخفية' : '⚠️ Hidden Weakness'}</div>
            <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.8 }}>{hiddenWeak}</div>
          </div>
        )}

        {/* 5. HIRING RISK */}
        {hiringRisk && (
          <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 10 }}>{isAr ? '🔎 تقييم المحاور الحقيقي' : '🔎 Real Recruiter Assessment'}</div>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.8 }}>{hiringRisk}</div>
          </div>
        )}

        {/* 6. PRESSURE GRAPH */}
        {pressureData.length >= 2 && (
          <Section>
            <SectionTitle>{isAr ? '📉 الأداء تحت الضغط' : '📉 Performance Under Pressure'}</SectionTitle>
            <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.45)', marginBottom: 12 }}>{isAr ? 'كيف تغيّر أداؤك عبر المقابلة' : 'How your performance evolved through the interview'}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
              {pressureData.map(({ i, s }) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', borderRadius: 4, height: `${Math.max(4, (s / 100) * 64)}px`, background: getScoreColor(s), transition: 'height 0.3s' }} />
                  <div style={{ fontSize: 9, color: 'rgba(26,26,26,0.4)', fontWeight: 700 }}>{isAr ? `س${i}` : `Q${i}`}</div>
                </div>
              ))}
            </div>
            {pressureData.length >= 3 && (() => {
              const first = pressureData.slice(0, Math.ceil(pressureData.length / 2))
              const last  = pressureData.slice(Math.ceil(pressureData.length / 2))
              const diff  = Math.round((last.reduce((a, b) => a + b.s, 0) / last.length) - (first.reduce((a, b) => a + b.s, 0) / first.length))
              return (
                <div style={{ marginTop: 10, fontSize: 12, color: diff >= 0 ? '#065F46' : '#DC2626', fontWeight: 700 }}>
                  {diff >= 0
                    ? (isAr ? `✅ تحسّن أداؤك بمقدار ${diff} نقطة` : `✅ Performance improved by ${diff} points`)
                    : (isAr ? `⚠️ انخفض أداؤك بمقدار ${Math.abs(diff)} نقطة` : `⚠️ Performance dropped ${Math.abs(diff)} points`)}
                </div>
              )
            })()}
          </Section>
        )}

        {/* 7. CRITERIA BREAKDOWN */}
        <Section>
          <SectionTitle>{isAr ? '📊 تفصيل المعايير' : '📊 Criteria Breakdown'}</SectionTitle>
          {criteriaInfo.map(({ key, en, ar, descEn, descAr, reasonEn, reasonAr }) => {
            const val = avg(key)
            return (
              <div key={key} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '0.5px solid #F5F1EB' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{isAr ? ar : en}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: getScoreColor(val) }}>{val}/100</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.45)', marginBottom: 8, fontStyle: 'italic' }}>{isAr ? descAr : descEn}</div>
                <div style={{ height: 6, background: '#F5F1EB', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${val}%`, background: getScoreColor(val), transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: 12, color: '#1A1A1A', lineHeight: 1.7, padding: '8px 12px', background: val >= 75 ? 'rgba(16,185,129,0.05)' : val >= 50 ? 'rgba(245,158,11,0.05)' : 'rgba(239,68,68,0.05)', borderRadius: 8, borderLeft: isAr ? 'none' : `3px solid ${getScoreColor(val)}`, borderRight: isAr ? `3px solid ${getScoreColor(val)}` : 'none' }}>
                  {isAr ? reasonAr(val) : reasonEn(val)}
                </div>
              </div>
            )
          })}
        </Section>

        {/* 8. BEST & WORST */}
        {best && worst && best !== worst && (
          <Section>
            <SectionTitle>{isAr ? '🏆 أفضل وأضعف إجابة' : '🏆 Best & Worst Answer'}</SectionTitle>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>{isAr ? `✅ أقوى إجابة · ${best.score?.score}/100` : `✅ Strongest Answer · ${best.score?.score}/100`}</div>
              <div style={{ fontSize: 12, background: '#F0FDF4', border: '0.5px solid #6EE7B7', borderRadius: 10, padding: '10px 14px', color: '#065F46', lineHeight: 1.7 }}>{best.content.length > 200 ? best.content.slice(0, 200) + '...' : best.content}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>{isAr ? `⚠️ أضعف إجابة · ${worst.score?.score}/100` : `⚠️ Weakest Answer · ${worst.score?.score}/100`}</div>
              <div style={{ fontSize: 12, background: '#FEF2F2', border: '0.5px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#7F1D1D', lineHeight: 1.7 }}>{worst.content.length > 200 ? worst.content.slice(0, 200) + '...' : worst.content}</div>
            </div>
          </Section>
        )}

        {/* 9. QUESTION TYPES */}
        {Object.keys(questionTypes).length > 0 && (
          <Section>
            <SectionTitle>{isAr ? '🎯 أنواع الأسئلة' : '🎯 Question Types'}</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(questionTypes).map(([type, count]) => (
                <div key={type} style={{ padding: '6px 12px', borderRadius: 20, background: 'rgba(204,120,92,0.08)', border: '0.5px solid rgba(204,120,92,0.25)', fontSize: 11, fontWeight: 700, color: '#CC785C' }}>
                  {type.replace('_', ' ')} × {count}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 10. Q&A BREAKDOWN */}
        {qaPairs.length > 0 && (
          <Section>
            <button
              onClick={() => {
                const next = !showQA
                setShowQA(next)
                // ✅ Go Plan: يولّد عند فتح Q&A
                if (next && config?.plan === 'go' && config) {
                  qaPairs.forEach((pair, i) => {
                    if (correctiveAnswers[i] === undefined) {
                      fetchCorrective(i, pair, config, isAr)
                    }
                  })
                }
              }}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              <span style={{ fontSize: 13, fontWeight: 800 }}>{isAr ? '📋 تفصيل الأسئلة والأجوبة' : '📋 Questions & Answers Breakdown'}</span>
              <span style={{ fontSize: 12, color: '#CC785C', fontWeight: 700 }}>{showQA ? (isAr ? 'إخفاء ▲' : 'Hide ▲') : (isAr ? 'عرض ▼' : 'Show ▼')}</span>
            </button>

            {showQA && (
              <div style={{ marginTop: 16 }}>
                {qaPairs.map((pair, i) => (
                  <div key={i} style={{ marginBottom: 28, paddingBottom: 28, borderBottom: i < qaPairs.length - 1 ? '1px solid #F5F1EB' : 'none' }}>

                    {/* رقم + نوع + درجة */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#CC785C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#CC785C' }}>{pair.qType.replace('_', ' ')}</span>
                      <span style={{ fontSize: 12, fontWeight: 900, color: getScoreColor(pair.score.score), marginLeft: 'auto' }}>{pair.score.score}/100</span>
                    </div>

                    {/* ① سؤال باربروس */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(26,26,26,0.4)', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {isAr ? 'سؤال باربروس' : 'Barbaros Question'}
                      </div>
                      <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.7, padding: '10px 14px', background: '#F5F1EB', borderRadius: 10, fontWeight: 600 }}>
                        {pair.question}
                      </div>
                    </div>

                    {/* ② جواب المستخدم */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(26,26,26,0.4)', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {isAr ? 'جوابك' : 'Your Answer'}
                      </div>
                      <div style={{ fontSize: 12, color: '#1A1A1A', lineHeight: 1.7, padding: '10px 14px', background: 'rgba(204,120,92,0.06)', border: `0.5px solid ${getScoreColor(pair.score.score)}33`, borderRadius: 10 }}>
                        {pair.answer}
                      </div>
                    </div>

                    {/* ③ ملاحظة باربروس */}
                    {pair.score.coaching_note && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          {isAr ? '⚠️ ملاحظة باربروس' : '⚠️ Barbaros Note'}
                        </div>
                        <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.7, padding: '10px 14px', background: 'rgba(239,68,68,0.04)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 10 }}>
                          {pair.score.coaching_note}
                        </div>
                      </div>
                    )}

                    {/* ④ إجابة تصحيحية ذكية */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#10B981', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {isAr ? '✅ إجابة تصحيحية' : '✅ Corrective Answer'}
                      </div>
                      <div style={{ fontSize: 12, color: '#065F46', lineHeight: 1.8, padding: '10px 14px', background: 'rgba(16,185,129,0.05)', border: '0.5px solid rgba(16,185,129,0.25)', borderRadius: 10, minHeight: 44 }}>
                        {loadingIdx === i ? (
                          <span style={{ color: '#CC785C', fontStyle: 'italic' }}>
                            {isAr ? '⏳ باربروس يحلل إجابتك...' : '⏳ Barbaros is analyzing your answer...'}
                          </span>
                        ) : correctiveAnswers[i] !== undefined ? (
                          correctiveAnswers[i]
                        ) : (
                          // Pro/Expert: زر توليد يدوي
                          config?.plan !== 'go' ? (
                            <button
                              onClick={() => config && fetchCorrective(i, pair, config, isAr)}
                              style={{ background: '#CC785C', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              {isAr ? '🔍 توليد إجابة تصحيحية' : '🔍 Generate Corrective Answer'}
                            </button>
                          ) : (
                            <span style={{ color: 'rgba(26,26,26,0.35)', fontStyle: 'italic' }}>
                              {isAr ? 'جاري التوليد...' : 'Generating...'}
                            </span>
                          )
                        )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* 11. FULL CONVERSATION */}
        {visibleMessages.length > 0 && (
          <Section>
            <button onClick={() => setShowConvo(prev => !prev)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{isAr ? '💬 المحادثة الكاملة' : '💬 Full Conversation'}</span>
              <span style={{ fontSize: 12, color: '#CC785C', fontWeight: 700 }}>{showConvo ? (isAr ? 'إخفاء ▲' : 'Hide ▲') : (isAr ? 'عرض ▼' : 'Show ▼')}</span>
            </button>
            {showConvo && (
              <div style={{ marginTop: 14 }}>
                {visibleMessages.map((msg, i) => (
                  <div key={i} style={{ marginBottom: 10, textAlign: msg.role === 'user' ? (isAr ? 'left' : 'right') : (isAr ? 'right' : 'left') }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(26,26,26,0.4)', marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      {msg.role === 'assistant' ? (isAr ? 'المحاور' : 'Interviewer') : (config?.candidateName || 'Candidate')}
                      {msg.score ? ` · ${msg.score.score}/100` : ''}
                    </div>
                    <div style={{ display: 'inline-block', maxWidth: '88%', padding: '8px 12px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: msg.role === 'user' ? '#CC785C' : '#F5F1EB', color: msg.role === 'user' ? '#FFFFFF' : '#1A1A1A', fontSize: 12, lineHeight: 1.7 }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* 12. RECOMMENDATION */}
        <div style={{ background: recommendation.isUpgrade ? 'rgba(204,120,92,0.06)' : 'rgba(16,185,129,0.05)', border: `1px solid ${recommendation.isUpgrade ? 'rgba(204,120,92,0.3)' : 'rgba(16,185,129,0.3)'}`, borderRadius: 20, padding: '20px', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: recommendation.isUpgrade ? '#CC785C' : '#065F46', marginBottom: 12 }}>{recommendation.title}</div>
          <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.9, marginBottom: 16, whiteSpace: 'pre-line' }}>{recommendation.body}</div>
          <button onClick={() => router.push(recommendation.isUpgrade ? '/pricing' : '/onboarding')} style={{ background: recommendation.isUpgrade ? '#CC785C' : '#10B981', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
            {recommendation.cta}
          </button>
        </div>

        {/* 13. GO MOTIVATIONAL MESSAGE */}
        {config?.plan === 'go' && (
          <div style={{ background: 'rgba(204,120,92,0.05)', border: '1px solid rgba(204,120,92,0.2)', borderRadius: 20, padding: '24px 20px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🎯</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', marginBottom: 10, lineHeight: 1.5 }}>
              {isAr ? 'هذه المقابلة أخذت 15 دقيقة من وقتك.' : 'This interview took 15 minutes of your time.'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(26,26,26,0.65)', lineHeight: 1.9, marginBottom: 20, whiteSpace: 'pre-line' }}>
              {isAr
                ? `الوظيفة التي تستهدفها تستحق أكثر.\n\nالمرشحون الذين تدربوا 3 جلسات أو أكثر\nحسّنوا أداءهم بمعدل 31 نقطة.\n\nأنت الآن تعرف بالضبط أين تحتاج التحسين\n— استثمر هذا.`
                : `The job you are targeting deserves more.\n\nCandidates who practiced 3+ sessions\nimproved by an average of 31 points.\n\nYou now know exactly where you need to improve\n— use that.`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => router.push('/onboarding')}
                style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 24px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {isAr ? '🔁 تدرب مجدداً — $2.50' : '🔁 Practice Again — $2.50'}
              </button>
              <button
                onClick={() => router.push('/pricing')}
                style={{ background: '#CC785C', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 24px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {isAr ? '⬆️ احصل على Pro — 7 جلسات / $15 شهرياً' : '⬆️ Get Pro — 7 sessions / $15 per month'}
              </button>
            </div>
          </div>
        )}

        {/* 14. CTA */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            onClick={() => {
              sessionStorage.removeItem('barbaros_report')
              sessionStorage.removeItem('barbaros_messages')
              sessionStorage.removeItem('barbaros_score')
              router.push('/onboarding')
            }}
            style={{ background: 'transparent', color: '#CC785C', border: '1px solid #CC785C', borderRadius: 14, padding: '12px 36px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginBottom: 12 }}
          >
            {isAr ? '🔁 مقابلة جديدة' : '🔁 Start New Interview'}
          </button>
          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>
            <Barbaros size={11} /> · {isAr ? 'مدعوم بالذكاء الاصطناعي' : 'Powered by AI'}
          </div>
        </div>

      </div>
    </div>
  )
}
