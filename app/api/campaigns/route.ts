import { NextRequest, NextResponse } from "next/server";

function requireEnv() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!baseId || !apiKey) throw new Error("Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY");
  return { baseId, apiKey };
}

async function afetch(path: string, init?: RequestInit) {
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

async function createRecord(table: string, fields: Record<string, any>) {
  const res = await afetch(table, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data, tableTried: table };
}

export async function GET() {
  const main = process.env.AIRTABLE_CAMPAIGNS_TABLE || "Campaigns";
  const res = await afetch(main);
  const data = await res.json();
  return NextResponse.json(
    res.ok ? data : { error: "Airtable GET failed", table: main, airtable: data },
    { status: res.status }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();

 const fields = {
  name: body.name ?? null,
  platform: body.platform ?? null,
  objective: body.objective ?? null,
  budget_daily: Number(body.budget_daily ?? 0),
  start_date: body.start_date ?? null,
  end_date: body.end_date ?? null,
  location: body.location ?? null,
  age_range: body.age_range ?? null,
  audience_keywords: body.audience_keywords ?? "",
  primary_text: body.primary_text ?? "",
  headline: body.headline ?? "",
  url: body.url ?? "",
  media_url: body.media_url ?? null,
  status: body.status ?? "draft",
};


  const primaryTable = process.env.AIRTABLE_CAMPAIGNS_TABLE || "Campaigns";
  const first = await createRecord(primaryTable, fields);
  if (first.ok) return NextResponse.json(first.data);

  // Helpful fallback & diagnostics
  if (primaryTable !== "Campaigns") {
    const second = await createRecord("Campaigns", fields);
    if (second.ok) return NextResponse.json(second.data);
    return NextResponse.json(
      {
        error: "Could not create campaign in Airtable",
        tried: [
          { table: first.tableTried, response: first.data },
          { table: second.tableTried, response: second.data },
        ],
        hints: [
          "Check table name (env AIRTABLE_CAMPAIGNS_TABLE) exactly matches Airtable.",
          "Check token scopes: data.records:read, data.records:write, schema.bases:read.",
          "Ensure the token has access to THIS base.",
          "For single selects, ensure options exist (platform/objective/status).",
        ],
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      error: "Could not create campaign in Airtable",
      tried: [{ table: first.tableTried, response: first.data }],
      hints: [
        "Check a table named 'Campaigns' exists in the same base.",
        "Or set AIRTABLE_CAMPAIGNS_TABLE to the exact table name.",
        "Check token scopes and base access.",
        "Ensure single select options exist.",
      ],
    },
    { status: 500 }
  );
}
