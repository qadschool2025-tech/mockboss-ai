
import { task } from '@trigger.dev/sdk'
import { getTriggerSupabaseAdmin } from './supabase-admin'
type ReportGeneratePayload = {
  reportJobId: string
}

export const reportGenerate = task({
  id: 'report-generate',
  maxDuration: 60,
  run: async (payload: ReportGeneratePayload, { ctx }) => {
    const { reportJobId } = payload

    if (!reportJobId) {
      throw new Error('reportJobId is required in payload')
    }

  const supabase = getTriggerSupabaseAdmin()
    const runId = ctx.run.id
    const now = new Date().toISOString()

    const { data: locked, error: lockError } = await supabase
      .from('report_jobs')
      .update({
        status: 'processing',
        locked_at: now,
        locked_by: runId,
        started_at: now,
      })
      .eq('id', reportJobId)
      .eq('status', 'pending')
      .select('id, status, locked_by, locked_at, started_at')
      .single()

    if (lockError) {
      if (lockError.code === 'PGRST116') {
        return {
          reportJobId,
          locked: false,
          reason: "Job not in 'pending' state, already claimed or not found",
        }
      }

      throw new Error(`Lock failed: ${lockError.message}`)
    }

    return {
      reportJobId: locked.id,
      locked: true,
      status: locked.status,
      lockedBy: locked.locked_by,
      lockedAt: locked.locked_at,
      startedAt: locked.started_at,
    }
  },
})
