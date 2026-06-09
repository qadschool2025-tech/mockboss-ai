// app/api/generate-report/route.ts
// Thin HTTP wrapper. All report logic lives in lib/barbaros/report/generate-report-data.ts.

import { NextRequest, NextResponse } from 'next/server'
import {
  generateReportData,
  ReportGenerationError,
} from '@/lib/barbaros/report/generate-report-data'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const report = await generateReportData({
      messages: body.messages,
      config: body.config,
      coveredAreas: body.coveredAreas,
    })

    return new NextResponse(
      JSON.stringify({
        success: true,
        report,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    )
  } catch (err: unknown) {
    if (err instanceof ReportGenerationError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      )
    }

    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate-report] error:', message)

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
