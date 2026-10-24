import { readRelationshipIntake } from "@/lib/relationshipIntake.server";
import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { previewSourceCreation } from "@/lib/reviewedIdentity.server";
import { readIngestionBody, IngestionError, uuid } from "@/lib/growthIngestion.server";
import { manualRecord, manualReview, parseManualInput } from "@/lib/manualAcquisition";
import { researchManualOpportunity, researchDecisionMakers, researchPersonContact } from "@/lib/manualAcquisitionResearch.server";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const body = await readIngestionBody(req);
    if (!body || typeof body !== "object" || !uuid.test(body.organisationId || "")) throw new IngestionError("Select an organisation explicitly.");
    const tenant = await requireOrganisation(body.organisationId, true);
    if (body.action === "review") {
      const input=parseManualInput(body.input), requestedResearch=body.requestedResearch===true;
      const intake=await readRelationshipIntake(tenant,{entityKind:input.person?"person":"company",sourceType:"manual_acquisition",row:{id:"candidate",organisation_id:tenant.organisationId,person:input.person||null,company:input.company||null,linkedin_url:input.linkedin||null,email:input.email||null,website:input.website||null}});
      const review=requestedResearch ? await researchManualOpportunity(tenant.organisationId,input) : manualReview(input,false);
      return NextResponse.json({ review, intake }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "people") {
      const input=parseManualInput(body.input);
      const review=await researchDecisionMakers(tenant.organisationId,input,body.review);
      return NextResponse.json({ review }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "contact") {
      const input=parseManualInput(body.input),personName=String(body.personName||"").trim(),personRole=String(body.personRole||"").trim(),emailFormatHint=String(body.emailFormatHint||"").trim();
      if(!personName||!personRole)throw new IngestionError("Choose a verified decision-maker first.");
      if(emailFormatHint&&emailFormatHint.length>300)throw new IngestionError("Email format is too long.");
      const review=await researchPersonContact(tenant.organisationId,input,body.review,personName,personRole,emailFormatHint);
      return NextResponse.json({ review }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "create") throw new IngestionError("Invalid manual opportunity action.");
    const record = manualRecord(tenant.organisationId, tenant.userId, body);
    const preview=await previewSourceCreation(tenant,"acquisition_items",{...record,id:String(body.submissionId)},record.person?"person":"company",String(body.submissionId),body.keepSeparate===true);
    if(!("reviewToken" in preview))return NextResponse.json({error:"Review the existing relationship before creating another source.",...preview},{status:409});
    return NextResponse.json(preview,{status:202,headers:{"Cache-Control":"private, no-store"}});
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: error instanceof IngestionError ? error.message : "Unable to create opportunity. Retry the same submission; do not start another." }, { status: error instanceof IngestionError ? error.status : 503 }); }
}
