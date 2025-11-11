// app/api/replies/[id]/route.ts
import { NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY!;

async function updateInTable(tableName: string, id: string, fields: Record<string, any>) {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            id,
            fields,
          },
        ],
      }),
    }
  );

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();

  // 1) try underscored name
  const first = await updateInTable("Lead_Conversations", id, body);
  if (first.ok) {
    return NextResponse.json({ ok: true, record: first.data });
  }

  // 2) fallback to spaced name
  const second = await updateInTable("Lead Conversations", id, body);
  if (second.ok) {
    return NextResponse.json({ ok: true, record: second.data });
  }

  return NextResponse.json(
    {
      error: "Could not update Airtable record",
      tried: [
        { table: "Lead_Conversations", response: first.data },
        { table: "Lead Conversations", response: second.data },
      ],
    },
    { status: 500 }
  );
}
