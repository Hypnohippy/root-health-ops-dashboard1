import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    return NextResponse.json({ error: "Missing Airtable env" }, { status: 500 });
  }

  const body = await req.json();
  const { title, platform, status, notes } = body;

  const airtableRes = await fetch(
    `https://api.airtable.com/v0/${baseId}/Content`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            fields: {
              title,
              platform,
              status: status || "draft",
              notes,
            },
          },
        ],
      }),
    }
  );

  const data = await airtableRes.json();

  if (!airtableRes.ok) {
    return NextResponse.json({ error: data }, { status: 500 });
  }

  return NextResponse.json({ ok: true, record: data });
}
