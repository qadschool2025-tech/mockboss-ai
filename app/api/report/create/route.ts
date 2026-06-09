
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CreateBody = {
  session_id?: unknown;
  messages?: unknown;
  config?: unknown;
  covered_areas?: unknown;
};

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { session_id, messages, config, covered_areas } = body;

  // Validate against the DB CHECK constraints before touching the database
  if (typeof session_id !== "string" || session_id.trim() === "") {
    return NextResponse.json(
      { error: "session_id is required (non-empty string)" },
      { status: 400 }
    );
  }
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return NextResponse.json({ error: "config must be an object" }, { status: 400 });
  }
  const coveredAreas = covered_areas === undefined ? [] : covered_areas;
  if (!Array.isArray(coveredAreas)) {
    return NextResponse.json(
      { error: "covered_areas must be an array" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // 1. Try to create a new pending job
  const { data: inserted, error: insertError } = await supabase
    .from("report_jobs")
    .insert({
      session_id,
      messages,
      config,
      covered_areas: coveredAreas,
      status: "pending",
    })
    .select("id, status")
    .single();

  if (!insertError && inserted) {
    return NextResponse.json(
      { reportJobId: inserted.id, status: inserted.status, created: true },
      { status: 201 }
    );
  }

  // 2. Duplicate session_id (unique violation) -> return the existing job
  if (insertError?.code === "23505") {
    const { data: existing, error: selectError } = await supabase
      .from("report_jobs")
      .select("id, status")
      .eq("session_id", session_id)
      .single();

    if (!selectError && existing) {
      return NextResponse.json(
        { reportJobId: existing.id, status: existing.status, created: false },
        { status: 200 }
      );
    }
  }

  // 3. Any other failure
  return NextResponse.json(
    { error: "Failed to create report job", detail: insertError?.message },
    { status: 500 }
  );
}
