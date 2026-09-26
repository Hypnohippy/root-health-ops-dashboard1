import { NextRequest, NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { connectionHealth } from "@/lib/connectionHealth";
import { assessConnectionCapabilities } from "@/lib/channelCapabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function emailEngineConfigured(organisationId: string) {
  try {
    const endpoints = JSON.parse(process.env.B2B_ENGINE_ENDPOINTS || "[]") as Array<Record<string, unknown>>;
    const ingestion = JSON.parse(process.env.GROWTH_INGESTION_KEYS || "[]") as Array<Record<string, unknown>>;
    const endpoint = Array.isArray(endpoints) && endpoints.some(row => row.organisation_id === organisationId && row.source_engine === "root_health_b2b" && typeof row.url === "string" && typeof row.secret === "string");
    const inbound = Array.isArray(ingestion) && ingestion.some(row => row.organisation_id === organisationId && Array.isArray(row.source_engines) && row.source_engines.includes("root_health_b2b") && typeof row.secret === "string");
    return endpoint && inbound;
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  try {
    const { organisationId } = await requireOrganisation(req.nextUrl.searchParams.get("organisationId"), false);
    const { data, error } = await supabaseAdmin.from("social_accounts")
      .select("platform,is_active,page_access_token,token_expires_at,page_name")
      .eq("organisation_id", organisationId).order("updated_at", { ascending: false });
    if (error) throw error;
    const emailConnected = emailEngineConfigured(organisationId);
    const connections = connectionHealth(data || []).map(connection => connection.platform === "email"
      ? { ...connection, state: emailConnected ? "connected" : "not_connected", name: emailConnected ? "B2B Gmail engine" : null }
      : connection).map(connection => ({ ...connection, ...assessConnectionCapabilities(connection.platform, connection.state) }));
    return NextResponse.json({
      success: true, organisationId, connections,
      // Stored health cannot detect remote revocations before a provider call fails.
      source: "stored_credentials",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ success: false, error: "Unable to load connection health." }, { status: 500 });
  }
}
