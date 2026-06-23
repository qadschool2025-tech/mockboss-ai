import {
  decideSourceConsistencyGate,
  selectNextSourceConsistencyIssue,
  isValidClarification,
  assessmentExclusion,
  buildSourceConsistencyContextMessages,
  buildVerificationQuestion,
  shouldConductBlockVerification,
  MAX_SOURCE_CONSISTENCY_PROMPTS,
} from '../lib/barbaros/state/source-consistency-probe.ts'

const NOW = 1_700_000_000_000

const user = content => ({
  role: 'user',
  content,
  timestamp: NOW,
})

const assistant = content => ({
  role: 'assistant',
  content,
  timestamp: NOW,
})

const nameIssue = (overrides = {}) => ({
  id: 'source_consistency:name_mismatch',
  issueType: 'name_mismatch',
  cvEvidence: 'رحمة أحمد',
  candidateStatement: 'سارة',
  addressed: false,
  ...overrides,
})

const expIssue = (overrides = {}) => ({
  id: 'source_consistency:experience_mismatch',
  issueType: 'experience_mismatch',
  cvEvidence: '8',
  candidateStatement: '1-3 years',
  addressed: false,
  ...overrides,
})

const pendingFor = (id, attempts = 1) => ({
  issueId: id,
  askedAt: NOW,
  attempts,
})

const runGate = overrides =>
  decideSourceConsistencyGate({
    canAsk: true,
    promptCount: 0,
    now: NOW,
    ...overrides,
  })

const exclusion = decision =>
  assessmentExclusion(decision)

let passed = 0
let failed = 0

const check = (label, condition) => {
  if (condition) {
    passed += 1
    console.log(`pass: ${label}`)
    return
  }

  failed += 1
  console.error(`FAIL: ${label}`)
  process.exitCode = 1
}

const fresh = runGate({
  issues: [expIssue(), nameIssue()],
  pending: null,
  lastUserMsg: user('عملت في التدريس خمس سنوات'),
})

check('session-wide prompt cap is 2', MAX_SOURCE_CONSISTENCY_PROMPTS === 2)
check('fresh ask: action=ask', fresh.action === 'ask')
check('fresh ask: name first', fresh.action === 'ask' && fresh.issue.issueType === 'name_mismatch')
check('fresh ask: promptCount 0→1', fresh.action === 'ask' && fresh.promptCountAfter === 1)
check('fresh ask: addressed=false', fresh.issues.find(i => i.issueType === 'name_mismatch')?.addressed === false)
check('fresh ask: last user not excluded', exclusion(fresh).excludeLastUserMessageFromAssessment === false)
check('fresh ask: verification response excluded', exclusion(fresh).excludeResponseFromAssessment === true)
check('pending shape: issueId/askedAt/attempts only', fresh.action === 'ask' && Object.keys(fresh.pendingAfter).sort().join(',') === 'askedAt,attempts,issueId')

const reask = runGate({
  issues: [nameIssue()],
  pending: pendingFor(nameIssue().id, 1),
  lastUserMsg: user('تمام'),
  promptCount: 1,
})

check('invalid reply: same issue re-asked', reask.action === 'ask' && reask.issue.id === nameIssue().id)
check('invalid reply: promptCount 1→2', reask.action === 'ask' && reask.promptCountAfter === 2)
check('invalid reply: attempts 1→2', reask.action === 'ask' && reask.pendingAfter.attempts === 2)
check('invalid reply: user reply excluded', exclusion(reask).excludeLastUserMessageFromAssessment === true)

const exhausted = runGate({
  issues: [nameIssue(), expIssue()],
  pending: pendingFor(nameIssue().id, 2),
  lastUserMsg: user('أنا أحب القراءة'),
  promptCount: 2,
})
const exhaustedName = exhausted.issues.find(i => i.issueType === 'name_mismatch')

check('exhausted: action=continue', exhausted.action === 'continue')
check('exhausted: pending=null', exhausted.action === 'continue' && exhausted.pendingAfter === null)
check('exhausted: addressed=false', exhaustedName?.addressed === false)
check('exhausted: verificationExhausted=true', exhaustedName?.verificationExhausted === true)
check('exhausted: no clarification saved', exhaustedName && !('clarification' in exhaustedName))
check('exhausted: user reply excluded', exclusion(exhausted).excludeLastUserMessageFromAssessment === true)

const noSecond = runGate({
  issues: [nameIssue({ verificationExhausted: true }), expIssue()],
  pending: null,
  lastUserMsg: user('anything'),
  promptCount: 2,
})
check('no second issue after budget=2', noSecond.action === 'continue' && noSecond.pendingAfter === null)

const validName = runGate({
  issues: [nameIssue()],
  pending: pendingFor(nameIssue().id),
  lastUserMsg: user('اسمي سارة خليل'),
})
const validNameIssue = validName.issues.find(i => i.issueType === 'name_mismatch')
check('valid name: addressed=true', validNameIssue?.addressed === true)
check('valid name: clarification saved', validNameIssue?.clarification === 'اسمي سارة خليل')
check('valid name: clarifiedAt saved', validNameIssue?.clarifiedAt === NOW)

const chain = runGate({
  issues: [nameIssue(), expIssue()],
  pending: pendingFor(nameIssue().id),
  lastUserMsg: user('الاسم في السيرة صحيح'),
  promptCount: 1,
})
check('chain: action=ask', chain.action === 'ask')
check('chain: next issue experience', chain.action === 'ask' && chain.issue.issueType === 'experience_mismatch')
check('chain: promptCount increments to 2', chain.action === 'ask' && chain.promptCountAfter === 2)
check('chain: resolving reply excluded', exclusion(chain).excludeLastUserMessageFromAssessment === true)

const noChain = runGate({
  issues: [nameIssue(), expIssue()],
  pending: pendingFor(nameIssue().id),
  lastUserMsg: user('الاسم في السيرة صحيح'),
  promptCount: 2,
})
check('budget spent: valid name but no experience question', noChain.action === 'continue' && noChain.resolvedThisTurn === true)

for (const answer of ['٧ سنوات', '3-5 years', 'fresh graduate', 'الموجود في السيره هو الصحيح']) {
  const decision = runGate({
    issues: [expIssue()],
    pending: pendingFor(expIssue().id),
    lastUserMsg: user(answer),
  })
  check(`experience accepts: ${answer}`, decision.action === 'continue' && decision.resolvedThisTurn === true)
}

for (const answer of ['cv', 'أنا مهندس محترف']) {
  const decision = runGate({
    issues: [expIssue()],
    pending: pendingFor(expIssue().id),
    lastUserMsg: user(answer),
  })
  check(`experience rejects: ${answer}`, decision.action === 'ask')
}

for (const answer of ['أنا معلم', 'أنا أحب القراءة', '   ', 'تمام', 'لم أفهم السؤال']) {
  const decision = runGate({
    issues: [nameIssue()],
    pending: pendingFor(nameIssue().id),
    lastUserMsg: user(answer),
  })
  check(`name rejects: ${answer || 'empty'}`, decision.action === 'ask')
}

for (const answer of ['اسمي سارة خليل', 'الاسم في السيرة صحيح', 'سارة']) {
  const decision = runGate({
    issues: [nameIssue()],
    pending: pendingFor(nameIssue().id),
    lastUserMsg: user(answer),
  })
  check(`name accepts: ${answer}`, decision.action === 'continue' && decision.resolvedThisTurn === true)
}

const closingStart = runGate({
  issues: [nameIssue()],
  pending: null,
  lastUserMsg: user('answer'),
  canAsk: false,
})
check('closing: no new verification', closingStart.action === 'continue')

const closingPending = runGate({
  issues: [nameIssue()],
  pending: pendingFor(nameIssue().id),
  lastUserMsg: user('تمام'),
  canAsk: false,
})
check('closing: pending preserved on invalid reply', closingPending.action === 'continue' && closingPending.pendingAfter !== null)

const noIssues = runGate({
  issues: [],
  pending: null,
  lastUserMsg: user('أي شيء'),
})
check('no issues: normal continue', noIssues.action === 'continue')
check('no issues: no user exclusion', exclusion(noIssues).excludeLastUserMessageFromAssessment === false)
check('no issues: no response exclusion', exclusion(noIssues).excludeResponseFromAssessment === false)

for (const plan of ['go', 'pro', 'expert']) {
  const decision = runGate({
    issues: [nameIssue({ plan })],
    pending: null,
    lastUserMsg: user('مرحبا'),
  })
  check(`plan agnostic: ${plan}`, decision.action === 'ask' && decision.issue.id === nameIssue().id)
}

check('selector: name before experience', selectNextSourceConsistencyIssue([expIssue(), nameIssue()])?.issueType === 'name_mismatch')
check('selector: experience after name addressed', selectNextSourceConsistencyIssue([nameIssue({ addressed: true }), expIssue()])?.issueType === 'experience_mismatch')
check('selector: null when done/exhausted', selectNextSourceConsistencyIssue([nameIssue({ addressed: true }), expIssue({ verificationExhausted: true })]) === null)

check('validator: null msg false', isValidClarification(nameIssue(), null) === false)
check('validator: null issue false', isValidClarification(null, user('سارة')) === false)
check('validator: assistant role false', isValidClarification(nameIssue(), assistant('سارة')) === false)
check('validator: whitespace false', isValidClarification(nameIssue(), user('   ')) === false)

check('Arabic name question present', buildVerificationQuestion('name_mismatch', 'ar').includes('ما الاسم'))
check('Arabic experience question present', buildVerificationQuestion('experience_mismatch', 'ar').includes('سنوات خبرتك'))
check('English experience question present', buildVerificationQuestion('experience_mismatch', 'en').includes('actual years of experience'))


const contextBase = [
  assistant('ما أبرز إنجاز مهني حققته؟'),
  user('قدت مشروعاً خفّض زمن التسليم.'),
]
contextBase[0].timestamp = NOW - 200
contextBase[1].timestamp = NOW - 100

const contextMessages = buildSourceConsistencyContextMessages(
  contextBase,
  [nameIssue({
    addressed: true,
    clarification: 'اسمي سارة خليل',
    clarifiedAt: NOW,
  })],
  'ar'
)

check('context: preserves assessment history', contextMessages[0].content === contextBase[0].content && contextMessages[1].content === contextBase[1].content)
check('context: appends deterministic verification question', contextMessages.at(-2)?.role === 'assistant' && contextMessages.at(-2)?.content.includes('ما الاسم'))
check('context: appends resolved clarification as user context', contextMessages.at(-1)?.role === 'user' && contextMessages.at(-1)?.content === 'اسمي سارة خليل')
check('context: unresolved/exhausted issues are not injected', buildSourceConsistencyContextMessages(contextBase, [expIssue({ verificationExhausted: true })], 'ar').length === contextBase.length)

// Conduct preflight may only block a neutral verification question on serious
// conduct (explicit_abuse). A playful/off-topic signal must NOT suppress it.
check('preflight: explicit_abuse blocks verification', shouldConductBlockVerification('explicit_abuse') === true)
check('preflight: off_topic_or_playful does NOT block verification', shouldConductBlockVerification('off_topic_or_playful') === false)
check('preflight: professional does NOT block verification', shouldConductBlockVerification('professional') === false)
check('preflight: uncertain does NOT block verification', shouldConductBlockVerification('uncertain') === false)

const engineSource = await import('node:fs').then(({ readFileSync }) =>
  readFileSync(new URL('../lib/barbaros/engine.ts', import.meta.url), 'utf8')
)
const runEngineStart = engineSource.indexOf('export async function runEngine')
const runEngineEnd = engineSource.indexOf('async function buildConductDecisionOutput')
const runEngineSource = engineSource.slice(runEngineStart, runEngineEnd)
const preflightIndex = runEngineSource.indexOf('await classifySourceConsistencyConduct')
const gateIndex = runEngineSource.indexOf('decideSourceConsistencyGate({')
const verificationReturnIndex = runEngineSource.indexOf('return buildSourceConsistencyOutput({')
const behaviorIndex = runEngineSource.indexOf('await orchestrateBehavior(')
const promptMessagesIndex = runEngineSource.indexOf('messages: promptMessages')
const budgetGuardIndex = runEngineSource.indexOf(
  'sourceConsistencyPromptCount < MAX_SOURCE_CONSISTENCY_PROMPTS'
)

check('engine order: conduct preflight before source-consistency gate', preflightIndex >= 0 && gateIndex > preflightIndex)
check('engine order: verification return before behavior pipeline', verificationReturnIndex >= 0 && behaviorIndex > verificationReturnIndex)
check('engine context: main LLM uses promptMessages', promptMessagesIndex >= 0)
check('engine budget: no preflight starts after session cap', budgetGuardIndex >= 0)

// Group B wiring: preflight gate uses the shared helper (not a hardcoded
// off_topic check), and the readiness transition defers the gate one turn.
check('engine wiring: preflight uses shouldConductBlockVerification', runEngineSource.includes('shouldConductBlockVerification(conductPreflight.signal)'))
check('engine wiring: readiness transition defers source-consistency gate', runEngineSource.includes('!isReadinessTransition &&'))

console.log(`\n${passed} checks passed, ${failed} failed`)
console.log(failed > 0 ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED')
