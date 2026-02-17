import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

async function getOrganisationIdFallback(): Promise<string | null> {
  if (SINGLE_ORG_ID) return SINGLE_ORG_ID;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

export async function GET() {
  try {
    const organisationId = await getOrganisationIdFallback();
    if (!organisationId) {
      return NextResponse.json({ success: false, error: "No organisation found." }, { status: 200 });
    }

    const { data, error } = await supabaseAdmin
      .from("growth_patterns")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ success: true, organisationId, items: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "List failed" }, { status: 200 });
  }
}
