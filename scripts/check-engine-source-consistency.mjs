// Engine-level regression test for the source-consistency runtime gate.
// Runs the REAL runEngine against the production payload shape:
//   onboarding candidateName = "سلمى", parsedCv.candidateName = "Rahma Al-kelane".
// Flow: opening -> "نعم مستعد" (readiness) -> first real question
//       -> professional answer -> EXPECTED: name verification question.
//
// engine.ts uses extension-less relative imports and calls the Claude/TTS
// clients, so this script registers a tiny in-process loader that (a) resolves
// "./x" to "./x.ts" and (b) stubs the LLM/TTS modules. Node strips TS types
// natively, so it runs with a plain `node scripts/check-engine-source-consistency.mjs`.

import { register } from 'node:module'

const loaderSrc = `
import { statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

const STUB_CLAUDE = "export async function callClaude(o){const sp=o.systemPrompt||'';if(sp.startsWith('Classify the candidate conduct'))return '<conduct>professional</conduct>';return 'سؤال المقابلة الحقيقي رقم 1: حدثيني عن مهامك اليومية؟ <conduct>professional</conduct>'}"
const STUB_TTS = "export async function synthesizeSpeech(){return null}"

function isFile(p){ try { return statSync(p).isFile() } catch { return false } }

export async function resolve(spec, ctx, next){
  if (spec.includes('/llm/claude-client')) return { url:'stub:claude', shortCircuit:true }
  if (spec.includes('/llm/tts')) return { url:'stub:tts', shortCircuit:true }
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL && ctx.parentURL.startsWith('file:')){
    const base = dirname(fileURLToPath(ctx.parentURL))
    const abs = resolvePath(base, spec)
    for (const cand of [abs + '.ts', abs + '.tsx', abs + '/index.ts', abs]){
      if (isFile(cand)) return { url: pathToFileURL(cand).href, shortCircuit:true }
    }
  }
  return next(spec, ctx)
}

export async function load(url, ctx, next){
  if (url === 'stub:claude') return { format:'module', source: STUB_CLAUDE, shortCircuit:true }
  if (url === 'stub:tts') return { format:'module', source: STUB_TTS, shortCircuit:true }
  return next(url, ctx)
}
`

register('data:text/javascript;base64,' + Buffer.from(loaderSrc).toString('base64'), import.meta.url)

if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = 'test-stub'

const { runEngine } = await import('../lib/barbaros/engine.ts')
const { createInitialState } = await import('../lib/barbaros/state/session-state.ts')
const { createEmptyWeaknessTrackerState } = await import('../lib/barbaros/longitudinal/weakness-tracker.ts')
const { createEmptyGrowthTrackerState } = await import('../lib/barbaros/longitudinal/growth-tracker.ts')

let passed = 0
let failed = 0
const check = (label, cond) => {
  if (cond) { passed += 1; console.log(`pass: ${label}`) }
  else { failed += 1; console.error(`FAIL: ${label}`); process.exitCode = 1 }
}

const config = {
  candidateName: 'سلمى', jobTitle: 'سكرتيرة', institution: 'مركز طبي', sector: 'General',
  yearsExperience: '1-3 years', language: 'ar', plan: 'expert', jobRequirements: '',
  isCareerSwitch: false, cvSummary: '', difficulty: 'standard',
  cvText: 'Rahma Al-kelane\nالسيرة الذاتية\nخبرة 14 سنة',
  parsedCv: { candidateName: 'Rahma Al-kelane', totalYearsExperience: '14 years' },
}

let now = Date.now()
let state = createInitialState(config, now)
let weaknessState = createEmptyWeaknessTrackerState(now)
let growthState = createEmptyGrowthTrackerState(now)
const start = now - 60_000
let messages = []

async function turn(userText) {
  if (userText) {
    now += 4000
    messages = [...messages, { role: 'user', content: userText, timestamp: now, clientMessageId: 'u' + now }]
  }
  const out = await runEngine({
    config, messages, state, weaknessState, growthState,
    previousSnapshot: null, sessionStartTime: start, now,
  })
  state = { ...state, config, ...out.statePatch }
  weaknessState = out.weaknessPatch
  growthState = out.growthPatch
  if (out.excludeLastUserMessageFromAssessment === true) {
    const idx = [...messages].map((m, i) => ({ m, i })).reverse().find(x => x.m.role === 'user')?.i
    if (idx !== undefined) messages = messages.map((m, i) => i === idx ? { ...m, assessmentEligible: false } : m)
  }
  if (out.content) {
    messages = [...messages, { role: 'assistant', content: out.content, timestamp: now, clientMessageId: 'a' + now, assessmentEligible: out.excludeResponseFromAssessment !== true }]
  }
  return out
}

const isReadinessQuestion = s => /مستعد|هل أنت/.test(s)
const isNameVerification = s => s.includes('الاسم') && s.includes('السيرة')

const t1 = await turn(null)
check('T1 is the opening', t1.responseKind === 'opening')

const t2 = await turn('نعم مستعد')
check('T2 readiness does NOT re-ask readiness', t2.responseKind === 'interview' && !isReadinessQuestion(t2.content))
check('T2 readiness answer excluded from assessment', t2.excludeLastUserMessageFromAssessment === true)
check('T2 no verification fired on readiness turn', t2.statePatch.pendingSourceConsistency == null)

const t3 = await turn('أنظّم المواعيد وأدير المراسلات وأرتب الملفات.')
check('T3 first real answer returns NAME verification', t3.responseKind === 'interview' && isNameVerification(t3.content))
check('T3 sets pending = name_mismatch', t3.statePatch.pendingSourceConsistency?.issueId === 'source_consistency:name_mismatch')
check('T3 verification response excluded from assessment', t3.excludeResponseFromAssessment === true)
check('T3 first real answer kept for scoring', t3.excludeLastUserMessageFromAssessment === false)

console.log(`\n${passed} checks passed, ${failed} failed`)
console.log(failed > 0 ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED')
