// trigger/report-generate.ts
// Barbaros report worker: claims a pending job (atomic lock), generates the real
// report via generateReportData, and persists the result. Generation runs here
// (off Vercel) so it is not bound by the 60s function cap.
//
// RETRY CONTRACT (DB-driven, uses the existing retry_count / max_retries columns):
// A failed generation does NOT mark the job 'failed' immediately. While
// retry_count < max_retries, the job is reset to 'pending' (retry_count + 1,
// lock cleared) and the worker re-triggers itself for the same reportJobId.
// 'failed' is reached ONLY after the retry budget is exhausted, or if the
// retry re-scheduling itself fails (a job must never be left stuck).

import { task } from "@trigger.dev/sdk";
import { getTriggerSupabaseAdmin } from "./supabase-admin";
import { generateReportData } from "../lib/barbaros/report/generate-report-data";

type ReportGeneratePayload = {
  reportJobId: string;
};

const DEFAULT_MAX_RETRIES = 3;

export const reportGenerate = task({
  id: "report-generate",
  maxDuration: 900,
  run: async (payload: ReportGeneratePayload, { ctx }) => {
    const { reportJobId } = payload;
    if (!reportJobId) {
      throw new Error("reportJobId is required in payload");
    }

    const supabase = getTriggerSupabaseAdmin();
    const runId = ctx.run.id;
    const now = new Date().toISOString();

    // True ONLY when this run reset the job to 'pending' but failed to
    // schedule the retry run — the one case where we must mark a job we no
    // longer hold the lock on, so it never stays stuck in 'pending'.
    let retryResetSucceededButTriggerFailed = false;

    // Atomic lock claim: succeeds ONLY if the job is still 'pending'.
    // Returns the generation inputs AND the retry budget in the same query.
    const { data: locked, error: lockError } = await supabase
      .from("report_jobs")
      .update({
        status: "processing",
        locked_at: now,
        locked_by: runId,
        started_at: now,
      })
      .eq("id", reportJobId)
      .eq("status", "pending")
      .select("messages, config, covered_areas, retry_count, max_retries")
      .single();

    if (lockError) {
      // PGRST116 = no row matched -> not 'pending' (already claimed or missing).
      if (lockError.code === "PGRST116") {
        return {
          reportJobId,
          locked: false,
          reason: "Job not in 'pending' state (already claimed or not found)",
        };
      }
      throw new Error(`Lock failed: ${lockError.message}`);
    }

    try {
      // Generate the real report (same model, max_tokens, prompt, and shape).
      const report = await generateReportData({
        messages: locked.messages,
        config: locked.config,
        coveredAreas: locked.covered_areas,
      });

      const { error: completeError } = await supabase
        .from("report_jobs")
        .update({
          status: "completed",
          report_data: report,
          completed_at: new Date().toISOString(),
          error_message: null,
          locked_at: null,
          locked_by: null,
        })
        .eq("id", reportJobId);

      if (completeError) {
        throw new Error(
          `Failed to persist completed report: ${completeError.message}`
        );
      }

      return { reportJobId, locked: true, status: "completed" };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Report generation failed";

      const retryCount =
        typeof locked.retry_count === "number" ? locked.retry_count : 0;
      const maxRetries =
        typeof locked.max_retries === "number"
          ? locked.max_retries
          : DEFAULT_MAX_RETRIES;

      // ── Retry path: budget remaining → reset to 'pending' and re-trigger ──
      if (retryCount < maxRetries) {
        // Reset ONLY our own lock, and confirm a row was ACTUALLY updated:
        // PostgREST returns error = null even when zero rows match, so a
        // stale/non-owner run must never believe it rescheduled the job.
        const { data: resetJob, error: resetError } = await supabase
          .from("report_jobs")
          .update({
            status: "pending",
            retry_count: retryCount + 1,
            error_message: message.slice(0, 500),
            locked_at: null,
            locked_by: null,
            started_at: null,
          })
          .eq("id", reportJobId)
          .eq("locked_by", runId)
          .select("id")
          .single();

        if (!resetError && resetJob) {
          try {
            await reportGenerate.trigger({ reportJobId });

            console.error(
              `[report-generate] attempt ${retryCount + 1}/${maxRetries} scheduled for ${reportJobId}: ${message}`
            );

            return {
              reportJobId,
              locked: true,
              status: "retry_scheduled",
              attempt: retryCount + 1,
              maxRetries,
            };
          } catch (triggerErr) {
            console.error(
              "[report-generate] re-trigger failed, falling through to 'failed':",
              triggerErr instanceof Error ? triggerErr.message : triggerErr
            );
            // Fall through: a job reset to 'pending' with no scheduled run
            // would be stuck — mark it failed below instead.
            retryResetSucceededButTriggerFailed = true;
          }
        } else {
          console.error(
            "[report-generate] retry reset failed or no row updated, falling through to 'failed':",
            resetError?.message ?? "No matching locked job"
          );
        }
      }

      // ── Terminal path: budget exhausted (or retry scheduling failed) ──────
      // Scope the update so we never mark a job that belongs to another run:
      // - normally we may fail ONLY a job we still hold the lock on;
      // - if we reset it to 'pending' but the re-trigger failed, the lock is
      //   already cleared — target the 'pending' state instead so the job
      //   does not stay stuck (and if another run claimed it meanwhile,
      //   neither condition matches and we touch nothing).
      const terminalUpdate = {
        status: "failed",
        failed_at: new Date().toISOString(),
        error_message: message.slice(0, 500),
        locked_at: null,
        locked_by: null,
      };

      const terminalQuery = supabase
        .from("report_jobs")
        .update(terminalUpdate)
        .eq("id", reportJobId);

      const { error: terminalError } = retryResetSucceededButTriggerFailed
        ? await terminalQuery.eq("status", "pending")
        : await terminalQuery.eq("locked_by", runId);

      if (terminalError) {
        console.error(
          "[report-generate] terminal failed update failed:",
          terminalError.message
        );
      }

      throw err;
    }
  },
});
