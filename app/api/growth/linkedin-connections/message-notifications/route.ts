import { NextResponse } from "next/server";
import { authorizeIngestion, IngestionError, readIngestionBody, uuid } from "@/lib/growthIngestion.server";
import { parseLinkedInMessageNotifications } from "@/lib/linkedinMessageNotification";
import { ingestLinkedInNotifications } from "@/lib/linkedinMessageNotification.server";
export const runtime="nodejs";
export async function POST(req:Request) {
  try {
    const body=await readIngestionBody(req) as Record<string,unknown>;
    const org=typeof body.organisation_id==="string" ? body.organisation_id.toLowerCase() : "";
    // Existing B2B intake credential; caller cannot choose a less restricted scope.
    if(!uuid.test(org) || body.source_engine!=="root_health_b2b") throw new IngestionError("Explicit organisation and supported intake source required.");
    authorizeIngestion(req.headers.get("authorization"),org,["root_health_b2b"]);
    const parsed=parseLinkedInMessageNotifications(body);
    if(!parsed.events.length) throw new IngestionError("Unverified or ambiguous LinkedIn message notification.");
    const results=await ingestLinkedInNotifications(org,parsed.events);
    const failed=results.filter(result=>result.error).length + parsed.rejectedBlocks;
    const imported=results.filter(result=>result.itemId && !result.duplicate).length;
    const duplicates=results.filter(result=>result.duplicate).length;
    return NextResponse.json({...(parsed.events.length===1 ? results[0] : {}), success:failed===0, imported, duplicates, failed, results}, {status:failed ? 503 : 200, headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    return NextResponse.json({success:false,error:error instanceof IngestionError ? error.message : "Notification intake failed; retry or review the existing relationship."},{status:error instanceof IngestionError ? error.status : 503});
  }
}
