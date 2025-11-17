import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_CONTENT_TABLE = "Content";
const PRACTICE_ID = process.env.PRACTICE_ID || "root-health-dev";

if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
  console.warn(
    "[content] Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY env vars"
  );
}

export async function GET() {
  try {
    if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
      return NextResponse.json(
        { error: "Airtable is not configured" },
        { status: 500 }
      );
    }

    // Only fetch content for this practice
    const formula = `IF({practice_id}, {practice_id} = '${PRACTICE_ID}', TRUE())`;
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_CONTENT_TABLE
    )}?filterByFormula=${encodeURIComponent(
      formula
    )}&sort[0][field]=created_at&sort[0][direction]=desc&maxRecords=200`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Failed to fetch content" },
        { status: res.status }
      );
    }

    const records = (data.records || []).map((r: any) => ({
      id: r.id,
      title: r.fields?.title || "",
      platform: r.fields?.platform || "",
      body: r.fields?.body || "",
      status: r.fields?.status || "",
      created_at: r.fields?.created_at || null,
    }));

    return NextResponse.json({ records });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
      return NextResponse.json(
        { error: "Airtable is not configured" },
        { status: 500 }
      );
    }

    const { title, platform, body, status = "draft" } = await req.json();

    if (!body) {
      return NextResponse.json(
        { error: "body is required" },
        { status: 400 }
      );
    }

    const fields: Record<string, any> = {
      title: title || "",
      platform: platform || "",
      body,
      status,
      practice_id: PRACTICE_ID,
    };

    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_CONTENT_TABLE
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
        { error: data.error?.message || "Failed to create content" },
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
