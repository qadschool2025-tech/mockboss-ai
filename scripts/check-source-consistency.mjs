// Runnable check for Group A (Source Consistency). Plain JavaScript, no framework.
// Run:  node scripts/check-source-consistency.mjs
// Works on Node >= 22.18 (TS type-stripping; the detector has type-only imports).
import { detectSourceConsistencyIssues } from '../lib/barbaros/state/source-consistency.ts'

const NOW = 1_700_000_000_000
const run = (config, existing = []) =>
  detectSourceConsistencyIssues({ config, phase: 'opening', now: NOW }, existing)
const names = xs => xs.filter(i => i.issueType === 'name_mismatch')
const exps = xs => xs.filter(i => i.issueType === 'experience_mismatch')

let passed = 0
function ok(label, cond) {
  if (cond) { passed++; console.log('pass:', label) }
  else { console.error('FAIL:', label); process.exitCode = 1 }
}

// ── Name ──────────────────────────────────────────────────────────────────
ok('سارة vs رحمة أحمد → name_mismatch',
  names(run({ candidateName: 'سارة', yearsExperience: '1-3 years', parsedCv: { candidateName: 'رحمة أحمد' } })).length === 1)
ok('سارة vs سارة خليل → none',
  names(run({ candidateName: 'سارة', yearsExperience: '1-3 years', parsedCv: { candidateName: 'سارة خليل' } })).length === 0)
ok('سارة vs ساره → none',
  names(run({ candidateName: 'سارة', yearsExperience: '1-3 years', parsedCv: { candidateName: 'ساره' } })).length === 0)
ok('أحمد vs احمد → none',
  names(run({ candidateName: 'أحمد', yearsExperience: '1-3 years', parsedCv: { candidateName: 'احمد' } })).length === 0)
ok('placeholder Candidate → no name_mismatch',
  names(run({ candidateName: 'Candidate', yearsExperience: '1-3 years', parsedCv: { candidateName: 'رحمة أحمد' } })).length === 0)
ok('cvText first-line name → fallback name_mismatch',
  names(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: 'رحمة أحمد\nSenior Teacher' })).length === 1)
ok('cvText "Resume" heading → no name',
  names(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: 'Resume' })).length === 0)
ok('title-only cvText "Senior Teacher" → no name',
  names(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: 'Senior Teacher' })).length === 0)
ok('title-only cvText "ممرض" → no name',
  names(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: 'ممرض' })).length === 0)
ok('name from parsedCv → severity major / conf 90', (() => {
  const n = names(run({ candidateName: 'سارة', yearsExperience: '1-3 years', parsedCv: { candidateName: 'رحمة أحمد' } }))[0]
  return n && n.severity === 'major' && n.confidence === 90
})())
ok('name from cvText → severity moderate / conf 60', (() => {
  const n = names(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: 'رحمة أحمد' }))[0]
  return n && n.severity === 'moderate' && n.confidence === 60
})())

// ── Experience (range vs range, conflict only on no overlap) ─────────────────
ok('4 years vs 3 years → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: '4 years', parsedCv: { totalYearsExperience: '3 years' } })).length === 1)
ok('٤ سنوات vs ثلاث سنوات → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: '٤ سنوات', parsedCv: { totalYearsExperience: 'ثلاث سنوات' } })).length === 1)
ok('5 years vs ۳ سنوات (Persian digit) → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: '5 years', parsedCv: { totalYearsExperience: '۳ سنوات' } })).length === 1)
ok('4 years vs أربع سنوات → none',
  exps(run({ candidateName: 'سارة', yearsExperience: '4 years', parsedCv: { totalYearsExperience: 'أربع سنوات' } })).length === 0)
ok('longest-phrase خمسة عشر(15) vs 5 → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: 'خمسة عشر سنة', parsedCv: { totalYearsExperience: '5 years' } })).length === 1)

// fresh-graduate → {0,0}
ok('fresh-graduate vs 0 years → none',
  exps(run({ candidateName: 'سارة', yearsExperience: 'fresh-graduate', parsedCv: { totalYearsExperience: '0 years' } })).length === 0)
ok('fresh-graduate vs 1 year → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: 'fresh-graduate', parsedCv: { totalYearsExperience: '1 year' } })).length === 1)
ok('fresh-graduate vs 3 years → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: 'fresh-graduate', parsedCv: { totalYearsExperience: '3 years' } })).length === 1)

// less than 1 year → {0,0}
ok('less than 1 year vs 0 years → none',
  exps(run({ candidateName: 'سارة', yearsExperience: 'less than 1 year', parsedCv: { totalYearsExperience: '0 years' } })).length === 0)
ok('less than 1 year vs 1 year → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: 'less than 1 year', parsedCv: { totalYearsExperience: '1 year' } })).length === 1)

// range vs range
ok('3-5 vs 4-6 → none',
  exps(run({ candidateName: 'سارة', yearsExperience: '3-5 years', parsedCv: { totalYearsExperience: '4-6 years' } })).length === 0)
ok('3-5 vs 8-10 → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: '3-5 years', parsedCv: { totalYearsExperience: '8-10 years' } })).length === 1)
ok('10+ vs 12 → none',
  exps(run({ candidateName: 'سارة', yearsExperience: '10+ years', parsedCv: { totalYearsExperience: '12 years' } })).length === 0)

// cvText experience phrase fallback (must attach to a unit; not stray dates)
ok('cvText "خبرة 5 سنوات" vs onboarding 10+ → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: '10+ years', cvText: 'خبرة 5 سنوات في التدريس' })).length === 1)
ok('cvText "خبرة خمسة عشر عاماً" vs onboarding 1-3 → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: 'خبرة خمسة عشر عاماً' })).length === 1)
ok('cvText "3-5 years of experience" vs onboarding 1-3 → none (overlap at 3)',
  exps(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: '3-5 years of experience' })).length === 0)
ok('cvText "أكثر من 10 سنوات خبرة" vs onboarding 1-3 → experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: 'أكثر من 10 سنوات خبرة' })).length === 1)
ok('cvText with only a graduation year (تخرج 2015) → no fabricated experience issue',
  exps(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: 'تخرج 2015 من الجامعة' })).length === 0)
ok('exp from cvText → severity minor / conf 50', (() => {
  const e = exps(run({ candidateName: 'سارة', yearsExperience: '1-3 years', cvText: 'خبرة 8 سنوات في التدريس' }))[0]
  return e && e.severity === 'minor' && e.confidence === 50
})())
ok('exp from parsedCv → severity moderate / conf 70', (() => {
  const e = exps(run({ candidateName: 'سارة', yearsExperience: '4 years', parsedCv: { totalYearsExperience: '3 years' } }))[0]
  return e && e.severity === 'moderate' && e.confidence === 70
})())

// provenance guard: onboarding '3 years' is the untrusted interview fallback
ok('onboarding "3 years" fallback → no experience_mismatch',
  exps(run({ candidateName: 'سارة', yearsExperience: '3 years', parsedCv: { totalYearsExperience: '8 years' } })).length === 0)

// ── Persistence / dedup / addressed ──────────────────────────────────────────
ok('CV missing/ambiguous → no issues',
  run({ candidateName: 'سارة', yearsExperience: '1-3 years' }).length === 0)
{
  const c = { candidateName: 'سارة', yearsExperience: '4 years', parsedCv: { candidateName: 'رحمة أحمد', totalYearsExperience: '3 years' } }
  const first = run(c)
  const second = detectSourceConsistencyIssues({ config: c, phase: 'domain_expertise', now: NOW + 1000 }, first)
  ok('re-run does not duplicate', first.length === 2 && second.length === 2)
}
ok('addressed stays false on creation',
  run({ candidateName: 'سارة', yearsExperience: '4 years', parsedCv: { candidateName: 'رحمة أحمد', totalYearsExperience: '3 years' } }).every(i => i.addressed === false))
{
  const prior = [{ id: 'source_consistency:name_mismatch', issueType: 'name_mismatch', addressed: true }]
  const out = run({ candidateName: 'سارة', yearsExperience: '1-3 years', parsedCv: { candidateName: 'رحمة أحمد' } }, prior)
  const n = names(out)
  ok('prior addressed=true preserved (not re-created/reset)', n.length === 1 && n[0].addressed === true)
}

console.log(`\n${passed} checks passed`)
if (process.exitCode) console.error('SOME CHECKS FAILED')
else console.log('ALL CHECKS PASSED')
