import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

function baseUrl(req: NextRequest) {
  try {
    return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
  } catch {
    return APP_URL ? APP_URL.replace(/\/$/, "") : "";
  }
}

async function getOrgIdFallback() {
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

export async function GET(req: NextRequest) {
  try {
    const orgId = await getOrgIdFallback();
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .select("*")
      .eq("organisation_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, organisationId: orgId, items: data || [] });
  } catch (e: any) {
    const back = new URL(`${baseUrl(req)}/dashboard/campaigns`);
    back.searchParams.set("error", "growth_experiments_list_failed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to list experiments." },
      { status: 500 }
    );
  }
}
