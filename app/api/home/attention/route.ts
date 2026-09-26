import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { connectionHealth } from "@/lib/connectionHealth";
import { growthAttentionCounts } from "@/lib/commandCentre";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { buildHomeControl } from "@/lib/homeControl";
import type { LifecycleRow } from "@/lib/contactLifecycle";
import { responseLifecycleMap } from "@/lib/responseLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readAll(table: "scheduled_posts" | "social_accounts", columns: string, organisationId: string) {
  const rows: LifecycleRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from(table).select(columns).eq("organisation_id", organisationId).order("id").range(offset, offset + 499);
    if (error) throw error;
    rows.push(...((data || []) as unknown as LifecycleRow[]));
    if (!data || data.length < 500) return rows;
  }
}

export async function GET(req: Request) {
  try {
    const requested = new URL(req.url).searchParams.get("organisationId");
    const { organisationId } = await requireOrganisation(requested, false);
    // acquisition_items, inbox_items and growth_targets use the shared complete snapshot.
    const [input, postRows, accountRows] = await Promise.all([
      readLifecycleInput(organisationId),
      readAll("scheduled_posts", "id,organisation_id,message,platforms,status,meta,error_info,scheduled_for,posted_at,created_at", organisationId),
      readAll("social_accounts", "id,organisation_id,platform,is_active,page_access_token,token_expires_at,page_name", organisationId),
    ]);
    const inboxRows = input.inbox_items;
    const targetRows = input.growth_targets;
    const control = buildHomeControl(organisationId, { ...input, scheduled_posts: postRows, social_accounts: accountRows });
    const growth = growthAttentionCounts(targetRows.map(row => ({ stage: String(row.stage || ""), status: String(row.status || ""), last_action_at: String(row.last_action_at || ""), reply_status: String(row.reply_status || ""), deal_stage: String(row.deal_stage || "") })));
    const connectionProblems = connectionHealth(accountRows as unknown as Parameters<typeof connectionHealth>[0]).filter(item => ["expired","reconnect_required"].includes(item.state)).length;
    const approvals = postRows.filter(row => String((row.meta as {approvals?:{state?:unknown}} | null)?.approvals?.state || "").toLowerCase() === "pending" && !["posted","failed"].includes(String(row.status || "").toLowerCase())).length;
    const responses = responseLifecycleMap(organisationId, input);
    const linkedInConnections = inboxRows.filter(row => responses.get(row.id)?.canMarkContacted).length;
    const replies = inboxRows.filter(row => responses.get(row.id)?.actionItemId === row.id).length;
    return NextResponse.json({ success:true, organisationId, control, counts:{
      newOpportunities: input.acquisition_items.filter(row => row.status === "new").length, linkedInConnections, outreachReady: targetRows.filter(row => row.status === "active" && row.stage === "connection").length,
      repliesNeedingResponse: replies, followupsDue: growth.followupsDue, waiting: growth.waiting,
      warmOpportunities: growth.warmOpportunities, meetingsOrConversions: growth.meetingsOrConversions,
      contentApprovals: approvals, connectionProblems,
    }}, { headers:{"Cache-Control":"private, no-store"} });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ success:false,error:"Unable to load today’s priorities." },{status:503}); }
}
