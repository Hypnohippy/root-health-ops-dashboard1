import { NextResponse } from "next/server";
import { authorizeIngestion, IngestionError, readIngestionBody, uuid } from "@/lib/growthIngestion.server";
import { parseLinkedInMessageNotification } from "@/lib/linkedinMessageNotification";
import { ingestLinkedInNotification } from "@/lib/linkedinMessageNotification.server";
export const runtime="nodejs";
export async function POST(req:Request) {
  try {
    const body=await readIngestionBody(req) as Record<string,unknown>;
    const org=typeof body.organisation_id==="string" ? body.organisation_id.toLowerCase() : "";
    // Existing B2B intake credential; caller cannot choose a less restricted scope.
    if(!uuid.test(org) || body.source_engine!=="root_health_b2b") throw new IngestionError("Explicit organisation and supported intake source required.");
    authorizeIngestion(req.headers.get("authorization"),org,["root_health_b2b"]);
    const notification=parseLinkedInMessageNotification(body);
    if(!notification) throw new IngestionError("Unverified or ambiguous LinkedIn message notification.");
    return NextResponse.json({success:true,...await ingestLinkedInNotification(org,notification)},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    return NextResponse.json({success:false,error:error instanceof IngestionError ? error.message : "Notification intake failed; retry or review the existing relationship."},{status:error instanceof IngestionError ? error.status : 503});
  }
}
