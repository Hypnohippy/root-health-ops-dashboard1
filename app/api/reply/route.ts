import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    return NextResponse.json({ error: "Missing Airtable env" }, { status: 500 });
  }

  const body = await req.json();
  const { message_body, platform, direction, status } = body;

  const airtableRes = await fetch(
    `https://api.airtable.com/v0/${baseId}/Lead_Conversations`,
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
              message_body,
              platform,
              direction,
              status,
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
