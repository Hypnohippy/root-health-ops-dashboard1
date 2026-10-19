import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { proposeSolutionBrief, validateRecommendation, presentationInput, type SolutionBrief } from "@/lib/solutionBrief";
import { withSolutionLayouts } from "@/lib/presentationAudience";
import { POST as generatePresentation } from "@/app/api/ai/presentation-outline/route";

export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (error: string, status = 400) => NextResponse.json({ error }, { status });
export const GET = withTenantRoute(async (req: NextRequest, tenant) => {
  const id = req.nextUrl.searchParams.get("id");
  const requestId = req.nextUrl.searchParams.get("requestId");
  if (!id && !requestId) return reply("Brief or source request ID required.");
  let q = supabaseAdmin.from("solution_briefs").select("*").eq("organisation_id", tenant.organisationId);
  q = id ? q.eq("id", id) : q.eq("source_request_id", requestId);
  const { data, error } = await q.maybeSingle();
  if (error) return reply("Unable to load brief. Phase 1 migration may not be installed.", 503);
  return NextResponse.json({ brief: data }, { headers: { "Cache-Control": "private, no-store" } });
}, { write: false });

export const POST = withTenantRoute(async (req: NextRequest, tenant) => {
  const body = await req.json();
  const org = tenant.organisationId;
  if (body.action === "create") {
    const { data: source, error } = await supabaseAdmin.from("proposal_requests").select("*").eq("organisation_id", org).eq("id", body.requestId).maybeSingle();
    if (error || !source) return reply("Request not found in this organisation.", 404);
    const { data, error: failed } = await supabaseAdmin.rpc("create_solution_brief", { p_org: org, p_request: source.id, p_user: tenant.userId, p_recommendation: proposeSolutionBrief(source) });
    if (failed) return reply("Unable to prepare brief. Check the Phase 1 migration.", 503);
    return NextResponse.json({ brief: data });
  }
  const { data: record, error: readError } = await supabaseAdmin.from("solution_briefs").select("*").eq("organisation_id", org).eq("id", body.id).maybeSingle();
  if (readError || !record) return reply("Brief not found in this organisation.", 404);
  const brief = record as SolutionBrief;
  if (body.action === "generate" && brief.presentation_resource_id) return NextResponse.json({ resourceId: brief.presentation_resource_id, reused: true });
  if (body.version !== brief.version) return reply("Brief changed. Reload before continuing.", 409);
  if (brief.presentation_resource_id) return reply("This approved brief already has its presentation. Edit that resource in Resources.", 409);
  if (body.action === "save" || body.action === "approve") {
    if (brief.generation_token) return reply("Presentation generation is in progress.", 409);
    let recommendation;
    try {
      recommendation = validateRecommendation(body.recommendation);
      if (body.action === "approve") presentationInput({ ...brief, recommendation, status: "approved" });
    } catch (e) { return reply(e instanceof Error ? e.message : "Invalid recommendation."); }
    const approved = body.action === "approve";
    const { data, error } = await supabaseAdmin.from("solution_briefs").update({ recommendation, status: approved ? "approved" : "draft", approved_at: approved ? new Date().toISOString() : null, approved_by: approved ? tenant.userId : null, version: brief.version + 1 })
      .eq("organisation_id", org).eq("id", brief.id).eq("version", brief.version).is("generation_token", null).is("presentation_resource_id", null).select().maybeSingle();
    if (error) return reply("Unable to save brief.", 503);
    if (!data) return reply("Brief changed. Reload before continuing.", 409);
    return NextResponse.json({ brief: data });
  }
  if (body.action !== "generate") return reply("Unknown brief action.");
  let input;
  try { input = presentationInput(brief); } catch (e) { return reply(e instanceof Error ? e.message : "Approve the brief first."); }
  const token = randomUUID();
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_solution_presentation", { p_org: org, p_brief: brief.id, p_version: brief.version, p_token: token });
  if (claimError || !claimed) return reply("Generation is already in progress or the brief changed. Reload; an interrupted attempt can be retried after ten minutes.", 409);
  try {
    // Reuse the same tenant policy, provider, allowance and generator as standalone Resources.
    const generated = await generatePresentation(new NextRequest(new URL("/api/ai/presentation-outline", req.url), { method: "POST", headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" }, body: JSON.stringify({ ...input, organisationId: org }) }));
    const result = await generated.json();
    if (!generated.ok) return reply(result.error || "Presentation generation failed.", generated.status);
    const content = { ...withSolutionLayouts(result.presentation, brief.recommendation.measurement),
      audience: brief.recommendation.audience, intended_reader: brief.recommendation.audience,
      duration: brief.recommendation.duration, delivery_context: brief.recommendation.format };
    const { data: resourceId, error } = await supabaseAdmin.rpc("complete_solution_presentation", { p_org: org, p_brief: brief.id, p_token: token, p_content: content });
    if (error) return reply("Unable to save the presentation. Reload to check whether it completed before retrying.", 503);
    return NextResponse.json({ resourceId });
  } catch {
    return reply("Presentation generation failed. Your approved brief is saved; try again.", 503);
  } finally {
    await supabaseAdmin.from("solution_briefs").update({ generation_token: null, generation_started_at: null }).eq("organisation_id", org).eq("id", brief.id).eq("generation_token", token);
  }
}, { write: true });
