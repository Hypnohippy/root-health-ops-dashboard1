import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { randomUUID } from "node:crypto";
import { uuid } from "@/lib/growthIngestion.server";
import { AcquisitionWorkflowError } from "@/lib/acquisitionWorkflow";
import { promoteAcquisition } from "@/lib/acquisitionPromotion.server";

export async function POST(req: Request, context?: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json().catch(() => ({}));
    const { organisationId, userId } = await requireOrganisation(body.organisationId, true);
    const itemId = context ? (await context.params).id : "";
    const key = body.idempotencyKey || randomUUID();
    if (!uuid.test(itemId) || !uuid.test(body.organisationId || "") || !uuid.test(key)) return NextResponse.json({ error: "Item, organisation and valid request key are required." }, { status: 400 });
    return NextResponse.json(await promoteAcquisition(organisationId, userId, itemId, key));
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: error instanceof AcquisitionWorkflowError ? error.message : "Unable to start outreach. Refresh and retry safely." }, { status: error instanceof AcquisitionWorkflowError ? error.status : 503 }); }
}
