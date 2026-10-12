import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { readIngestionBody, IngestionError } from "@/lib/growthIngestion.server";
import { verifiedLinkedInProfile } from "@/lib/linkedinCaptureProfile";
import { validateManualCapture } from "@/lib/linkedinCapture";
import { recordManualLinkedInAcceptance, resolveCaptureName } from "@/lib/linkedinCapture.server";

export const POST = withTenantRoute(async (req, tenant) => {
  // Shortcut opens the signed-in capture page. No shared ingestion/service key on iOS.
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Open the secure Ops capture page to confirm acceptance." }, { status: 403 });
  try {
    const body = await readIngestionBody(req);
    let input;
    try { input = validateManualCapture(body); } catch (error) { throw new IngestionError(error instanceof Error ? error.message : "Invalid capture."); }
    const result = await recordManualLinkedInAcceptance(tenant.organisationId, tenant.userId, input);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof IngestionError ? error.message : "Capture was not saved. Review the profile in Responses or retry." }, { status: error instanceof IngestionError ? error.status : 503 });
  }
});

export const GET = withTenantRoute(async (req, tenant) => {
  const profile = new URL(req.url).searchParams.get("profile_url") || "";
  if (!verifiedLinkedInProfile(profile)) return NextResponse.json({ error: "Supply a direct LinkedIn profile URL." }, { status: 400 });
  const result = await resolveCaptureName(tenant.organisationId, profile);
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}, { write: false });
