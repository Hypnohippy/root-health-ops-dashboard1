// app/api/content/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getCurrentUserId } from "../../../lib/supabaseServer";

// Simple GET so anything probing /api/content doesn't blow up with a 400
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid JSON body" },
        { status: 400 }
      );
    }

    let {
      organisationId,
      title,
      text,
      platform = "facebook",
      socialAccountId,
      scheduledAt,
    } = body as {
      organisationId?: string;
      title?: string;
      text?: string;
      platform?: string;
      socialAccountId?: string;
      scheduledAt?: string | null;
    };

    // If organisationId not provided, try to infer it from the logged-in user
    if (!organisationId) {
      const userId = await getCurrentUserId();
      if (userId) {
        const { data: orgMember, error: orgErr } = await supabaseAdmin
          .from("organisation_members")
          .select("organisation_id")
          .eq("user_id", userId)
          .single();

        if (!orgErr && orgMember?.organisation_id) {
          organisationId = orgMember.organisation_id;
        }
      }
    }

    if (!organisationId) {
      return NextResponse.json(
        {
          error:
            "No organisation found. Either organisationId is missing or this user is not linked to an organisation.",
        },
        { status: 400 }
      );
    }

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "text is required to create content" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("content_items")
      .insert({
        organisation_id: organisationId,
        title: title ?? null,
        body: text.trim(),
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
