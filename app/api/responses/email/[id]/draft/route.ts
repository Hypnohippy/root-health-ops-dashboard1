import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uuid } from "@/lib/growthIngestion.server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id; const body = await req.json().catch(() => ({}));
    if (!uuid.test(id) || !uuid.test(body.organisationId || "") || typeof body.draft !== "string" || !body.draft.trim() || body.draft.length > 50000) return NextResponse.json({ error: "Invalid email draft." }, { status: 400 });
    const { organisationId } = await requireOrganisation(body.organisationId, true);
    const draft = body.draft.trim();
    const { data, error } = await supabaseAdmin.from("inbox_items").update({ email_reply_draft: draft, email_delivery_status: "draft", response_updated_at: new Date().toISOString() })
      .eq("id", id).eq("organisation_id", organisationId).eq("platform", "email").select("id, email_reply_draft, email_delivery_status").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Email response not found." }, { status: 404 });
    return NextResponse.json({ success: true, item: data });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Unable to save email draft." }, { status: 503 }); }
}
