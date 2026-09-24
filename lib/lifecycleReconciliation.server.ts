import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { planLifecycleReconciliation } from "@/lib/lifecycleReconciliation";

async function revision(organisationId: string) {
  const { data, error } = await supabaseAdmin.from("lifecycle_revisions").select("revision")
    .eq("organisation_id", organisationId).maybeSingle();
  if (error) throw error;
  return String(data?.revision || "0");
}

/** Caller must supply an authorised tenant. No provider or messaging dependencies. */
export async function reconcileLifecycle(organisationId: string) {
  if (!organisationId.trim()) throw new Error("Organisation is required.");
  const empty = { contactsInspected: 0, repairsApplied: 0, skippedAmbiguousContacts: 0, duplicatesAvoided: 0, errors: [] as string[] };
  let summary = empty;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await revision(organisationId);
      const input = await readLifecycleInput(organisationId);
      if (before !== await revision(organisationId)) continue;
      const plan = planLifecycleReconciliation(organisationId, input);
      const { repairs, ...counts } = plan;
      summary = { ...empty, ...counts };
      const { data, error } = await supabaseAdmin.rpc("apply_lifecycle_repairs", {
        p_organisation_id: organisationId, p_expected_revision: before, p_repairs: repairs,
      });
      if (error) {
        if (["40001", "40P01", "23505"].includes(error.code)) continue;
        throw error;
      }
      if (data?.stale) continue;
      return { ...counts, repairsApplied: Number(data.applied), errors: [] as string[] };
    }
    return { ...summary, errors: ["Concurrent changes prevented reconciliation; retry later."] };
  } catch {
    return { ...summary, errors: ["Reconciliation could not be confirmed; retry safely."] };
  }
}
