// app/api/content/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

export async function POST(req: NextRequest) {
  try {
    const { organisationId, body, mediaIds, platform } = await req.json();

    if (!organisationId || !body) {
      return NextResponse.json(
        { error: "organisationId and body are required" },
        { status: 400 }
      );
    }

    const { data: content, error } = await supabase
      .from("content_items")
      .insert({
        organisation_id: organisationId,
        body,
        platform: platform || "facebook",
        status: "draft",
      })
      .select("id")
      .single();

    if (error || !content) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to save content" },
        { status: 500 }
      );
    }

    if (Array.isArray(mediaIds) && mediaIds.length > 0) {
      const rows = mediaIds.map((id: string, index: number) => ({
        content_id: content.id,
        media_id: id,
        position: index,
      }));
      const { error: cmError } = await supabase
        .from("content_media")
        .insert(rows);

      if (cmError) {
        console.error(cmError);
      }
    }

    return NextResponse.json({ id: content.id });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Server error", details: err?.message },
      { status: 500 }
    );
  }
}
