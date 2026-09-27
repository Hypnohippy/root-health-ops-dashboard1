import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { readDueGrowthTargets } from "@/lib/growthDue.server";
import { contextualOutreachDraft } from "@/lib/growthOutreach";

export const runtime = "nodejs";

export const GET = withTenantRoute(async function GET(req: Request, tenant) {
  const data = await readDueGrowthTargets(tenant.organisationId);

  const due = data.map((target) => ({
    ...target,
    suggested_message: contextualOutreachDraft({ target_name: String(target.target_name || ""), company: String(target.company || ""), role_title: String(target.role_title || ""), stage: String(target.stage || "") }, tenant.profile!),
  }));

  return NextResponse.json({ success: true, data: due });
}, { generation: true, write: false });
