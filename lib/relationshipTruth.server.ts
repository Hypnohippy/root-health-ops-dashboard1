import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { readTenantHistory } from "@/lib/opsSearch.server";
import { founderAllowed, type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { relationshipTruth, type TruthInput, type TruthRef, type TruthRow } from "@/lib/relationshipTruth";

/** Internal audit entry point only. No endpoint, consumer import, mailbox lookup or RPC. */
export async function readRelationshipTruthShadow(tenant: RelationshipTenant, anchor: TruthRef, asOf: string) {
  // Caller must already have passed the existing tenant boundary. Founder access is resolved server-side.
  const canFounder = await founderAllowed(tenant.organisationId);
  const names = ["email_conversation_messages", "linkedin_conversation_messages", "relationship_workspaces", "relationship_source_links", "relationship_activity_events", "relationship_tasks", "acquisition_item_events", "response_item_events"];
  const [lifecycle, values, founder, founderActivities] = await Promise.all([
    readLifecycleInput(tenant.organisationId, false),
    Promise.all(names.map(name => readTenantHistory(name, tenant.organisationId, "*", name === "relationship_source_links" ? ["source_table", "source_id"] : ["id"]))),
    canFounder ? readTenantHistory("founder_research_records", tenant.organisationId) : Promise.resolve([]),
    canFounder ? readTenantHistory("founder_activity_events", tenant.organisationId) : Promise.resolve([]),
  ]);
  const [emailMessages, linkedinMessages, workspaces, links, activities, tasks, acquisitionEvents, responseEvents] = values as TruthRow[][];
  const input: TruthInput = { lifecycle, emailMessages, linkedinMessages, workspaces, links, activities, tasks, acquisitionEvents, responseEvents, founder: founder as TruthRow[], founderActivities: founderActivities as TruthRow[] };
  return relationshipTruth(input, anchor, { organisationId: tenant.organisationId, founderAllowed: canFounder, asOf });
}
