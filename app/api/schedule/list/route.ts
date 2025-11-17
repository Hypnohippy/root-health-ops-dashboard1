import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_SCHEDULE_TABLE = "Scheduled_Posts";

if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
  console.warn(
    "[schedule/list] Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY env vars"
  );
}

export async function GET(_req: NextRequest) {
  try {
    if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
      return NextResponse.json(
        { error: "Airtable is not configured" },
        { status: 500 }
      );
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_SCHEDULE_TABLE
    )}?sort[0][field]=scheduled_time&sort[0][direction]=asc&maxRecords=200`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Failed to fetch scheduled posts" },
        { status: res.status }
      );
    }

    const records = (data.records || []).map((r: any) => ({
      id: r.id,
      title: r.fields?.title || "",
      body: r.fields?.body || "",
      platform: r.fields?.platform || "LinkedIn",
      scheduled_time: r.fields?.scheduled_time || null,
      status: r.fields?.status || "pending",
      executed_at: r.fields?.executed_at || null,
      series_name: r.fields?.series_name || "",
      episode_number:
        typeof r.fields?.episode_number === "number"
          ? r.fields.episode_number
          : null,
    }));

    return NextResponse.json({ records });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
