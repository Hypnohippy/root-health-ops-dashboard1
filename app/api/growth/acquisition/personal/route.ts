import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { readPersonalOpportunities } from "@/lib/personalAcquisition.server";
import { personalPerformance } from "@/lib/personalDistribution.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uuid } from "@/lib/growthIngestion.server";

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const requested = params.get("organisationId") || "", page = Number(params.get("page") || 0);
    const category = params.get("category") || "", state = params.get("state") || "";
    if (!uuid.test(requested) || !Number.isInteger(page) || page < 0 || page > 10000 || !["", "people", "content", "partners", "review"].includes(category) || !["", "decide", "progress", "saved", "completed"].includes(state)) return NextResponse.json({ error: "Invalid opportunity filter." }, { status: 400 });
    const { organisationId } = await requireOrganisation(requested, false);
    const all = await readPersonalOpportunities(organisationId);
    const stateOf = (status: string) => status === "nurture" ? "saved" : ["actioned", "engaged", "converted", "lost", "dismissed"].includes(status) ? "completed" : ["reviewing", "accepted"].includes(status) ? "progress" : "decide";
    const groups = all.filter(g => (!category || g.category === category) && (!state || stateOf(g.item.status) === state));
    const slice = groups.slice(page * 25, page * 25 + 25);
    const performance = await personalPerformance(supabaseAdmin, organisationId, slice.flatMap(g => g.members));
    const publishingIds = slice.flatMap(g => performance[g.item.id]?.publishing?.id ? [performance[g.item.id].publishing!.id] : []);
    const savedDrafts: Record<string, string> = {};
    if (publishingIds.length) {
      const { data, error } = await supabaseAdmin.from("scheduled_posts").select("id,message").eq("organisation_id", organisationId).in("id", publishingIds);
      if (error) throw error;
      for (const post of data || []) savedDrafts[post.id] = post.message || "";
    }
    return NextResponse.json({ groups: slice.map(g => ({ ...g, savedDraft: savedDrafts[performance[g.item.id]?.publishing?.id || ""] || null, personalPerformance: performance[g.item.id] || null })), total: groups.length,
      counts: { people: all.filter(g => g.category === "people").length, content: all.filter(g => g.category === "content").length, partners: all.filter(g => g.category === "partners").length, review: all.filter(g => g.category === "review").length } });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Unable to load Personal opportunities." }, { status: 503 }); }
}
