'use client'

import { useState, useEffect } from 'react'
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

// ── Criteria definitions with explanations ────────────────────────────────────
const criteriaInfo = [
  {
    key: 'clarity',
    en: 'Clarity',
    ar: 'الوضوح',
    descEn: 'Your ability to express ideas clearly and directly without confusion.',
    descAr: 'قدرتك على التعبير عن أفكارك بشكل مفهوم ومباشر دون تشتيت.',
    reasonEn: (val: number) => val >= 75
      ? 'Your answers were clear and easy to follow throughout.'
      : val >= 50
      ? 'Some answers were clear, but others lacked focus and drifted from the point.'
      : 'Your answers were often vague. You described ideas without giving concrete examples or direct conclusions.',
    reasonAr: (val: number) => val >= 75
      ? 'كانت إجاباتك واضحة وسهلة المتابعة طوال المقابلة.'
      : val >= 50
      ? 'بعض الإجابات كانت واضحة، لكن البعض الآخر افتقر للتركيز وخرج عن الموضوع.'
      : 'كانت إجاباتك مبهمة في الغالب. وصفت الأفكار دون تقديم أمثلة ملموسة أو استنتاجات مباشرة.',
  },
  {
    key: 'confidence',
    en: 'Confidence',
    ar: 'الثقة',
    descEn: 'How assured and decisive you sound when presenting your experience.',
    descAr: 'مدى ثقتك وحسمك عند تقديم خبراتك وآرائك.',
    reasonEn: (val: number) => val >= 75
      ? 'You spoke with clear conviction and ownership throughout the interview.'
      : val >= 50
      ? 'You showed confidence in some areas but hesitated or qualified your answers unnecessarily.'
      : 'Frequent hesitation and hedging language reduced your perceived confidence. Avoid filler words and own your answers.',
    reasonAr: (val: number) => val >= 75
      ? 'تحدثت بقناعة واضحة وامتلاك للموضوع طوال المقابلة.'
      : val >= 50
      ? 'أظهرت ثقة في بعض المجالات لكنك ترددت أو قيّدت إجاباتك دون داعٍ.'
      : 'أدى التردد المتكرر واستخدام لغة التحوط إلى تقليل الثقة المُدركة. تجنب كلمات الحشو وتملّك إجاباتك.',
  },
  {
    key: 'relevance',
    en: 'Relevance',
    ar: 'الصلة بالوظيفة',
    descEn: 'How well your answers connect directly to the job requirements.',
    descAr: 'مدى ارتباط إجاباتك بمتطلبات الوظيفة المحددة.',
    reasonEn: (val: number) => val >= 75
      ? 'Your answers consistently addressed the job requirements and stayed on topic.'
      : val >= 50
      ? 'Most answers were relevant, but some drifted into unrelated territory.'
      : 'Several answers went off-topic. Keep your responses tied directly to the role and what the interviewer is asking.',
    reasonAr: (val: number) => val >= 75
      ? 'تناولت إجاباتك باستمرار متطلبات الوظيفة وبقيت في الموضوع.'
      : val >= 50
      ? 'كانت معظم الإجابات ذات صلة، لكن بعضها انجرف إلى موضوعات غير ذات صلة.'
      : 'خرجت عدة إجابات عن الموضوع. احرص على ربط ردودك مباشرة بالدور ومتطلبات المحاور.',
  },
  {
    key: 'technical_depth',
    en: 'Technical Depth',
    ar: 'العمق التقني',
    descEn: 'The depth of specialized knowledge you demonstrated for this role.',
    descAr: 'عمق المعرفة المتخصصة التي أظهرتها في مجال هذا الدور.',
    reasonEn: (val: number) => val >= 75
      ? 'You demonstrated strong domain knowledge with specific examples and terminology.'
      : val >= 50
      ? 'You showed general awareness but lacked the depth expected for this role.'
      : 'Your answers stayed at a surface level. Interviewers expect specific knowledge, not general descriptions.',
    reasonAr: (val: number) => val >= 75
      ? 'أظهرت معرفة قوية بالمجال مع أمثلة ومصطلحات محددة.'
      : val >= 50
      ? 'أظهرت وعياً عاماً لكنك افتقرت إلى العمق المتوقع لهذا الدور.'
      : 'بقيت إجاباتك على مستوى سطحي. يتوقع المحاورون معرفة محددة وليس أوصافاً عامة.',
  },
  {
    key: 'structure',
    en: 'Structure',
    ar: 'التنظيم',
    descEn: 'How logically organized your answers are — beginning, middle, and end.',
    descAr: 'مدى تنظيم إجاباتك بشكل منطقي — بداية ووسط ونهاية.',
    reasonEn: (val: number) => val >= 75
      ? 'Your answers followed a clear, logical structure that was easy to follow.'
      : val >= 50
      ? 'Some answers were structured, but others felt unorganized or jumped between points.'
      : 'Your answers lacked a clear structure. Practice using the STAR method: Situation, Task, Action, Result.',
    reasonAr: (val: number) => val >= 75
      ? 'اتبعت إجاباتك هيكلاً واضحاً ومنطقياً سهل المتابعة.'
      : val >= 50
      ? 'بعض الإجابات كانت منظمة، لكن البعض الآخر بدا غير منظم أو قفز بين النقاط.'
      : 'افتقرت إجاباتك إلى هيكل واضح. تدرب على استخدام أسلوب STAR: الموقف، المهمة، الإجراء، النتيجة.',
  },
  {
    key: 'communication',
    en: 'Communication',
    ar: 'التواصل',
    descEn: 'Your overall ability to engage professionally and articulate your thoughts.',
    descAr: 'قدرتك العامة على التفاعل المهني والتعبير عن أفكارك بوضوح.',
    reasonEn: (val: number) => val >= 75
      ? 'You communicated professionally and engaged well throughout the interview.'
      : val >= 50
      ? 'Communication was generally good but inconsistent in some moments.'
      : 'Communication gaps were noticeable — work on pacing, word choice, and professional tone.',
    reasonAr: (val: number) => val >= 75
      ? 'تواصلت باحترافية وتفاعلت بشكل جيد طوال المقابلة.'
      : val >= 50
      ? 'كان التواصل جيداً بشكل عام لكنه كان غير متسق في بعض اللحظات.'
      : 'كانت فجوات التواصل واضحة — اعمل على الإيقاع واختيار الكلمات والنبرة المهنية.',
  },
  {
    key: 'problem_solving',
    en: 'Problem Solving',
    ar: 'حل المشكلات',
    descEn: 'Your ability to analyze challenges and walk through structured solutions.',
    descAr: 'قدرتك على تحليل التحديات والمرور بحلول منظمة خطوة بخطوة.',
    reasonEn: (val: number) => val >= 75
      ? 'You approached problems analytically with clear reasoning and actionable steps.'
      : val >= 50
      ? 'You identified problems well but the solutions lacked detail or clear steps.'
      : 'You tended to describe problems rather than solve them. Show your thinking process step by step.',
    reasonAr: (val: number) => val >= 75
      ? 'تعاملت مع المشكلات بشكل تحليلي مع منطق واضح وخطوات قابلة للتنفيذ.'
      : val >= 50
      ? 'حددت المشكلات بشكل جيد لكن الحلول افتقرت إلى التفاصيل أو الخطوات الواضحة.'
      : 'كنت تميل إلى وصف المشكلات بدلاً من حلها. أظهر عملية تفكيرك خطوة بخطوة.',
  },
  {
    key: 'leadership',
    en: 'Leadership',
    ar: 'القيادة',
    descEn: 'How much you positioned yourself as a decision-maker and owner of outcomes.',
    descAr: 'مدى تقديمك لنفسك كصاحب قرار ومسؤول عن النتائج.',
    reasonEn: (val: number) => val >= 75
      ? 'You consistently positioned yourself as the owner and decision-maker in your examples.'
      : val >= 50
      ? 'You showed some leadership but often shared credit or minimized your personal role.'
      : 'Your answers rarely positioned you as the decision-maker. Use "I" more than "we" and own your contributions.',
    reasonAr: (val: number) => val >= 75
      ? 'قدّمت نفسك باستمرار كصاحب قرار ومسؤول في أمثلتك.'
      : val >= 50
      ? 'أظهرت بعض القيادة لكنك غالباً شاركت الفضل أو قللت من دورك الشخصي.'
      : 'نادراً ما قدّمت نفسك كصاحب قرار. استخدم "أنا" أكثر من "نحن" وتملّك مساهماتك.',
  },
] as const

function getHiringVerdict(score: number, isAr: boolean) {
  if (score >= 80) return {
    label: '✅ Strong Hire',
    verdict: isAr
      ? 'بناءً على هذا الأداء — أنت مؤهل للمقابلات الحقيقية. معظم المحاورين سيكملون معك.'
      : 'Based on this performance — you are ready for real interviews. Most interviewers would move you forward.',
    color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7'
  }
  if (score >= 65) return {
    label: '🟡 Maybe Hire',
    verdict: isAr
      ? 'أداء جيد لكن هناك ثغرات قد تُحدث فرقاً في اللحظة الحاسمة. تدرّب على نقاط الضعف أدناه.'
      : 'Solid performance — but gaps exist that could cost you at the critical moment. Work on the weaknesses below.',
    color: '#78350F', bg: '#FEF3C7', border: '#FCD34D'
  }
  if (score >= 45) return {
    label: '⚠️ Risky Candidate',
    verdict: isAr
      ? 'المحاور الحقيقي سيلاحظ نقاط ضعفك. تحتاج تحضيراً أعمق قبل المقابلة الفعلية.'
      : 'A real interviewer would notice your weaknesses. You need deeper preparation before the real interview.',
    color: '#7C2D12', bg: '#FEE2E2', border: '#FCA5A5'
  }
  return {
    label: '❌ Not Recommended',
    verdict: isAr
      ? 'الأداء الحالي سيؤدي إلى رفض في معظم المقابلات الحقيقية. راجع التقرير بعناية وابدأ من جديد.'
      : 'Current performance would likely result in rejection in most real interviews. Review this report carefully and start again.',
    color: '#7F1D1D', bg: '#FEE2E2', border: '#F87171'
  }
}

function getHireProbability(score: number): number {
  if (score >= 80) return Math.round(65 + (score - 80) * 1.5)
  if (score >= 65) return Math.round(45 + (score - 65) * 1.3)
  if (score >= 45) return Math.round(20 + (score - 45) * 1.25)
  return Math.round(score * 0.4)
}

// ── Barbaros 2-sentence evaluation ───────────────────────────────────────────
function getBarbarosEvaluation(score: number, isAr: boolean): string {
  if (score >= 80) return isAr
    ? 'أداؤك في هذه المقابلة كان قوياً ومقنعاً — أظهرت عمقاً وثقة يميّزانك عن معظم المرشحين. إذا حافظت على هذا المستوى، فأنت جاهز للمقابلات الحقيقية.'
    : 'Your performance in this interview was strong and convincing — you demonstrated depth and confidence that set you apart from most candidates. If you maintain this level, you are ready for real interviews.'
  if (score >= 65) return isAr
    ? 'أظهرت كفاءة واضحة في أجزاء من المقابلة، لكن بعض الإجابات كشفت عن ثغرات قد يلاحظها المحاور الحقيقي. ركّز على نقاط الضعف الموضحة أدناه قبل مقابلتك القادمة.'
    : 'You showed clear competence in parts of the interview, but some answers revealed gaps that a real interviewer would notice. Focus on the weaknesses outlined below before your next interview.'
  if (score >= 45) return isAr
    ? 'الإمكانية موجودة لكن الأداء الحالي لن يُقنع معظم المحاورين في المواقف التنافسية. تحتاج إلى تحضير أعمق وتدريب منتظم على الإجابة بأمثلة محددة.'
    : 'The potential is there but the current performance would not convince most interviewers in competitive situations. You need deeper preparation and regular practice answering with specific examples.'
  return isAr
    ? 'الأداء الحالي يحتاج تطويراً جوهرياً قبل التقديم على الوظيفة. راجع كل قسم في هذا التقرير بعناية وابدأ بالتدريب المنتظم — مقابلة أخرى ستُحدث فرقاً كبيراً.'
    : 'The current performance needs substantial improvement before applying for the role. Review every section of this report carefully and start regular practice — another interview session will make a significant difference.'
}

function getInterviewPersona(scoredMessages: Message[], isAr: boolean): { title: string; description: string } {
  const avg = (key: string) => {
    const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0))
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const conf    = avg('confidence')
  const tech    = avg('technical_depth')
  const lead    = avg('leadership')
  const clarity = avg('clarity')
  const hesit   = avg('hesitation_signals')

  if (conf >= 70 && tech >= 70) return {
    title: isAr ? 'الخبير الواثق' : 'The Confident Expert',
    description: isAr
      ? 'تُقدّم نفسك بثقة وعمق تقني واضح. المحاورون يثقون بك من الدقائق الأولى.'
      : 'You present with confidence and clear technical depth. Interviewers trust you from the first minutes.'
  }
  if (conf >= 60 && clarity >= 65) return {
    title: isAr ? 'المتواصل المحترف' : 'The Clear Communicator',
    description: isAr
      ? 'إجاباتك منظمة وواضحة. نقطة قوتك الأكبر هي قدرتك على الشرح — لكن العمق التقني يحتاج تطوير.'
      : 'Your answers are structured and clear. Your biggest strength is explanation — but technical depth needs work.'
  }
  if (lead >= 65) return {
    title: isAr ? 'المفكر الاستراتيجي' : 'The Strategic Thinker',
    description: isAr
      ? 'تفكيرك استراتيجي وتُظهر مبادرة واضحة. لكن أحياناً تبتعد عن الإجابة المباشرة.'
      : 'Your thinking is strategic and you show clear initiative. But you sometimes drift from the direct answer.'
  }
  if (hesit > 2) return {
    title: isAr ? 'المرشح المتردد' : 'The Hesitant Candidate',
    description: isAr
      ? 'تمتلك المعرفة لكن التردد يُخفيها. المحاور يرى الكفاءة لكن يشكّك في ثقتك بنفسك.'
      : 'You have the knowledge but hesitation hides it. The interviewer sees competence but doubts your self-confidence.'
  }
  return {
    title: isAr ? 'المرشح القابل للتطوير' : 'The Developing Candidate',
    description: isAr
      ? 'أنت في بداية رحلتك المهنية. الإمكانية واضحة — لكن التجربة والتدرب سيحدثان الفرق.'
      : 'You are early in your professional journey. The potential is clear — but practice and experience will make the difference.'
  }
}

function getHiddenWeakness(scoredMessages: Message[], isAr: boolean): string {
  const avg = (key: string) => {
    const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0))
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const scores = {
    confidence: avg('confidence'), technical_depth: avg('technical_depth'),
    structure: avg('structure'), problem_solving: avg('problem_solving'),
    leadership: avg('leadership'), relevance: avg('relevance'),
  }
  const worst = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0]
  const weaknesses: Record<string, { en: string; ar: string }> = {
    confidence: { en: 'You communicate confidently at the start of answers — but precision and conviction drop when challenged or asked for specifics.', ar: 'تبدأ إجاباتك بثقة — لكن الحسم والدقة يتراجعان عند التحدي أو طلب التفاصيل.' },
    technical_depth: { en: 'Your answers show general awareness but lack the technical specificity that separates strong candidates from average ones.', ar: 'إجاباتك تُظهر وعياً عاماً لكنها تفتقر إلى العمق التقني الذي يُميّز المرشحين الأقوياء.' },
    structure: { en: 'Your ideas are valuable but the lack of clear structure makes it hard for the interviewer to follow your reasoning.', ar: 'أفكارك قيّمة لكن غياب الهيكل الواضح يجعل من الصعب على المحاور متابعة منطقك.' },
    problem_solving: { en: 'When faced with complex scenarios, you tend to describe the problem rather than walk through a structured solution.', ar: 'عند مواجهة سيناريوهات معقدة، تميل إلى وصف المشكلة بدلاً من تقديم حل منظم خطوة بخطوة.' },
    leadership: { en: 'You rarely position yourself as the decision-maker or owner in your examples — which raises questions about initiative.', ar: 'نادراً ما تضع نفسك كصاحب قرار في أمثلتك — مما يُثير تساؤلات حول قدرتك على المبادرة.' },
    relevance: { en: 'Some of your answers drift from the actual question — a pattern interviewers notice immediately.', ar: 'بعض إجاباتك تبتعد عن السؤال الفعلي — وهذا نمط يلاحظه المحاورون فوراً.' },
  }
  return isAr ? weaknesses[worst].ar : weaknesses[worst].en
}

function getHiringRisk(scoredMessages: Message[], overallScore: number, isAr: boolean): string {
  const totalHesitation = scoredMessages.reduce((sum, m) => sum + ((m.score as any)?.hesitation_signals ?? 0), 0)
  if (totalHesitation > 6) return isAr
    ? 'مخاطرة توظيف: تردد ملحوظ في الإجابات يُشير إلى ضعف في الثقة تحت الضغط — وهو ما يُقلق المحاورين في الأدوار الحساسة.'
    : 'Hiring concern: Noticeable hesitation across answers signals low pressure confidence — a red flag for high-stakes roles.'
  if (overallScore < 50) return isAr
    ? 'مخاطرة توظيف: الأداء الحالي أقل من الحد المطلوب لمعظم الوظيفات التنافسية. يُنصح بالتدريب المكثف قبل التقديم.'
    : 'Hiring concern: Current performance falls below the threshold for most competitive roles. Intensive preparation is advised before applying.'
  const avgTech = scoredMessages.reduce((sum, m) => sum + ((m.score as any)?.technical_depth ?? 0), 0) / (scoredMessages.length || 1)
  if (avgTech < 50) return isAr
    ? 'مخاطرة توظيف: ضعف في العمق التقني قد يُعيق قبولك في الأدوار التي تتطلب خبرة متخصصة.'
    : 'Hiring concern: Weak technical depth may prevent acceptance in roles requiring specialized expertise.'
  return isAr
    ? 'لا مخاطر توظيف حرجة — لكن راجع نقاط الضعف أعلاه لرفع احتمالية القبول.'
    : 'No critical hiring risks detected — but review the weaknesses above to increase your acceptance probability.'
}

function getBestAndWorst(scoredMessages: Message[]): { best: Message | null; worst: Message | null } {
  if (!scoredMessages.length) return { best: null, worst: null }
  const sorted = [...scoredMessages].sort((a, b) => ((b.score?.score ?? 0) - (a.score?.score ?? 0)))
  return { best: sorted[0], worst: sorted[sorted.length - 1] }
}

// ── Ideal answer generator ────────────────────────────────────────────────────
function getIdealAnswerHint(score: ScoreData, isAr: boolean): string {
  const qt = score.question_type || 'General'
  if (isAr) {
    if (qt === 'Technical') return 'الجواب المثالي كان يجب أن يتضمن مثالاً تقنياً محدداً من تجربتك، مع ذكر الأدوات أو المنهجيات التي استخدمتها والنتيجة التي حققتها.'
    if (qt === 'Behavioral') return 'الجواب المثالي يتبع أسلوب STAR: الموقف، المهمة، الإجراء الذي اتخذته شخصياً، والنتيجة القابلة للقياس.'
    if (qt === 'Pressure') return 'الجواب المثالي كان يُظهر هدوءاً وتفكيراً منطقياً تحت الضغط، مع مثال واقعي يدعم كلامك.'
    if (qt === 'Scenario') return 'الجواب المثالي كان يُعرّف المشكلة أولاً، ثم يُقدم خطوات حل واضحة مع توقع التحديات المحتملة.'
    return 'الجواب المثالي كان يجب أن يكون مباشراً، مدعوماً بمثال محدد من تجربتك، وينتهي بنتيجة أو درس مستفاد واضح.'
  }
  if (qt === 'Technical') return 'The ideal answer should include a specific technical example from your experience, mentioning the tools or methodologies used and the measurable outcome achieved.'
  if (qt === 'Behavioral') return 'The ideal answer follows the STAR method: Situation, Task, the Action you personally took, and a measurable Result.'
  if (qt === 'Pressure') return 'The ideal answer demonstrates calm and logical thinking under pressure, supported by a real example that validates your claim.'
  if (qt === 'Scenario') return 'The ideal answer defines the problem first, then presents clear solution steps while anticipating potential challenges.'
  return 'The ideal answer should be direct, supported by a specific example from your experience, and end with a clear outcome or lesson learned.'
}

// ── Recommendation section ────────────────────────────────────────────────────
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
      ? `درجتك ${score}/100 قوية — لكن جلسة الـ Go تمنحك 15 دقيقة فقط. مع باقة Pro أو Expert ستحصل على:\n• وقت أطول يكشف أداءك الحقيقي تحت الضغط المتراكم\n• أسئلة أعمق مخصصة لمستواك\n• تقرير أكثر تفصيلاً يُقنع أي مدير توظيف`
      : `Your score of ${score}/100 is strong — but the Go session gives you only 15 minutes. With Pro or Expert you get:\n• More time that reveals your true performance under accumulated pressure\n• Deeper questions tailored to your level\n• A more detailed report that convinces any hiring manager`,
    cta: isAr ? '⬆️ ترقية للباقة Pro' : '⬆️ Upgrade to Pro',
    isUpgrade: true
  }
  return {
    title: isAr ? '⬆️ الخطوة التالية' : '⬆️ Next Level',
    body: isAr
      ? `درجتك ${score}/100 تضعك في الفئة العليا. باقة Expert تمنحك 60 دقيقة كاملة — الوقت الذي يكشف ما لا تكشفه جلسة قصيرة أبداً:\n• أسئلة CV معمّقة\n• سيناريوهات ضغط حقيقية\n• تقرير شامل يُغطي كل كفاءة بالتفصيل`
      : `Your score of ${score}/100 puts you in the top tier. The Expert plan gives you 60 full minutes — the time that reveals what a short session never can:\n• Deep CV-based questions\n• Real pressure scenarios\n• A comprehensive report covering every competency in detail`,
    cta: isAr ? '⬆️ ترقية للباقة Expert' : '⬆️ Upgrade to Expert',
    isUpgrade: true
  }
}

const Section = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: '#FFFFFF', border: '1px solid #E5DDD0', borderRadius: 20, padding: '20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', ...style }}>
    {children}
  </div>
)

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: '#1A1A1A' }}>{children}</div>
)

export default function ReportPage() {
  const router = useRouter()
  const [mounted, setMounted]           = useState(false)
  const [messages, setMessages]         = useState<Message[]>([])
  const [config, setConfig]             = useState<Config | null>(null)
  const [overallScore, setOverallScore] = useState<number>(0)
  const [isAr, setIsAr]                 = useState(false)
  const [showConvo, setShowConvo]       = useState(false)
  const [showQA, setShowQA]             = useState(false)

  // ✅ تعديل: قراءة من barbaros_report أولاً
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('barbaros_report')
      if (raw) {
        const report = JSON.parse(raw)
        const msgs: Message[] = report.messages || []
        const score: number   = report.finalScore || 0
        const cfg: Config     = {
          candidateName:   report.candidateName   || '',
          jobTitle:        report.jobTitle        || '',
          institution:     report.institution     || '',
          sector:          report.sector          || '',
          yearsExperience: report.yearsExperience || '',
          language:        report.language        || 'en',
          plan:            report.plan            || 'go',
        }
        setMessages(msgs)
        setOverallScore(isNaN(score) ? 0 : score)
        setConfig(cfg)
        setIsAr(cfg.language === 'ar')
      } else {
        const msgs: Message[] = JSON.parse(sessionStorage.getItem('barbaros_messages') || '[]')
        const score           = parseInt(sessionStorage.getItem('barbaros_score') || '0')
        const cfg: Config     = JSON.parse(sessionStorage.getItem('barbaros_config') || '{}')
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

  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F1EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: 'rgba(26,26,26,0.4)', fontFamily: 'system-ui' }}>
          {isAr ? 'جاري تحميل التقرير...' : 'Loading report...'}
        </div>
      </div>
    )
  }

  const scoredMessages  = messages.filter(m => m.score)
  const visibleMessages = messages.filter(m => !m.content.startsWith('['))

  const avg = (key: string) => {
    const vals = scoredMessages.map(m => Number((m.score as any)?.[key] ?? 0)).filter(v => !isNaN(v))
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  }

  const questionTypes = scoredMessages.reduce((acc, m) => {
    const qt = m.question_type || (m.score as any)?.question_type || 'General'
    acc[qt]  = (acc[qt] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const coachingNotes = scoredMessages
    .map(m => m.coaching_note || (m.score as any)?.coaching_note)
    .filter((n): n is string => Boolean(n))

  const verdict        = getHiringVerdict(overallScore, isAr)
  const hirePct        = getHireProbability(overallScore)
  const persona        = getInterviewPersona(scoredMessages, isAr)
  const hiddenWeakness = scoredMessages.length ? getHiddenWeakness(scoredMessages, isAr) : null
  const hiringRisk     = scoredMessages.length ? getHiringRisk(scoredMessages, overallScore, isAr) : null
  const { best, worst } = getBestAndWorst(scoredMessages)
  const pressureData   = scoredMessages.map((m, i) => ({ i: i + 1, s: m.score?.score ?? 0 }))
  const barbarosEval   = getBarbarosEvaluation(overallScore, isAr)
  const recommendation = getRecommendation(overallScore, config?.plan || 'go', isAr)

  // Q&A pairs: assistant question + next user answer
  const qaPairs: Array<{ question: string; answer: string; score: ScoreData; qType: string }> = []
  for (let i = 0; i < visibleMessages.length - 1; i++) {
    const msg = visibleMessages[i]
    const next = visibleMessages[i + 1]
    if (msg.role === 'assistant' && next?.role === 'user' && next.score) {
      qaPairs.push({
        question: msg.content,
        answer:   next.content,
        score:    next.score,
        qType:    next.question_type || (next.score as any)?.question_type || 'General',
      })
    }
  }

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      style={{ fontFamily: 'system-ui, sans-serif', background: '#F5F1EB', color: '#1A1A1A', minHeight: '100vh' }}
    >
      {/* Nav */}
      <nav style={{ background: '#F5F1EB', borderBottom: '0.5px solid #E5DDD0', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Barbaros size={20} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#CC785C' }}>
          {isAr ? 'تقرير المقابلة' : 'Interview Report'}
        </div>
        <button onClick={() => router.push('/')} style={{ background: '#FFFFFF', border: '0.5px solid #E5DDD0', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#1A1A1A', fontFamily: 'inherit' }}>
          {isAr ? 'الرئيسية' : 'Home'}
        </button>
      </nav>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 80px' }}>

        {/* ── 1. SCORE CIRCLE + BARBAROS EVAL ── */}
        <Section style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'rgba(26,26,26,0.5)', marginBottom: 2 }}>
            {config?.candidateName} · {config?.jobTitle}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)', marginBottom: 24 }}>
            {config?.institution}
          </div>
          <div style={{ width: 130, height: 130, borderRadius: '50%', margin: '0 auto 16px', background: `conic-gradient(${getScoreColor(overallScore)} ${overallScore * 3.6}deg, #E5DDD0 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: getScoreColor(overallScore), lineHeight: 1 }}>{overallScore}</div>
              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>/100</div>
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: getScoreColor(overallScore), marginBottom: 6 }}>
            {getScoreLabel(overallScore, isAr)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.45)', marginBottom: 16 }}>
            {scoredMessages.length > 0
              ? (isAr ? `بناءً على ${scoredMessages.length} إجابة` : `Based on ${scoredMessages.length} answer${scoredMessages.length !== 1 ? 's' : ''}`)
              : (isAr ? 'لم تُسجَّل إجابات كافية' : 'No answers recorded')}
          </div>

          {/* ✅ جديد: تقييم باربروس بجملتين */}
          <div style={{ margin: '16px 0', padding: '14px 16px', background: '#F5F1EB', border: '0.5px solid #E5DDD0', borderRadius: 12, textAlign: isAr ? 'right' : 'left' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#CC785C', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {isAr ? 'تقييم باربروس' : 'Barbaros Assessment'}
            </div>
            <div style={{ fontSize: 12, color: '#1A1A1A', lineHeight: 1.8, fontStyle: 'italic' }}>
              "{barbarosEval}"
            </div>
          </div>

          {scoredMessages.length > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(204,120,92,0.08)', border: '0.5px solid rgba(204,120,92,0.25)', borderRadius: 20, padding: '6px 16px' }}>
              <span style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', fontWeight: 600 }}>
                {isAr ? 'احتمال القبول' : 'Hire Probability'}
              </span>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#CC785C' }}>{hirePct}%</span>
            </div>
          )}
        </Section>

        {/* ── 2. HIRING VERDICT ── */}
        {scoredMessages.length > 0 && (
          <div style={{ background: verdict.bg, border: `1px solid ${verdict.border}`, borderRadius: 20, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: verdict.color, marginBottom: 10 }}>{verdict.label}</div>
            <div style={{ fontSize: 13, color: verdict.color, lineHeight: 1.7 }}>{verdict.verdict}</div>
          </div>
        )}

        {/* ── 3. INTERVIEW PERSONA ── */}
        {scoredMessages.length > 0 && (
          <Section>
            <SectionTitle>{isAr ? '🧠 شخصية المقابلة' : '🧠 Interview Persona'}</SectionTitle>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#CC785C', marginBottom: 8 }}>{persona.title}</div>
            <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.8, fontStyle: 'italic' }}>"{persona.description}"</div>
          </Section>
        )}

        {/* ── 4. HIDDEN WEAKNESS ── */}
        {hiddenWeakness && (
          <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', marginBottom: 10 }}>
              {isAr ? '⚠️ نقطة الضعف الخفية' : '⚠️ Hidden Weakness'}
            </div>
            <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.8 }}>{hiddenWeakness}</div>
          </div>
        )}

        {/* ── 5. HIRING RISK ── */}
        {hiringRisk && (
          <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 10 }}>
              {isAr ? '🔎 تقييم المحاور الحقيقي' : '🔎 Real Recruiter Assessment'}
            </div>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.8 }}>{hiringRisk}</div>
          </div>
        )}

        {/* ── 6. PRESSURE GRAPH ── */}
        {pressureData.length >= 2 && (
          <Section>
            <SectionTitle>{isAr ? '📉 الأداء تحت الضغط' : '📉 Performance Under Pressure'}</SectionTitle>
            <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.45)', marginBottom: 12 }}>
              {isAr ? 'كيف تغيّر أداؤك عبر المقابلة' : 'How your performance evolved through the interview'}
            </div>
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
              const avgF  = first.reduce((a, b) => a + b.s, 0) / first.length
              const avgL  = last.reduce((a, b) => a + b.s, 0) / last.length
              const diff  = Math.round(avgL - avgF)
              return (
                <div style={{ marginTop: 10, fontSize: 12, color: diff >= 0 ? '#065F46' : '#DC2626', fontWeight: 700 }}>
                  {diff >= 0
                    ? (isAr ? `✅ تحسّن أداؤك بمقدار ${diff} نقطة مع الوقت` : `✅ Performance improved by ${diff} points over time`)
                    : (isAr ? `⚠️ انخفض أداؤك بمقدار ${Math.abs(diff)} نقطة تحت الضغط` : `⚠️ Performance dropped ${Math.abs(diff)} points under pressure`)}
                </div>
              )
            })()}
          </Section>
        )}

        {/* ── 7. CRITERIA BREAKDOWN ✅ مع التعريف والسبب ── */}
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
                {/* تعريف المعيار */}
                <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.45)', marginBottom: 8, fontStyle: 'italic' }}>
                  {isAr ? descAr : descEn}
                </div>
                {/* شريط التقدم */}
                <div style={{ height: 6, background: '#F5F1EB', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${val}%`, background: getScoreColor(val), transition: 'width 0.5s' }} />
                </div>
                {/* سبب الدرجة */}
                <div style={{ fontSize: 12, color: '#1A1A1A', lineHeight: 1.7, padding: '8px 12px', background: val >= 75 ? 'rgba(16,185,129,0.05)' : val >= 50 ? 'rgba(245,158,11,0.05)' : 'rgba(239,68,68,0.05)', borderRadius: 8, borderLeft: isAr ? 'none' : `3px solid ${getScoreColor(val)}`, borderRight: isAr ? `3px solid ${getScoreColor(val)}` : 'none' }}>
                  {isAr ? reasonAr(val) : reasonEn(val)}
                </div>
              </div>
            )
          })}
        </Section>

        {/* ── 8. BEST & WORST ANSWER ── */}
        {best && worst && best !== worst && (
          <Section>
            <SectionTitle>{isAr ? '🏆 أفضل وأضعف إجابة' : '🏆 Best & Worst Answer'}</SectionTitle>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {isAr ? `✅ أقوى إجابة · ${best.score?.score}/100` : `✅ Strongest Answer · ${best.score?.score}/100`}
              </div>
              <div style={{ fontSize: 12, background: '#F0FDF4', border: '0.5px solid #6EE7B7', borderRadius: 10, padding: '10px 14px', color: '#065F46', lineHeight: 1.7 }}>
                {best.content.length > 200 ? best.content.slice(0, 200) + '...' : best.content}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {isAr ? `⚠️ أضعف إجابة · ${worst.score?.score}/100` : `⚠️ Weakest Answer · ${worst.score?.score}/100`}
              </div>
              <div style={{ fontSize: 12, background: '#FEF2F2', border: '0.5px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', color: '#7F1D1D', lineHeight: 1.7 }}>
                {worst.content.length > 200 ? worst.content.slice(0, 200) + '...' : worst.content}
              </div>
              {(worst.score as any)?.coaching_note && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#CC785C', fontWeight: 600, padding: '6px 10px', background: 'rgba(204,120,92,0.06)', borderRadius: 8, lineHeight: 1.6 }}>
                  💡 {(worst.score as any).coaching_note}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ── 9. QUESTION TYPES ── */}
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

        {/* ── 10. COACHING NOTES ── */}
        {coachingNotes.length > 0 && (
          <Section>
            <SectionTitle>{isAr ? '💡 ملاحظات المحاور' : '💡 Interviewer Notes'}</SectionTitle>
            {coachingNotes.map((note, i) => (
              <div key={i} style={{ padding: '10px 14px', background: '#F5F1EB', borderRadius: 10, fontSize: 12, lineHeight: 1.7, marginBottom: 8, borderLeft: isAr ? 'none' : '3px solid #CC785C', borderRight: isAr ? '3px solid #CC785C' : 'none' }}>
                {note}
              </div>
            ))}
          </Section>
        )}

        {/* ── 11. Q&A BREAKDOWN ✅ جديد ── */}
        {qaPairs.length > 0 && (
          <Section>
            <button
              onClick={() => setShowQA(prev => !prev)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              <span style={{ fontSize: 13, fontWeight: 800 }}>
                {isAr ? '📋 تفصيل الأسئلة والأجوبة' : '📋 Questions & Answers Breakdown'}
              </span>
              <span style={{ fontSize: 12, color: '#CC785C', fontWeight: 700 }}>
                {showQA ? (isAr ? 'إخفاء ▲' : 'Hide ▲') : (isAr ? 'عرض ▼' : 'Show ▼')}
              </span>
            </button>

            {showQA && (
              <div style={{ marginTop: 16 }}>
                {qaPairs.map((pair, i) => (
                  <div key={i} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: i < qaPairs.length - 1 ? '1px solid #F5F1EB' : 'none' }}>
                    {/* رقم السؤال + النوع */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#CC785C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#CC785C' }}>
                        {pair.qType.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: getScoreColor(pair.score.score), marginLeft: 'auto' }}>
                        {pair.score.score}/100
                      </span>
                    </div>

                    {/* سؤال باربروس */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(26,26,26,0.4)', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {isAr ? 'سؤال باربروس' : 'Barbaros Question'}
                      </div>
                      <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.7, padding: '10px 12px', background: '#F5F1EB', borderRadius: 10, fontWeight: 600 }}>
                        {pair.question}
                      </div>
                    </div>

                    {/* جواب المرشح */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(26,26,26,0.4)', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {isAr ? 'جوابك' : 'Your Answer'}
                      </div>
                      <div style={{ fontSize: 12, color: '#1A1A1A', lineHeight: 1.7, padding: '10px 12px', background: 'rgba(204,120,92,0.06)', border: '0.5px solid rgba(204,120,92,0.2)', borderRadius: 10 }}>
                        {pair.answer}
                      </div>
                    </div>

                    {/* ملاحظة باربروس */}
                    {pair.score.coaching_note && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          {isAr ? 'ملاحظة باربروس' : 'Barbaros Note'}
                        </div>
                        <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.7, padding: '10px 12px', background: 'rgba(239,68,68,0.04)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 10 }}>
                          ⚠️ {pair.score.coaching_note}
                        </div>
                      </div>
                    )}

                    {/* الجواب الأفضل */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#10B981', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {isAr ? 'كيف تجيب بشكل أفضل' : 'How To Answer Better'}
                      </div>
                      <div style={{ fontSize: 12, color: '#065F46', lineHeight: 1.7, padding: '10px 12px', background: 'rgba(16,185,129,0.05)', border: '0.5px solid rgba(16,185,129,0.2)', borderRadius: 10 }}>
                        💡 {getIdealAnswerHint(pair.score, isAr)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ── 12. FULL CONVERSATION ── */}
        {visibleMessages.length > 0 && (
          <Section>
            <button
              onClick={() => setShowConvo(prev => !prev)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              <span style={{ fontSize: 13, fontWeight: 800 }}>
                {isAr ? '💬 المحادثة الكاملة' : '💬 Full Conversation'}
              </span>
              <span style={{ fontSize: 12, color: '#CC785C', fontWeight: 700 }}>
                {showConvo ? (isAr ? 'إخفاء ▲' : 'Hide ▲') : (isAr ? 'عرض ▼' : 'Show ▼')}
              </span>
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

        {/* ── 13. RECOMMENDATION ✅ جديد ── */}
        <div style={{ background: recommendation.isUpgrade ? 'rgba(204,120,92,0.06)' : 'rgba(16,185,129,0.05)', border: `1px solid ${recommendation.isUpgrade ? 'rgba(204,120,92,0.3)' : 'rgba(16,185,129,0.3)'}`, borderRadius: 20, padding: '20px', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: recommendation.isUpgrade ? '#CC785C' : '#065F46', marginBottom: 12 }}>
            {recommendation.title}
          </div>
          <div style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.9, marginBottom: 16, whiteSpace: 'pre-line' }}>
            {recommendation.body}
          </div>
          <button
            onClick={() => router.push(recommendation.isUpgrade ? '/pricing' : '/onboarding')}
            style={{ background: recommendation.isUpgrade ? '#CC785C' : '#10B981', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}
          >
            {recommendation.cta}
          </button>
        </div>

        {/* ── CTA ── */}
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
