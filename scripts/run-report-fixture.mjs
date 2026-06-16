// scripts/run-report-fixture.mjs
//
// Runs a report fixture against a running MockBoss deployment.
// It posts the fixture to /api/report/create, then polls /api/report/status
// until the job completes or fails, and prints the result.
//
// Usage:
//   BASE_URL="https://your-deployment.example" \
//     node scripts/run-report-fixture.mjs tests/fixtures/go-baseline.json
//
// Notes:
//   - No secrets or keys live in this file. BASE_URL comes from the environment.
//   - No third-party dependencies: uses only the Node.js built-in fetch and fs.

import { readFile } from 'node:fs/promises'

const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 90 // ~3 minutes at 2s intervals

function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const fixturePath = process.argv[2]
  if (!fixturePath) {
    fail(
      'Missing fixture path.\n' +
        'Usage: BASE_URL="https://..." node scripts/run-report-fixture.mjs <fixture.json>'
    )
  }

  const baseUrl = process.env.BASE_URL
  if (!baseUrl) {
    fail('BASE_URL environment variable is required (e.g. https://your-deployment.example).')
  }
  const base = baseUrl.replace(/\/+$/, '')

  let fixture
  try {
    const raw = await readFile(fixturePath, 'utf8')
    fixture = JSON.parse(raw)
  } catch (err) {
    fail(`Could not read or parse fixture "${fixturePath}": ${err.message}`)
  }

  const sessionId = `${fixture.session_id ?? 'fixture'}-${Date.now()}`

  console.log(`Fixture:   ${fixturePath}`)
  console.log(`Base URL:  ${base}`)
  console.log(`Session:   ${sessionId}`)
  console.log(`Plan:      ${fixture?.config?.plan ?? '(none)'}`)
  console.log('Creating report job...')

  let createData
  try {
    const res = await fetch(`${base}/api/report/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        messages: fixture.messages,
        config: fixture.config,
        covered_areas: fixture.covered_areas ?? [],
      }),
    })
    createData = await res.json().catch(() => ({}))
    if (!res.ok || !createData.reportJobId) {
      fail(
        `create failed (HTTP ${res.status}): ${
          createData.error || JSON.stringify(createData)
        }`
      )
    }
  } catch (err) {
    fail(`create request failed: ${err.message}`)
  }

  const reportJobId = createData.reportJobId
  console.log(`reportJobId: ${reportJobId}`)
  console.log(`created:     ${createData.created === true}`)
  console.log(`triggered:   ${createData.triggered === true}`)
  console.log('Polling status...')

  let last = null
  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    let statusData
    try {
      const res = await fetch(
        `${base}/api/report/status?reportJobId=${encodeURIComponent(reportJobId)}`
      )
      statusData = await res.json().catch(() => ({}))
      if (!res.ok) {
        fail(
          `status failed (HTTP ${res.status}): ${
            statusData.error || JSON.stringify(statusData)
          }`
        )
      }
    } catch (err) {
      fail(`status request failed: ${err.message}`)
    }

    if (statusData.status !== last) {
      console.log(`  [${attempt}] status: ${statusData.status}`)
      last = statusData.status
    }

    if (statusData.status === 'completed') {
      console.log('\n=== COMPLETED ===')
      const report = statusData.report ?? statusData.report_data ?? statusData
      console.log(JSON.stringify(report, null, 2))
      process.exit(0)
    }

    if (statusData.status === 'failed') {
      console.error('\n=== FAILED ===')
      console.error(statusData.error || 'Report generation failed')
      process.exit(2)
    }

    await sleep(POLL_INTERVAL_MS)
  }

  fail(`Timed out after ${MAX_POLLS} polls without a final status.`)
}

main().catch(err => fail(err?.message || String(err)))
