import { relationshipContext, type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { readTenantHistory } from "@/lib/opsSearch.server";
import { enrichLinkedInOutreachDisplay } from "@/lib/linkedinOutreachDisplay";
import type { IdentityLedgerRow } from "@/lib/relationshipIdentityLedger";
import type { TruthRow } from "@/lib/relationshipTruth";
import type { LinkedInOutreachItem } from "@/lib/linkedinOutreach";

export async function linkedInOutreachDisplay(tenant: RelationshipTenant, items: LinkedInOutreachItem[]) {
  if (!items.length) return items;
  const [ctx, ledger] = await Promise.all([relationshipContext(tenant), readTenantHistory("relationship_identity_decisions", tenant.organisationId, "*", ["sequence"])]);
  return enrichLinkedInOutreachDisplay(items, {
    input: { lifecycle: ctx.input, founder: ctx.founder as TruthRow[], workspaces: ctx.workspaces as TruthRow[], links: ctx.links as TruthRow[], founderActivities: [], emailMessages: [], linkedinMessages: [], activities: [], tasks: [], acquisitionEvents: [], responseEvents: [] },
    policy: { organisationId: tenant.organisationId, founderAllowed: ctx.canFounder, asOf: new Date().toISOString() }, ledger: ledger as IdentityLedgerRow[],
  });
}
