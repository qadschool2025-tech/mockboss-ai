import { isReadinessAffirmation } from '../lib/barbaros/state/readiness.ts'

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

// Affirmations that must be recognised as a readiness confirmation.
for (const phrase of [
  'نعم',
  'نعم مستعد',
  'نعم مستعدة',
  'مستعد',
  'مستعدة',
  'جاهز',
  'جاهزة',
  'أنا جاهز',
  'نبدأ',
  'ابدأ',
  'لنبدأ',
  'ready',
  'yes',
  'Yes, ready',
  "I'm ready",
  'yes, let us begin',
]) {
  check(`readiness recognised: "${phrase}"`, isReadinessAffirmation(phrase) === true)
}

// Substantive answers (and noise) must NOT be treated as readiness.
for (const phrase of [
  'أعمل معلمة رياضيات منذ سنتين',
  'نعم لدي خبرة في التدريس',
  'سلمى',
  'Rahma Al-kelane',
  'I worked as a teacher for two years',
  'yes I did manage a team',
  '',
  '   ',
]) {
  check(`not readiness: "${phrase}"`, isReadinessAffirmation(phrase) === false)
}

// Type safety: non-strings are never readiness.
check('non-string input is not readiness (null)', isReadinessAffirmation(null) === false)
check('non-string input is not readiness (number)', isReadinessAffirmation(42) === false)
check('non-string input is not readiness (undefined)', isReadinessAffirmation(undefined) === false)

console.log(`\n${passed} checks passed, ${failed} failed`)
console.log(failed > 0 ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED')
