import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { connectionHealth } from "@/lib/connectionHealth";
import { growthAttentionCounts } from "@/lib/commandCentre";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const requested = new URL(req.url).searchParams.get("organisationId");
    const { organisationId } = await requireOrganisation(requested, false);
    const [acquisition, inbox, targets, scheduled, accounts] = await Promise.all([
      supabaseAdmin.from("acquisition_items").select("id,status", { count:"exact" }).eq("organisation_id", organisationId).eq("status", "new").limit(20),
      supabaseAdmin.from("inbox_items").select("id,platform,kind,status,response_state").eq("organisation_id", organisationId).order("inserted_at", { ascending:false }).limit(500),
      supabaseAdmin.from("growth_targets").select("id,target_name,company,stage,status,last_action_at,reply_status,deal_stage").eq("organisation_id", organisationId),
      supabaseAdmin.from("scheduled_posts").select("id,status,meta").eq("organisation_id", organisationId).limit(500),
      supabaseAdmin.from("social_accounts").select("platform,is_active,page_access_token,token_expires_at,page_name").eq("organisation_id", organisationId),
    ]);
    const failure = [acquisition.error, inbox.error, targets.error, scheduled.error, accounts.error].find(Boolean);
    if (failure) throw failure;
    const inboxRows = inbox.data || [];
    const targetRows = targets.data || [];
    const growth = growthAttentionCounts(targetRows);
    const connectionProblems = connectionHealth(accounts.data || []).filter(item => ["expired","reconnect_required"].includes(item.state)).length;
    const approvals = (scheduled.data || []).filter(row => String((row.meta as {approvals?:{state?:unknown}} | null)?.approvals?.state || "").toLowerCase() === "pending" && !["posted","failed"].includes(String(row.status || "").toLowerCase())).length;
    const linkedInConnections = inboxRows.filter(row => row.platform === "linkedin" && row.kind === "connection_accepted" && row.status === "needs_reply").length;
    const replies = inboxRows.filter(row => row.status === "needs_reply" || row.response_state === "needs_reply").length;
    return NextResponse.json({ success:true, organisationId, counts:{
      newOpportunities: acquisition.count || 0, linkedInConnections, outreachReady: targetRows.filter(row => row.status === "active" && row.stage === "connection").length,
      repliesNeedingResponse: replies, followupsDue: growth.followupsDue, waiting: growth.waiting,
      warmOpportunities: growth.warmOpportunities, meetingsOrConversions: growth.meetingsOrConversions,
      contentApprovals: approvals, connectionProblems,
    }}, { headers:{"Cache-Control":"private, no-store"} });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ success:false,error:"Unable to load today’s priorities." },{status:503}); }
}
