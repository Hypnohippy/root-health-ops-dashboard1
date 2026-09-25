import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeIngestion, IngestionError, readIngestionBody } from "@/lib/growthIngestion.server";
import { engineStateConflict, parseEngineStateBatch } from "@/lib/engineStateIngestion.server";
import type { EngineState } from "@/lib/engineState";
import { lifecycleLinkedInIdentity } from "@/lib/contactLifecycle";
export const runtime = "nodejs";

/** Visibility only: no inbox creation, approvals, targets, sends or reconciliation. */
export async function POST(req: Request) {
  try {
    const { organisationId, records } = parseEngineStateBatch(await readIngestionBody(req));
    authorizeIngestion(req.headers.get("authorization"), organisationId, records.map(r => r.source_engine));
    const result = { received: records.length, inserted: 0, updated: 0, duplicates: 0, stale: 0, conflicts: 0 };
    for (const record of records) {
      const { data: old, error } = await supabaseAdmin.from("acquisition_items").select("engine_state,engine_observed_at,metadata,source_url,person,company,record_type")
        .eq("organisation_id", organisationId).eq("source_engine", record.source_engine).eq("source_record_id", record.source_record_id).maybeSingle();
      if (error) throw error;
      if (old?.record_type && old.record_type !== record.record_type) { result.conflicts++; continue; }
      if (old?.engine_observed_at && Date.parse(old.engine_observed_at) > Date.parse(record.engine_observed_at)) { result.stale++; continue; }
      if (old?.engine_state && engineStateConflict(old.engine_state as EngineState, record.engine_state)) { result.conflicts++; continue; }
      // Existing acquisition identities must also agree before the first state sync.
      const meta = old?.metadata && typeof old.metadata === "object" ? old.metadata as Record<string, unknown> : {};
      const oldLinkedIn = [meta.linkedin_identity, meta.linkedin_url, meta.profile_url, old?.source_url].map(lifecycleLinkedInIdentity).find(Boolean);
      if (old && !old.engine_state && ((meta.email && String(meta.email).toLowerCase() !== record.engine_state.email) ||
        (oldLinkedIn && oldLinkedIn !== record.engine_state.linkedin_identity) ||
        (old.person && old.company && (old.person.toLowerCase() !== record.engine_state.person?.toLowerCase() || old.company.toLowerCase() !== record.engine_state.company?.toLowerCase())))) {
        result.conflicts++; continue;
      }
      const { data: outcome, error: writeError } = await supabaseAdmin.rpc("sync_acquisition_engine_state", {
        p_organisation_id: organisationId, p_record: record, p_expected_state: old?.engine_state ?? null,
        p_expected_observed_at: old?.engine_observed_at ?? null,
      });
      if (writeError) throw writeError;
      if (!["inserted", "updated", "duplicates", "stale", "conflicts"].includes(outcome)) throw new Error("Unexpected result");
      result[outcome as "inserted" | "updated" | "duplicates" | "stale" | "conflicts"]++;
    }
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof IngestionError ? error.message : "Unable to sync engine state. Earlier records may have been applied; retry the same snapshots safely." }, { status: error instanceof IngestionError ? error.status : 503 });
  }
}
