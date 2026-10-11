import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { groupPersonalOpportunities, type PersonalOpportunity } from "@/lib/acquisitionPresentation";

/** Read projection only. Original records and their receipts remain authoritative. */
export async function readPersonalOpportunities(organisationId: string) {
  const rows: PersonalOpportunity[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from("acquisition_items")
      .select("*, acquisition_item_events(id, action, previous_status, new_status, outcome, note, created_at, actor_user_id, idempotency_key)")
      .eq("organisation_id", organisationId).eq("source_engine", "root_health_personal").order("id").range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return groupPersonalOpportunities(rows);
    if (rows.length >= 20000) throw Error("Personal opportunity projection is too large; narrow the source before paging.");
  }
}
