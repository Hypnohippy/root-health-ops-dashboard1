import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/tenantAuth";

/** Do not silently add a service-authorized path to the interactive comment reader. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: false, error: "Legacy social sync retired; use the authenticated Responses public-comment reader." }, { status: 410 });
}
