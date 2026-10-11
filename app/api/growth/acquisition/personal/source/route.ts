import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uuid } from "@/lib/growthIngestion.server";
import { checkPersonalSource } from "@/lib/personalSourceHealth.server";

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams, requested = params.get("organisationId") || "", id = params.get("itemId") || "";
    if (!uuid.test(requested) || !uuid.test(id)) return NextResponse.json({ error: "Invalid source request." }, { status: 400 });
    const { organisationId } = await requireOrganisation(requested, false);
    const { data, error } = await supabaseAdmin.from("acquisition_items").select("*").eq("organisation_id", organisationId).eq("id", id).eq("source_engine", "root_health_personal").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Personal source not found." }, { status: 404 });
    return NextResponse.json(await checkPersonalSource(organisationId, data));
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Source unavailable — research again" }, { status: 503 }); }
}
