import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { lifecycleLinkedInIdentity } from "@/lib/contactLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const normal = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const text = (value: unknown) => typeof value === "string" ? value : null;

export const GET = withTenantRoute(async function GET(req: Request, tenant) {
  const query = new URL(req.url).searchParams.get("q")?.trim() || "";
  const identity = lifecycleLinkedInIdentity(query);
  if (!query || query.length > 300 || (!identity && /linkedin\.com|https?:|\//i.test(query))) {
    return NextResponse.json({ error: "Enter a name or a valid LinkedIn person profile URL / identity (up to 300 characters)." }, { status: 400, headers });
  }
  // Reuse the complete, tenant-scoped paginated reader; never infer absence from
  // the pipeline endpoint's default database row limit.
  const { growth_targets } = await readLifecycleInput(tenant.organisationId);
  const matches = growth_targets.filter(row => row.organisation_id === tenant.organisationId && (identity
    ? (lifecycleLinkedInIdentity(row.linkedin_identity) || lifecycleLinkedInIdentity(row.linkedin_url)) === identity
    : normal(text(row.target_name) || "").includes(normal(query))))
    .map(row => ({ id: row.id, target_name: text(row.target_name), linkedin_identity: text(row.linkedin_identity),
      linkedin_url: text(row.linkedin_url), stage: text(row.stage), status: text(row.status),
      source_type: text(row.source_type), source_record_id: text(row.source_record_id) }));
  return NextResponse.json({ exists: matches.length > 0, matchType: identity ? "linkedin" : "name", matches }, { headers });
}, { generation: false, write: false });
