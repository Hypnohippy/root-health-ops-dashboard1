import { NextRequest, NextResponse } from "next/server";

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
      body: JSON.stringify({
        records: [{ fields }],
      }),
    }
  );

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: NextRequest) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    return NextResponse.json({ error: "Missing Airtable env" }, { status: 500 });
  }

  const body = await req.json();
  const { message_body, platform, direction, status } = body;

  const fields = {
    message_body,
    platform,
    direction,
    status,
  };

  // 1) try the name we saw in your schema
  const first = await createInTable(
    baseId,
    apiKey,
    "Lead_Conversations",
    fields
  );

  if (first.ok) {
    return NextResponse.json({ ok: true, record: first.data });
  }

  // 2) if that fails, try a spaced version
  const second = await createInTable(
    baseId,
    apiKey,
    "Lead Conversations",
    fields
  );

  if (second.ok) {
    return NextResponse.json({ ok: true, record: second.data });
  }

  // 3) neither worked — return BOTH errors so we can see which one Airtable hates
  return NextResponse.json(
    {
      error: "Could not create reply in Airtable",
      tried: [
        { table: "Lead_Conversations", response: first.data },
        { table: "Lead Conversations", response: second.data },
      ],
    },
    { status: 500 }
  );
}
