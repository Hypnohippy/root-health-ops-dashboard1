import { NextResponse } from "next/server";
import { requirePublishingOrganisation, accessErrorResponse } from "@/lib/tenantAuth";

/** Retired: this endpoint wrote an unread parallel store and polled private messages. */
export async function POST(req: Request) {
  try {
    await requirePublishingOrganisation(req, new URL(req.url).searchParams.get("organisationId"));
    return NextResponse.json({ ok: false, error: "Legacy sync retired. Use Responses → Pull responses for the canonical public-comment inbox.", canonicalRoute: "/api/responses/pull" }, { status: 410 });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ ok: false, error: "Unable to verify organisation." }, { status: 503 }); }
}
