import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LifecycleInput, LifecycleRow, LifecycleTable } from "@/lib/contactLifecycle";

async function readSource(table: LifecycleTable, organisationId: string) {
  const rows: LifecycleRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from(table).select("*")
      .eq("organisation_id", organisationId).order("id").range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

export async function readLifecycleInput(organisationId: string): Promise<LifecycleInput> {
  const [acquisition_items, inbox_items, growth_targets] = await Promise.all([
    readSource("acquisition_items", organisationId), readSource("inbox_items", organisationId), readSource("growth_targets", organisationId),
  ]);
  return { acquisition_items, inbox_items, growth_targets };
}
