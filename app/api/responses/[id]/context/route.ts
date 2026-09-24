import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { getOrganisationGenerationProfile } from "@/lib/organisationProfile.server";
import { getResponseContactContext } from "@/lib/responseContactContext.server";

export const runtime = "nodejs";
export async function GET(req: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    const id = (await routeContext.params).id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Response item is required." }, { status: 400 });
    const requested = new URL(req.url).searchParams.get("organisationId");
    const tenant = await requireOrganisation(requested, false);
    const profile = await getOrganisationGenerationProfile(tenant.organisationId);
    return NextResponse.json({ success: true, context: await getResponseContactContext(tenant.organisationId, id, profile) });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Contact context could not be loaded." }, { status: 503 }); }
}
