// app/api/replies/[id]/route.ts
import { NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE = "Lead Conversations"; // change to your actual table name
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY!;

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json(); // fields to update

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_TABLE
      )}`,
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
              fields: body,
            },
          ],
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: "Airtable update failed", detail: data },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, record: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected error", detail: err?.message },
      { status: 500 }
    );
  }
}
