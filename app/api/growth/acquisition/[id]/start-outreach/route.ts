import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonicalLinkedInProfile = (value: string) => { try { const url = new URL(value); return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "").toLowerCase()}`; } catch { return value.trim().toLowerCase().split(/[?#]/)[0].replace(/\/$/, ""); } };

export async function POST(req: Request, context?: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json().catch(() => ({}));
    const { organisationId, userId } = await requireOrganisation(body.organisationId, true);
    const itemId = context ? (await context.params).id : "";
    if (!uuid.test(itemId) || !uuid.test(body.organisationId || "")) return NextResponse.json({ error: "Item and organisation are required." }, { status: 400 });
    const { data: item, error } = await supabaseAdmin.from("acquisition_items").select("id,status,person,company,source_url,source_engine,source_record_id,metadata")
      .eq("id", itemId).eq("organisation_id", organisationId).maybeSingle();
    if (error) throw error;
    if (!item) return NextResponse.json({ error: "Acquisition item not found." }, { status: 404 });
    if (item.source_engine !== "linkedin_connection_network" || !item.source_url) return NextResponse.json({ error: "This item is not a LinkedIn network candidate." }, { status: 400 });
    if (!["accepted", "actioned", "nurture"].includes(item.status)) return NextResponse.json({ error: "Accept this candidate before starting outreach." }, { status: 409 });
    const identity = canonicalLinkedInProfile(item.source_url);
    const { data: existing, error: existingError } = await supabaseAdmin.from("growth_targets").select("id").eq("organisation_id", organisationId).eq("linkedin_identity", identity).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json({ success: true, targetId: existing.id, duplicate: true, destination: "/dashboard/growth/pipeline" });
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : {};
    const { data: target, error: insertError } = await supabaseAdmin.from("growth_targets").insert({
      organisation_id: organisationId, target_name: item.person || "LinkedIn contact", company: item.company,
      role_title: typeof metadata.headline === "string" ? metadata.headline : null, linkedin_url: item.source_url,
      linkedin_identity: identity, stage: "connection", status: "active", source_type: item.source_engine,
      source_record_id: item.source_record_id, acquisition_item_id: item.id, owner_user_id: userId,
      notes: typeof metadata.accepted_connection_name === "string" ? `Suggested via ${metadata.accepted_connection_name}` : null,
    }).select("id").single();
    if (insertError) throw insertError;
    return NextResponse.json({ success: true, targetId: target.id, duplicate: false, destination: "/dashboard/growth/pipeline" });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Unable to start LinkedIn outreach." }, { status: 503 }); }
}
