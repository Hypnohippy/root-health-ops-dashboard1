import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_SCHEDULE_TABLE = "Scheduled_Posts";

if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
  console.warn(
    "[schedule/story] Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY env vars"
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
      return NextResponse.json(
        { error: "Airtable is not configured" },
        { status: 500 }
      );
    }

    const {
      title,
      body,
      platform = "LinkedIn",
      scheduledTime,
      seriesName,
      episodeNumber,
    } = await req.json();

    if (!title || !body || !scheduledTime) {
      return NextResponse.json(
        { error: "title, body and scheduledTime are required" },
        { status: 400 }
      );
    }

    const fields: Record<string, any> = {
      title,
      body,
      platform,
      scheduled_time: scheduledTime,
      status: "pending",
    };

    if (seriesName) fields.series_name = seriesName;
    if (episodeNumber != null) fields.episode_number = episodeNumber;

    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_SCHEDULE_TABLE
      )}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Failed to create scheduled post" },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true, record: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
