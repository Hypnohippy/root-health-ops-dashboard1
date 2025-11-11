// app/api/replies/route.ts
import { NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE = "Lead Conversations"; // 👈 change if your working table has a different name
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY!;

export async function GET() {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_TABLE
      )}?view=Grid%20view`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Airtable fetch failed", detail: text },
        { status: 500 }
      );
    }

    const data = await res.json();
    const rows = (data.records || []).map((r: any) => ({
      id: r.id,
      createdTime: r.createdTime,
      ...r.fields,
    }));

    return NextResponse.json({ records: rows });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected error", detail: err?.message },
      { status: 500 }
    );
  }
}
