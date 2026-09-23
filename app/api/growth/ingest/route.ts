import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeIngestion, IngestionError, parseIngestion, readIngestionBody } from "@/lib/growthIngestion.server";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const { organisationId, records } = parseIngestion(await readIngestionBody(req));
    authorizeIngestion(req.headers.get("authorization"), organisationId, records.map(r => r.source_engine));
    const { data, error } = await supabaseAdmin.from("acquisition_items").upsert(records, {
      onConflict: "organisation_id,source_engine,source_record_id", ignoreDuplicates: true,
    }).select("id");
    if (error) return NextResponse.json({ error: "Unable to import records." }, { status: 503 });
    return NextResponse.json({ success: true, received: records.length, inserted: data?.length ?? 0, duplicates: records.length - (data?.length ?? 0) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof IngestionError ? error.message : "Unable to import records." }, { status: error instanceof IngestionError ? error.status : 503 });
  }
}
