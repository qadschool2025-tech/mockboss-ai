
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ReportJobStatus = "pending" | "processing" | "completed" | "failed";

type ReportJobRow = {
  id: string;
  session_id: string;
  status: ReportJobStatus;
  report_data: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reportJobId = searchParams.get("reportJobId");

  if (!reportJobId || reportJobId.trim() === "") {
    return NextResponse.json(
      {
        error: "reportJobId is required",
      },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("report_jobs")
    .select(
      [
        "id",
        "session_id",
        "status",
        "report_data",
        "error_message",
        "created_at",
        "started_at",
        "completed_at",
        "failed_at",
      ].join(", ")
    )
    .eq("id", reportJobId)
    .single<ReportJobRow>();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        {
          error: "Report job not found",
        },
        { status: 404 }
      );
    }

    console.error("[report:status] Supabase read failed:", error);

    return NextResponse.json(
      {
        error: "Failed to read report job status",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  if (data.status === "completed") {
    return NextResponse.json(
      {
        status: "completed",
        reportJobId: data.id,
        sessionId: data.session_id,
        report: data.report_data,
        error: null,
        timestamps: {
          createdAt: data.created_at,
          startedAt: data.started_at,
          completedAt: data.completed_at,
          failedAt: data.failed_at,
        },
      },
      { status: 200 }
    );
  }

  if (data.status === "failed") {
    return NextResponse.json(
      {
        status: "failed",
        reportJobId: data.id,
        sessionId: data.session_id,
        report: null,
        error: data.error_message || "Report generation failed",
        timestamps: {
          createdAt: data.created_at,
          startedAt: data.started_at,
          completedAt: data.completed_at,
          failedAt: data.failed_at,
        },
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      status: data.status,
      reportJobId: data.id,
      sessionId: data.session_id,
      report: null,
      error: null,
      timestamps: {
        createdAt: data.created_at,
        startedAt: data.started_at,
        completedAt: data.completed_at,
        failedAt: data.failed_at,
      },
    },
    { status: 200 }
  );
}
