import { NextRequest, NextResponse } from "next/server";

/** Minimal Airtable helper */
async function createInTable(
  baseId: string,
  apiKey: string,
  tableName: string,
  fields: Record<string, any>
) {
  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: [{ fields }] }),
    }
  );
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function listFromTable(
  baseId: string,
  apiKey: string,
  tableName: string,
  view?: string
) {
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
  if (view) url.searchParams.set("view", view);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

const TABLE = process.env.AIRTABLE_CAMPAIGNS_TABLE || "Campaigns";

export async function GET() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!baseId || !apiKey) {
    return NextResponse.json({ error: "Missing Airtable env" }, { status: 500 });
  }
  const out = await listFromTable(baseId, apiKey, TABLE);
  if (!out.ok) return NextResponse.json(out.data, { status: out.status });
  return NextResponse.json(out.data);
}

export async function POST(req: NextRequest) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!baseId || !apiKey) {
    return NextResponse.json({ error: "Missing Airtable env" }, { status: 500 });
  }

  const body = await req.json();
  // Expected fields (feel free to extend the Airtable table to match these):
  const {
    name,
    platform,          // "Meta (Facebook/IG)" | "Google" | "LinkedIn"
    objective,         // "Leads" | "Traffic" | "Awareness"
    budget_daily,      // number
    start_date,        // ISO string
    end_date,          // ISO string
    location,          // "United Kingdom" etc
    age_range,         // "25-54" etc
    audience_keywords, // string
    primary_text,      // ad body
    headline,          // for Meta/LinkedIn; Google uses headlines array
    url,               // landing page
    media_url,         // optional
    status,            // "draft" | "queued_to_publish" | "published"
  } = body;

  const fields = {
    name,
    platform,
    objective,
    "budget_daily": budget_daily,
    "start_date": start_date,
    "end_date": end_date,
    "location": location,
    "age_range": age_range,
    "audience_keywords": audience_keywords,
    "primary_text": primary_text,
    "headline": headline,
    "url": url,
    "media_url": media_url,
    "status": status || "draft",
    "created_at": new Date().toISOString(),
  };

  const out = await createInTable(baseId, apiKey, TABLE, fields);
  if (!out.ok) return NextResponse.json(out.data, { status: out.status });
  return NextResponse.json(out.data);
}
