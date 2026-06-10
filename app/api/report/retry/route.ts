// app/api/report/retry/route.ts
// Barbaros report recovery: re-runs report generation for an existing
// reportJobId WITHOUT re-running the interview. The job's saved messages,
// config, and covered_areas are reused as-is.
//
// SECURITY: This endpoint re-runs Claude generation (it costs money), so it
// is NOT public. Every request must carry the header:
//   x-admin-recovery-secret: <ADMIN_RECOVERY_SECRET>
// compared in constant time against the ADMIN_RECOVERY_SECRET env var.
// If the env var is not configured, the endpoint refuses ALL requests —
// a missing secret must never mean an open endpoint. This guard is interim
// until auth + session ownership land; a UI recovery button can call this
// route later through a server-side proxy that injects the secret.

import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { tasks } from "@trigger.dev/sdk";

export const runtime = "nodejs";

type RetryBody = {
  reportJobId?: unknown;
};

// Constant-time comparison via SHA-256 digests so neither length nor content
// of the secret leaks through timing.
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Triggers the worker by string id (no import of the task module, so the task
// code and its `ws` dependency never enter this bundle). A failed trigger is
// logged and reported, never thrown — the job state is already persisted.
async function triggerWorker(reportJobId: string): Promise<boolean> {
  try {
    await tasks.trigger("report-generate", { reportJobId });
    return true;
  } catch (err) {
    console.error("[report:retry] trigger report-generate failed:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  // ── Admin gate ──────────────────────────────────────────────────────────
  const expectedSecret = process.env.ADMIN_RECOVERY_SECRET;

  if (!expectedSecret || expectedSecret.trim() === "") {
    // Misconfiguration must fail CLOSED, never open.
    console.error("[report:retry] ADMIN_RECOVERY_SECRET is not configured");
    return NextResponse.json(
      { error: "Recovery endpoint is not configured" },
      { status: 503 }
    );
  }

  const providedSecret = req.headers.get("x-admin-recovery-secret");

  if (!providedSecret || !secretMatches(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Input ───────────────────────────────────────────────────────────────
  let body: RetryBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { reportJobId } = body;

  if (typeof reportJobId !== "string" || reportJobId.trim() === "") {
    return NextResponse.json(
      { error: "reportJobId is required (non-empty string)" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // ── Atomic recovery reset: 'failed' -> 'pending' ────────────────────────
  // The status condition makes this atomic: only a job that is CURRENTLY
  // 'failed' can be reset, and .select().single() confirms a row actually
  // changed (PostgREST returns no error when zero rows match).
  // retry_count resets to 0: manual recovery grants a fresh retry budget.
  const { data: reset, error: resetError } = await supabase
    .from("report_jobs")
    .update({
      status: "pending",
      retry_count: 0,
      error_message: null,
      failed_at: null,
      locked_at: null,
      locked_by: null,
      started_at: null,
      completed_at: null,
    })
    .eq("id", reportJobId)
    .eq("status", "failed")
    .select("id")
    .single();

  if (!resetError && reset) {
    const triggered = await triggerWorker(reportJobId);
    return NextResponse.json(
      { reportJobId, status: "pending", recovered: true, triggered },
      { status: 200 }
    );
  }

  // ── Not reset: report why ───────────────────────────────────────────────
  const { data: existing, error: selectError } = await supabase
    .from("report_jobs")
    .select("id, status")
    .eq("id", reportJobId)
    .single();

  if (selectError || !existing) {
    return NextResponse.json(
      { error: "Report job not found", reportJobId },
      { status: 404 }
    );
  }

  // Job exists but is not 'failed' (pending / processing / completed):
  // recovery does not apply. Completed reports are NEVER regenerated here.
  return NextResponse.json(
    {
      error: `Job is '${existing.status}', not 'failed' — recovery applies to failed jobs only`,
      reportJobId,
      status: existing.status,
      recovered: false,
    },
    { status: 409 }
  );
}
