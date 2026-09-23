import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const {
      title,
      body,
      platform = "linkedin",
      scheduledTime,
      seriesName,
      episodeNumber,
      imageUrl,
    } = await req.json();

    if (!body || !scheduledTime) {
      return NextResponse.json(
        { error: "body and scheduledTime are required" },
        { status: 400 }
      );
    }

    const { organisationId } = await requireOrganisation(req.nextUrl.searchParams.get("organisationId"));
    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found in database." },
        { status: 400 }
      );
    }

    // Platforms field in scheduled_posts is an array
    const platforms = [String(platform || "linkedin").toLowerCase().trim()].filter(Boolean);

    const messageParts = [
      title ? String(title).trim() : null,
      String(body).trim(),
    ].filter(Boolean);

    const message = messageParts.join("\n\n");

    const meta: any = {};
    if (seriesName) meta.seriesName = seriesName;
    if (episodeNumber != null) meta.episodeNumber = episodeNumber;

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .insert({
        organisation_id: organisationId,
        message,
        platforms,
        image_url: imageUrl ? String(imageUrl).trim() : null,
        scheduled_for: new Date(scheduledTime).toISOString(),
        status: "scheduled",
        meta,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[schedule/story] insert error", error);
      return NextResponse.json(
        { error: "Failed to create scheduled post", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, organisationId, item: data });
  } catch (err: any) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
