// app/api/content/route.ts
import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CONTENT_TABLE =
  process.env.AIRTABLE_CONTENT_TABLE || "Content";

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.warn(
    "[/api/content] Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variables."
  );
}

/**
 * POST /api/content
 *
 * Expected body:
 * {
 *   "title": "Story post",
 *   "platform": "LinkedIn" | "Facebook" | "Instagram",
 *   "body": "full text of the post",
 *   "status": "draft" | "scheduled" | "posted" | ...
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({} as any));

    const title =
      typeof json.title === "string" && json.title.trim().length
        ? json.title.trim()
        : "Story post";

    const platform =
      typeof json.platform === "string" && json.platform.trim().length
        ? json.platform.trim()
        : "LinkedIn";

    const bodyText =
      typeof json.body === "string" && json.body.trim().length
        ? json.body.trim()
        : null;

    const status =
      typeof json.status === "string" && json.status.trim().length
        ? json.status.trim()
        : "draft";

    if (!bodyText) {
      return NextResponse.json(
        { error: "No body text provided for content" },
        { status: 400 }
      );
    }

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: "Airtable environment variables are not configured" },
        { status: 500 }
      );
    }

    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_CONTENT_TABLE
    )}`;

    // These field names should match your **Airtable** column names.
    // From your text, we’re using: title, platform, body, status.
    const fields = {
      title,
      platform,
      body: bodyText,
      status,
    };

    const airtableRes = await fetch(airtableUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    const data = await airtableRes.json();

    if (!airtableRes.ok) {
      console.error("[/api/content] Airtable error:", data);
      return NextResponse.json(
        { error: data?.error?.message || "Failed to save to Airtable" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      recordId: data.id,
    });
  } catch (err: any) {
    console.error("[/api/content] Server error:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/content",
    usage: "POST { title, platform, body, status } to create content in Airtable.",
  });
}
