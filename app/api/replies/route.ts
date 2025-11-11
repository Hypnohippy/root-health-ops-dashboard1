// app/api/replies/route.ts
import { NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY!;

// helper to fetch from a table
async function fetchFromTable(tableName: string, params: URLSearchParams) {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      tableName
    )}?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    }
  );
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const params = new URLSearchParams({
      view: "Grid view",
      maxRecords: searchParams.get("maxRecords") ?? "100",
    });

    // 1) try underscored version
    const first = await fetchFromTable("Lead_Conversations", params);
    if (first.ok) {
      const rows = (first.data.records || []).map((r: any) => ({
        id: r.id,
        createdTime: r.createdTime,
        ...r.fields,
      }));
      return NextResponse.json({ records: rows });
    }

    // 2) fallback to spaced version
    const second = await fetchFromTable("Lead Conversations", params);
    if (second.ok) {
      const rows = (second.data.records || []).map((r: any) => ({
        id: r.id,
        createdTime: r.createdTime,
        ...r.fields,
      }));
      return NextResponse.json({ records: rows });
    }

    // neither worked
    return NextResponse.json(
      {
        error: "Could not fetch from Airtable",
        tried: [
          { table: "Lead_Conversations", response: first.data },
          { table: "Lead Conversations", response: second.data },
        ],
      },
      { status: 500 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected error", detail: err?.message },
      { status: 500 }
    );
  }
}
