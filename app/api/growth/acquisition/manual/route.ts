import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readIngestionBody, IngestionError, uuid } from "@/lib/growthIngestion.server";
import { manualRecord, manualReview, parseManualInput } from "@/lib/manualAcquisition";
import { researchManualOpportunity, researchDecisionMakers } from "@/lib/manualAcquisitionResearch.server";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const body = await readIngestionBody(req);
    if (!body || typeof body !== "object" || !uuid.test(body.organisationId || "")) throw new IngestionError("Select an organisation explicitly.");
    const tenant = await requireOrganisation(body.organisationId, true);
    if (body.action === "review") {
      const input=parseManualInput(body.input), requestedResearch=body.requestedResearch===true;
      const review=requestedResearch ? await researchManualOpportunity(tenant.organisationId,input) : manualReview(input,false);
      return NextResponse.json({ review }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "people") {
      const input=parseManualInput(body.input);
      const review=await researchDecisionMakers(tenant.organisationId,input,body.review);
      return NextResponse.json({ review }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "create") throw new IngestionError("Invalid manual opportunity action.");
    const record = manualRecord(tenant.organisationId, tenant.userId, body);
    const { data, error } = await supabaseAdmin.from("acquisition_items").upsert(record, { onConflict: "organisation_id,source_engine,source_record_id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    let id = data?.[0]?.id;
    if (!id) {
      const { data: existing, error: lookupError } = await supabaseAdmin.from("acquisition_items").select("id,record_type,metadata")
        .eq("organisation_id", tenant.organisationId).eq("source_engine", "manual_ops").eq("source_record_id", record.source_record_id).maybeSingle();
      if (lookupError || !existing) throw Error("Unable to verify retry.");
      if (existing.record_type !== record.record_type || JSON.stringify(existing.metadata?.user_provided) !== JSON.stringify(record.metadata.user_provided)) {
        const same = existing.record_type === record.record_type && Object.entries(record.metadata.user_provided as Record<string,string>).every(([key,value]) => existing.metadata?.user_provided?.[key] === value);
        if (!same) return NextResponse.json({ error: "This submission was already created with different details. Reload before adding a different opportunity." }, { status: 409 });
      }
      id = existing.id;
    }
    return NextResponse.json({ success: true, id, duplicate: !data?.length, destination: `/dashboard/growth/acquisition?${new URLSearchParams({ organisationId: tenant.organisationId, itemId: id })}` });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: error instanceof IngestionError ? error.message : "Unable to create opportunity. Retry the same submission; do not start another." }, { status: error instanceof IngestionError ? error.status : 503 }); }
}
