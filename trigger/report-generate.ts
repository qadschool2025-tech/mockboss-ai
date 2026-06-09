// trigger/report-generate.ts
// Barbaros report worker: claims a pending job (atomic lock), generates the real
// report via generateReportData, and persists the result. Generation runs here
// (off Vercel) so it is not bound by the 60s function cap.

import { task } from "@trigger.dev/sdk";
import { getTriggerSupabaseAdmin } from "./supabase-admin";
import { generateReportData } from "../lib/barbaros/report/generate-report-data";

type ReportGeneratePayload = {
  reportJobId: string;
};

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

    // Atomic lock claim: succeeds ONLY if the job is still 'pending'.
    // Returns the generation inputs in the same query.
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
      .select("messages, config, covered_areas")
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
        })
        .eq("id", reportJobId);

      if (completeError) {
        throw new Error(
          `Failed to persist completed report: ${completeError.message}`
        );
      }

      return { reportJobId, locked: true, status: "completed" };
    } catch (err) {
      // Mark the job failed with a short, clear message, then rethrow so the
      // Trigger run shows as failed for monitoring.
      const message =
        err instanceof Error ? err.message : "Report generation failed";

      await supabase
        .from("report_jobs")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: message.slice(0, 500),
        })
        .eq("id", reportJobId);

      throw err;
    }
  },
});
