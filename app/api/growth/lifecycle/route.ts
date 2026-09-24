import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildContactLifecycle, type LifecycleRow, type LifecycleTable } from "@/lib/contactLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Page each source so Supabase's default row limit cannot silently split contacts.
async function readSource(table: LifecycleTable, organisationId: string) {
  const rows: LifecycleRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabaseAdmin.from(table).select("*")
      .eq("organisation_id", organisationId).order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export const GET = withTenantRoute(async function GET(_req: Request, tenant) {
  const [acquisition_items, inbox_items, growth_targets] = await Promise.all([
    readSource("acquisition_items", tenant.organisationId),
    readSource("inbox_items", tenant.organisationId),
    readSource("growth_targets", tenant.organisationId),
  ]);
  return NextResponse.json({ success: true, data: buildContactLifecycle(tenant.organisationId, { acquisition_items, inbox_items, growth_targets }) },
    { headers: { "Cache-Control": "private, no-store" } });
}, { generation: false, write: false });
