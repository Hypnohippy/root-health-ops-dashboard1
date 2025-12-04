// app/api/content/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Expect something like this from your Ops app:
    // {
    //   organisationId,
    //   title,
    //   text,
    //   platform,
    //   socialAccountId,
    //   scheduledAt
    // }
    const {
      organisationId,
      title,
      text,
      platform = "facebook",
      socialAccountId,
      scheduledAt,
    } = body;

    if (!organisationId || !text) {
      return NextResponse.json(
        { error: "organisationId and text are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("content_items")
      .insert({
        organisation_id: organisationId,
        title: title ?? null,
        body: text,
        platform,
        status: scheduledAt ? "scheduled" : "sent",
        scheduled_at: scheduledAt ?? null,
        social_account_id: socialAccountId ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error", error);
      return NextResponse.json(
        { error: "Failed to save content", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ content: data }, { status: 201 });
  } catch (err: any) {
    console.error("Content POST error", err);
    return NextResponse.json(
      { error: "Server error", details: err?.message },
      { status: 500 }
    );
  }
}
