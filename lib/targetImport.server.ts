import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { planTargetImport } from "@/lib/targetImport";
export async function importTargets(organisationId: string, rows: Record<string, unknown>[]) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: revision, error } = await supabaseAdmin.from("lifecycle_revisions").select("revision").eq("organisation_id", organisationId).maybeSingle();
    if (error) throw error;
    const plan = planTargetImport(organisationId, await readLifecycleInput(organisationId), rows);
    const { data, error: writeError } = await supabaseAdmin.rpc("import_canonical_targets", { p_organisation_id: organisationId, p_revision: revision?.revision || 0, p_rows: plan.inserts });
    if (writeError) { if (["40001", "40P01", "23505"].includes(writeError.code)) continue; throw writeError; }
    if (data?.stale) continue;
    return { imported: data.inserted, duplicates: plan.duplicates, skippedAmbiguous: plan.skippedAmbiguous };
  }
  throw new Error("Contacts changed during import. Retry the same file safely.");
}
