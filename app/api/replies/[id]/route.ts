import { NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_KEY!;

async function fetchFrom(tableName: string, params: URLSearchParams) {
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
  return { ok: res.ok, data };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const params = new URLSearchParams({
      view: "Grid view",
      maxRecords: url.searchParams.get("maxRecords") ?? "100",
    });

    // try underscored first
    const first = await fetchFrom("Lead_Conversations", params);
    if (first.ok) {
      const rows = (first.data.records || []).map((r: any) => ({
        id: r.id,
        createdTime: r.createdTime,
        ...r.fields,
      }));
      return NextResponse.json({ records: rows });
    }

    // then spaced
    const second = await fetchFrom("Lead Conversations", params);
    if (second.ok) {
      const rows = (second.data.records || []).map((r: any) => ({
        id: r.id,
        createdTime: r.createdTime,
        ...r.fields,
      }));
      return NextResponse.json({ records: rows });
    }

    return NextResponse.json(
      {
        error: "Could not fetch from Airtable",
        tried: [first.data, second.data],
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
