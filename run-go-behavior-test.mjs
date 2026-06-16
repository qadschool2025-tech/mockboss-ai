import { writeFile } from 'node:fs/promises'

const BASE_URL = 'https://mockboss-ai.vercel.app'
const sessionId = `go-behavior-${Date.now()}`

const config = {
  candidateName: 'سارة',
  jobTitle: 'مشرفة خدمة عملاء',
  institution: 'شركة الإمارات للتجزئة',
  sector: 'retail',
  yearsExperience: '4 years',
  experienceLevel: 'mid',
  language: 'ar',
  plan: 'go',
  isCareerSwitch: false,
  cvText: `
رحمة احمد
خبرة ثلاث سنوات في خدمة العملاء.
عملت من 2021 إلى 2024 منسقة خدمة عملاء في شركة الندى.
بدأت العمل مشرفة خدمة عملاء في يناير 2025.
أدرت فريقاً من ستة موظفين.
استخدمت Zendesk يومياً لمتابعة التذاكر والتصعيدات.
خفضت متوسط زمن الرد من 12 دقيقة إلى 7 دقائق خلال أربعة أشهر.
أعددت تقارير أسبوعية عن SLA ورضا العملاء.
  `.trim(),
  jobRequirements: `
قيادة فريق خدمة العملاء.
خبرة عملية في Zendesk أو أنظمة CRM.
إدارة الشكاوى والتصعيدات.
تحليل SLA وCSAT وزمن الاستجابة.
إعداد تقارير أداء أسبوعية.
تدريب الموظفين وتحسين جودة الخدمة.
  `.trim(),
}

let messages = []
let sessionToken = null
let answerNumber = 0
let contradictionIntroduced = false
let ended = false

const transcript = []
const metadata = []

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function addMessage(role, content, extra = {}) {
  messages.push({
    role,
    content,
    timestamp: Date.now(),
    assessmentEligible: true,
    ...extra,
  })
}

function answerFor(question) {
  answerNumber += 1
  const q = String(question || '').toLowerCase()

  if (/مستعد|جاهز|نبدأ|البدء/.test(q)) {
    return 'نعم، أنا مستعدة. يمكننا البدء.'
  }

  if (/هل لديك.*سؤال|أي سؤال.*الشركة|أسئلة.*الدور|تودين.*السؤال/.test(q)) {
    return 'نعم. ما أهم ثلاثة مؤشرات أداء تستخدمونها لتقييم مشرف خدمة العملاء خلال أول ثلاثة أشهر؟'
  }

  if (/تناقض|ذكرتِ|قلتِ|وضحي|توضيح|غير دقيق|كيف تجمعين/.test(q)) {
    return 'للتوضيح، عبارتي الأولى لم تكن دقيقة. كنت أراجع تقارير Zendesk وأتابع التصعيدات من خلال الفريق، لكنني لم أكن أنفذ كل معالجة داخل النظام بنفسي. أريد أن أفرّق بين الإشراف على العمل والاستخدام التشغيلي المباشر.'
  }

  if (/لماذا|دافع|جذبك|تقدمتِ|هذا الدور/.test(q)) {
    return 'تقدمت لهذا الدور لأنني انتقلت خلال السنوات الأخيرة من معالجة شكاوى العملاء إلى قيادة الفريق ومراجعة الأداء. أريد دوراً يمنحني مسؤولية واضحة عن جودة الخدمة وتطوير الموظفين، ومتطلبات الوظيفة تتقاطع مع خبرتي في التصعيدات ومؤشرات الاستجابة.'
  }

  if (/فريق|قياد|إدار.*موظف|مشرف/.test(q)) {
    return 'كنت أدير فريقاً من ستة موظفين. لاحظت تفاوتاً في طريقة توثيق الشكاوى، فوضعت نموذجاً موحداً وراجعت عينات أسبوعية مع كل موظف. بعد أربعة أسابيع أصبحت التصعيدات أوضح وانخفضت إعادة فتح التذاكر.'
  }

  if (/زمن الرد|مؤشر|رقم|قياس|sla|csat|نتيجة/.test(q)) {
    return 'تابعت متوسط زمن الرد أسبوعياً، وكان 12 دقيقة. أعدت توزيع المناوبات وخصصت موظفاً للتذاكر العاجلة، فانخفض المتوسط إلى 7 دقائق خلال أربعة أشهر. كنت أراجع أيضاً أسباب تجاوز SLA وليس الرقم النهائي فقط.'
  }

  if (/شكوى|عميل غاضب|تصعيد|أزمة|موقف صعب/.test(q)) {
    return 'واجهنا عميلاً تكرر تأخر طلبه مرتين. استمعت إليه أولاً، ثم راجعت سجل الطلب والتواصل السابق، وحددت أن المشكلة بين المستودع وشركة التوصيل. رتبت بديلاً سريعاً، وتابعت العميل بعد الاستلام، ثم وثقت السبب حتى لا يتكرر.'
  }

  if (/نظام|zendesk|crm|تذكرة|أداة/.test(q)) {
    if (!contradictionIntroduced) {
      contradictionIntroduced = true
      return 'استخدمت Zendesk يومياً لمراجعة التذاكر والتصعيدات وإعداد تقارير الفريق. لكن أحتاج أن أذكر أنني لم أكن أنفذ كل التحديثات بنفسي؛ كان الموظفون يدخلون معظم البيانات وأنا أراجعها.'
    }

    return 'في الواقع لم أستخدم Zendesk استخداماً تشغيلياً مباشراً بالشكل الذي قد توحي به سيرتي؛ كنت أعتمد غالباً على التقارير التي يخرجها الفريق وعلى Excel. لذلك خبرتي الإشرافية أقوى من خبرتي التقنية داخل النظام.'
  }

  if (/ضعف|تطوير|تحدي|صعب عليك|تحسين/.test(q)) {
    return 'أحتاج إلى تطوير قدرتي على إعطاء ملاحظات حازمة بسرعة. أحياناً أؤجل المحادثة الصعبة حتى أجمع أدلة كثيرة، وهذا قد يبطئ التصحيح. بدأت أعتمد مراجعة أسبوعية قصيرة مبنية على مثال واحد واضح وخطوة تحسين محددة.'
  }

  let answer =
    'في دوري السابق كنت أبدأ بتحديد المشكلة من سجل العميل، ثم أراجع المسؤوليات والوقت المطلوب وأحدد الإجراء التالي بوضوح. كنت أوثق القرار وأتابع النتيجة مع الفريق بدلاً من الاكتفاء بحل مؤقت.'

  if (answerNumber === 6 && !contradictionIntroduced) {
    contradictionIntroduced = true
    answer +=
      ' وللتوضيح، رغم أن سيرتي تقول إنني استخدمت Zendesk يومياً، لم أكن أستخدمه مباشرة؛ كنت أعمل غالباً عبر Excel وتقارير يعدها الفريق.'
  }

  return answer
}

async function callInterview() {
  const response = await fetch(`${BASE_URL}/api/interview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      config,
      messages,
      sessionToken,
    }),
  })

  const data = await response.json()

  if (!response.ok || data.success !== true) {
    throw new Error(
      `API failed: HTTP ${response.status} — ${JSON.stringify(data)}`
    )
  }

  sessionToken =
    typeof data.sessionToken === 'string' ? data.sessionToken : null

  return data
}

console.log('=== BARBAROS GO TEXT BEHAVIOR TEST ===')
console.log('sessionId:', sessionId)

for (let turn = 1; turn <= 14; turn += 1) {
  const data = await callInterview()
  const question = String(data.content ?? '').trim()

  metadata.push({
    turn,
    score: data.score ?? null,
    isEndOfSession: data.isEndOfSession === true,
    responseKind: data.responseKind ?? null,
    coveredAreas: data.coveredAreas ?? [],
    activeRoleId: data.activeRoleId ?? null,
    activeRoleTitle: data.activeRoleTitle ?? null,
    remainingSeconds: data.remainingSeconds ?? null,
  })

  if (question) {
    addMessage('assistant', question, { isQuestion: true })
    transcript.push({ role: 'assistant', content: question })
    console.log(`\nBARBAROS ${turn}: ${question}`)
  }

  if (data.isEndOfSession === true) {
    ended = true
    break
  }

  const answer = answerFor(question)
  addMessage('user', answer)
  transcript.push({ role: 'user', content: answer })
  console.log(`CANDIDATE ${turn}: ${answer}`)

  await sleep(700)
}

const assistantQuestions = transcript
  .filter((item) => item.role === 'assistant')
  .map((item) => item.content)

const assistantText = assistantQuestions.join('\n')

const checks = {
  endedNaturally: ended,
  askedCandidateQuestionAtEnd:
    /هل لديك.*سؤال|أي سؤال.*الشركة|أسئلة.*الدور|تودين.*السؤال/.test(
      assistantText
    ),
  referencedCvOrRole:
    /zendesk|زمن الرد|12|7|فريق|ستة|مشرفة|خدمة العملاء/i.test(
      assistantText
    ),
  detectedOrVerifiedContradiction:
    /تناقض|ذكرتِ|قلتِ|لكن.*zendesk|توضيح|غير دقيق|كيف تجمعين/i.test(
      assistantText
    ),
  usedPanelRoleInGo: metadata.some(
    (item) => item.activeRoleId || item.activeRoleTitle
  ),
  turns: metadata.length,
}

const result = {
  sessionId,
  config,
  checks,
  metadata,
  transcript,
}

const outputPath = `/tmp/${sessionId}.json`
await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8')

console.log('\n=== LAST 4 BARBAROS QUESTIONS ===')
for (const q of assistantQuestions.slice(-4)) {
  console.log('-', q)
}

console.log('\n=== AUTOMATIC CHECKS ===')
console.log(JSON.stringify(checks, null, 2))
console.log('\nSaved full result to:', outputPath)
