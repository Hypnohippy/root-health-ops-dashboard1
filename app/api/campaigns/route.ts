import { NextRequest, NextResponse } from "next/server";

const TABLE = process.env.AIRTABLE_CAMPAIGNS_TABLE || "Campaigns";

function requireEnv() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!baseId || !apiKey) {
    throw new Error("Missing Airtable env (AIRTABLE_BASE_ID / AIRTABLE_API_KEY)");
  }
  return { baseId, apiKey };
}

async function airtableFetch(path: string, init?: RequestInit) {
  const { baseId, apiKey } = requireEnv();
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(path)}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

/** GET /api/campaigns -> list campaigns */
export async function GET() {
  try {
    const res = await airtableFetch(TABLE);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Airtable error" }, { status: 500 });
  }
}

/** POST /api/campaigns -> create campaign */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Map incoming payload -> Airtable fields
    const fields = {
      name: body.name ?? null,
      platform: body.platform ?? null,                   // "Meta (Facebook/IG)" | "Google" | "LinkedIn"
      objective: body.objective ?? null,                 // "Leads" | "Traffic" | "Awareness"
      budget_daily: Number(body.budget_daily ?? 0),
      start_date: body.start_date ?? null,               // ISO
      end_date: body.end_date ?? null,                   // ISO
      location: body.location ?? null,
      age_range: body.age_range ?? null,
      audience_keywords: body.audience_keywords ?? "",
      primary_text: body.primary_text ?? "",
      headline: body.headline ?? "",
      url: body.url ?? "",
      media_url: body.media_url ?? null,
      status: body.status ?? "draft",                    // "draft" | "queued_to_publish" | "published"
      created_at: new Date().toISOString(),
    };

    const res = await airtableFetch(TABLE, {
      method: "POST",
      body: JSON.stringify({ records: [{ fields }] }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Airtable error" }, { status: 500 });
  }
}
