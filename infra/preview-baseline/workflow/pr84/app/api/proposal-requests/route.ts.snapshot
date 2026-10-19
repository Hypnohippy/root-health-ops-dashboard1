import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withTenantRoute } from "@/lib/tenantRoute.server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Public intake has one explicit server-configured owner. Never accept an
    // organisation supplied by an anonymous caller, or infer one from email.
    const organisationId = process.env.PROPOSAL_REQUEST_ORGANISATION_ID?.trim();
    if (!organisationId) return NextResponse.json({ success: false, error: "Request intake ownership is not configured." }, { status: 503, headers: corsHeaders });

    const { error } = await supabaseAdmin.from("proposal_requests").insert({
      organisation_id: organisationId,
      submission_payload: body,
      initiative: body.initiative || "Recovery Reset Month",
      workshop_title: body.workshop_title || "Recovery & Resilience Workshop",
      audience: body.audience || "",
      duration: body.duration || "",
      delivery_preference: body.delivery_preference || "",
      delivery_format: body.delivery_format || "",
      location: body.location || "",
      estimated_investment: body.estimated_investment || "",
    notify_email: body.notify_email || "david@fuelgeist.co.uk",
contact_name: body.contact_name || "",
contact_email: body.contact_email || "",
contact_phone: body.contact_phone || "",
wants_discussion: !!body.wants_discussion,
notes: body.notes || "",
status: "pending",
      source: body.source || "root-health-v2",
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create request" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export const GET = withTenantRoute(async (_req: Request, tenant) => {
  const { data, error } = await supabaseAdmin.from("proposal_requests").select("*").eq("organisation_id", tenant.organisationId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Unable to load owned requests. Check the Phase 1 migration." }, { status: 503 });
  return NextResponse.json({ requests: data || [], organisationId: tenant.organisationId });
}, { write: false });

export const PATCH = withTenantRoute(async (req: Request, tenant) => {
  const body = await req.json();
  if (!["pending", "in_progress", "proposal_sent", "accepted"].includes(body.status)) return NextResponse.json({ error: "Invalid request status." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("proposal_requests").update({ status: body.status }).eq("id", body.id).eq("organisation_id", tenant.organisationId).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Request not found or unavailable." }, { status: 404 });
  return NextResponse.json({ success: true });
}, { write: true });

export const DELETE = withTenantRoute(async (req: Request, tenant) => {
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from("proposal_requests").delete().eq("id", body.id).eq("organisation_id", tenant.organisationId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Cannot delete a request linked to a Solution Brief." }, { status: 409 });
  if (!data) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}, { write: true });
