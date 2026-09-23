import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized, publishingHeaders } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await supabaseAdmin.from("social_accounts").select("organisation_id").eq("platform", "facebook").eq("is_active", true);
    if (error) throw error;
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const results = [];
    for (const organisationId of new Set((data || []).map(row => row.organisation_id))) {
      const url = new URL("/api/social/responses/sync-meta", origin);
      url.searchParams.set("organisationId", organisationId);
      const response = await fetch(url, { method: "POST", headers: publishingHeaders(req), cache: "no-store" });
      results.push({ organisationId, ok: response.ok });
    }
    return NextResponse.json({ ok: results.every(r => r.ok), results });
  } catch {
    return NextResponse.json({ error: "Social sync failed" }, { status: 500 });
  }
}
