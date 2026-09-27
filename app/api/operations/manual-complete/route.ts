import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { prepareManualCompletion, completeManualAction } from "@/lib/manualCompletion.server";
import { uuid } from "@/lib/growthIngestion.server";
import type { ManualTable } from "@/lib/operationalGovernor";
const tableValid = (table: unknown): table is ManualTable => table === "inbox_items" || table === "growth_targets";
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const { organisationId } = await requireOrganisation(q.get("organisationId"), true);
    const table = q.get("table"), id = q.get("id") || "";
    if (!tableValid(table) || !uuid.test(id)) return NextResponse.json({ error: "Invalid record." }, { status: 400 });
    const p = await prepareManualCompletion(organisationId, table, id);
    return NextResponse.json({ allowed: p.allowed, reason: p.reason, revision: p.revision, stage: p.contact.currentStage, intended: p.contact.nextAction, name: p.contact.name,
      sourceUrl: p.row.permalink || p.row.linkedin_url || null, message: p.row.approved_response || p.row.email_reply_draft || p.row.proposed_response || p.row.suggested_message || "" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Unable to verify current takeover state." }, { status: 409 }); }
}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { organisationId, userId } = await requireOrganisation(body.organisationId, true);
    if (!tableValid(body.table) || !uuid.test(body.id || "") || !uuid.test(body.key || "") || !/^\d+$/.test(body.revision || "") || body.confirmed !== true || body.sourceChecked !== true || typeof body.completedAt !== "string" || typeof body.evidence !== "string" || !body.evidence.trim() || body.evidence.length > 2000 || typeof body.message !== "string" || body.message.length > 50000)
      return NextResponse.json({ error: "Actual completion, source outcome verification, time and evidence are required." }, { status: 400 });
    const result = await completeManualAction(organisationId, userId, body);
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: error instanceof Error ? error.message : "Completion unavailable; refresh safely." }, { status: 409 }); }
}
