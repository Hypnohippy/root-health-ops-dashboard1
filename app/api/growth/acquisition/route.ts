import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { statuses, uuid } from "@/lib/growthIngestion.server";
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const requested = params.get("organisationId") || "";
    if (!uuid.test(requested)) return NextResponse.json({ error: "Select an organisation explicitly." }, { status: 400 });
    const { organisationId } = await requireOrganisation(requested, false);
    const page = Number(params.get("page") || 0);
    const status = params.get("status");
    if (!Number.isInteger(page) || page < 0 || page > 10000 || (status && !statuses.includes(status as typeof statuses[number]))) return NextResponse.json({ error: "Invalid filter." }, { status: 400 });
    let query = supabaseAdmin.from("acquisition_items").select("*, acquisition_item_events(id, action, previous_status, new_status, outcome, note, created_at, actor_user_id)", { count: "exact" }).eq("organisation_id", organisationId);
    if (status) query = query.eq("status", status);
    const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(page * 25, page * 25 + 24);
    if (error) throw error;
    return NextResponse.json({ items: data, total: count, page });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Unable to load acquisition queue." }, { status: 503 }); }
}
