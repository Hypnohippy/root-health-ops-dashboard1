import { readTenantHistory } from "@/lib/opsSearch.server";
import { proactiveRetention } from "@/lib/operationalIntelligence";
import type { LifecycleInput } from "@/lib/contactLifecycle";
/** Server-resolved retention over tenant-owned explicit source links. Read failure fails closed. */
export async function readProactiveRetention(org: string, input: LifecycleInput) {
    const [workspaces, links] = await Promise.all([readTenantHistory("relationship_workspaces", org), readTenantHistory("relationship_source_links", org, "*", ["source_table", "source_id"])]);
    return proactiveRetention(org, input, workspaces, links);
}
