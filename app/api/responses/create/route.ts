// app/api/responses/create/route.ts
import { requireOrganisation,accessErrorResponse } from "@/lib/tenantAuth";
import { previewSourceCreation,reviewRequestKey } from "@/lib/reviewedIdentity.server";
import { NextRequest, NextResponse } from "next/server";

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function cleanPlatform(v: unknown): string {
  const s = cleanStr(v).toLowerCase();
  const allowed = new Set([
    "facebook",
    "instagram",
    "linkedin",
    "threads",
    "tiktok",
    "reddit",
    "unknown",
  ]);
  return allowed.has(s) ? s : "unknown";
}

function cleanStatus(v: unknown): string {
  const s = cleanStr(v).toLowerCase();
  const allowed = new Set(["unread", "needs_reply", "replied", "archived"]);
  return allowed.has(s) ? s : "unread";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const tenant=await requireOrganisation(cleanStr(body?.organisationId),true);
    const organisationId=tenant.organisationId;
    const platform = cleanPlatform(body?.platform);
    const status = cleanStatus(body?.status);

    const text = cleanStr(body?.text);
    const authorName = cleanStr(body?.authorName) || null;
    const permalink = cleanStr(body?.permalink) || null;

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    if (!text) {
      return NextResponse.json(
        { success: false, error: "Text is required" },
        { status: 400 }
      );
    }

    const key=reviewRequestKey(body.submissionId);
    const preview=await previewSourceCreation(tenant,"inbox_items",{id:key,organisation_id:organisationId,platform,kind:"comment",status,text,author_name:authorName,permalink,created_at:cleanStr(body.createdAt)||new Date().toISOString()},"person",key,body.keepSeparate===true);
    if(!("reviewToken" in preview))return NextResponse.json({success:false,error:"Review the existing relationship before adding manual evidence.",...preview},{status:409});
    return NextResponse.json(preview,{status:202,headers:{"Cache-Control":"private, no-store"}});
  } catch (err) {
    const denied=accessErrorResponse(err);if(denied)return denied;
    console.error("[responses/create] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
