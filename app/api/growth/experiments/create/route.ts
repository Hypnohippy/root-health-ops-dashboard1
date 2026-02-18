// app/api/growth/experiments/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

async function getLatestOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const organisationId =
      norm(body?.organisationId) || (await getLatestOrganisationId());

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const title = norm(body?.title);
    const platform = norm(body?.platform);

    if (!title || !platform) {
      return NextResponse.json(
        { success: false, error: "Missing title or platform." },
        { status: 400 }
      );
    }

    const row: any = {
      organisation_id: organisationId,
      title,
      hypothesis: norm(body?.hypothesis) || null,
      platform,
      pattern_type: norm(body?.pattern_type) || null,
      format: norm(body?.format) || null,
      status: norm(body?.status) || "planned",
      started_at: body?.started_at ? String(body.started_at) : null,
      completed_at: body?.completed_at ? String(body.completed_at) : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .insert(row)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, item: data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create experiment." },
      { status: 500 }
    );
  }
}
