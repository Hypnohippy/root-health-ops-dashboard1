// app/api/responses/create/route.ts
import { requireOrganisation,accessErrorResponse } from "@/lib/tenantAuth";
import { readRelationshipIntake } from "@/lib/relationshipIntake.server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

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

    const intake=await readRelationshipIntake(tenant,{entityKind:"person",sourceType:"manual_response",row:{id:"candidate",organisation_id:organisationId,person:authorName,linkedin_url:platform==="linkedin"?permalink:null}});
    if(!intake.creationPermitted)return NextResponse.json({success:false,error:"Review the existing relationship before adding manual evidence. No response was created.",intake},{status:409});
    const createdAt =
      cleanStr(body?.createdAt) || new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("inbox_items")
      .insert({
        organisation_id: organisationId,
        platform,
        kind: "comment",
        status,
        text,
        author_name: authorName,
        author_id: null,
        created_at: createdAt,
        permalink,
        ayrshare_post_id: null,
        social_post_id: null,
        social_comment_id: null,
        parent_social_comment_id: null,
        raw: body?.raw ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[responses/create] supabase error", error);
      return NextResponse.json(
        { success: false, error: "Failed to create inbox item" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, id: data?.id },
      { status: 200 }
    );
  } catch (err) {
    const denied=accessErrorResponse(err);if(denied)return denied;
    console.error("[responses/create] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
