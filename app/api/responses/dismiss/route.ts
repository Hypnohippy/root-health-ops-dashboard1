import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uuid } from "@/lib/growthIngestion.server";
import { dismissalReasons } from "@/lib/responseCleanup";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!uuid.test(String(body.organisationId || "")) || !uuid.test(String(body.idempotencyKey || "")) ||
      !Array.isArray(body.ids) || !body.ids.length || body.ids.length > 100 ||
      body.ids.some((id: unknown) => typeof id !== "string" || !uuid.test(id)) ||
      (body.reason != null && !dismissalReasons.includes(body.reason))) {
      return NextResponse.json({ error: "Invalid dismissal request." }, { status: 400 });
    }
    const { organisationId, userId } = await requireOrganisation(body.organisationId, true);
    const { data, error } = await supabaseAdmin.rpc("dismiss_social_responses", {
      p_organisation_id: organisationId, p_ids: [...new Set(body.ids)], p_actor_user_id: userId,
      p_reason: body.reason || null, p_idempotency_key: body.idempotencyKey,
    });
    if (error) return NextResponse.json({ error: "Unable to dismiss selected responses. Refresh and review the selection." }, { status: error.code === "P0002" ? 404 : 503 });
    return NextResponse.json({ success: true, dismissedIds: (data || []).map((row: { id: string }) => row.id) });
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Unable to dismiss responses." }, { status: 503 });
  }
}
