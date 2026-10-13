import { groupPersonalOpportunities } from "@/lib/acquisitionPresentation";
import { matchesSearch, searchQuery } from "@/lib/opsSearch";


import { linkedInInvitationQueue } from "@/lib/linkedinInvitation";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordTypes, statuses, uuid } from "@/lib/growthIngestion.server";
import { personalPerformance } from "@/lib/personalDistribution.server";
import { linkedInRecommendationStates, acceptedLinkedInOpportunities } from "@/lib/linkedinCapture.server";
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const requested = params.get("organisationId") || "";
    if (!uuid.test(requested)) return NextResponse.json({ error: "Select an organisation explicitly." }, { status: 400 });
    const { organisationId } = await requireOrganisation(requested, false);
    const page = Number(params.get("page") || 0);
    const search = searchQuery(params.get("q"));
    const status = params.get("status");
    const recordType = params.get("record_type");
    const sourceEngine = params.get("source_engine");
    if (sourceEngine !== null && sourceEngine !== "linkedin_connection_recommendation") return NextResponse.json({ error: "Invalid source filter." }, { status: 400 });
    if (recordType !== null && !recordTypes.includes(recordType as typeof recordTypes[number])) return NextResponse.json({ error: "Invalid record_type." }, { status: 400 });
    const itemId = params.get("itemId");
    if (itemId && !uuid.test(itemId)) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
    if (!Number.isInteger(page) || page < 0 || page > 10000 || (status && !statuses.includes(status as typeof statuses[number]))) return NextResponse.json({ error: "Invalid filter." }, { status: 400 });
    // This isolated view combines references before pagination. Other Acquisition contracts are unchanged.
    if (sourceEngine === "linkedin_connection_recommendation" && !itemId && (!recordType || recordType === "personal_opportunity")) {
      const recommendations = [];
      for (let offset = 0; ; offset += 500) {
        let request = supabaseAdmin.from("acquisition_items").select("*").eq("organisation_id", organisationId).eq("source_engine", sourceEngine);
        if (status) request = request.eq("status", status);
        const { data, error } = await request.order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
        if (error) throw error;
        recommendations.push(...(data || []));
        if ((data || []).length < 500) break;
      }
      const invitationInput = await readLifecycleInput(organisationId, false);
      const invitations = linkedInInvitationQueue(organisationId, invitationInput);
      const members = new Set(invitations.flatMap(item => item.provenance.map(source => source.id)));
      const owners = new Set(invitations.map(item => item.id));
      // Only this LinkedIn view widens to explicitly qualified professional sources.
      // Keep original records/provenance; canonical duplicates become one visible opportunity.
      const candidates = recommendations.filter(item => !members.has(item.id) || owners.has(item.id));
      candidates.push(...invitationInput.acquisition_items.filter(item => item.source_engine !== sourceEngine && owners.has(item.id) &&
        (!status || item.status === status) && invitations.find(i => i.id === item.id)?.state !== "excluded"));
      const states = await linkedInRecommendationStates(organisationId, candidates);
      for (const item of invitations) if (candidates.some(row => row.id === item.id)) states[item.id] = {
        acceptedConnectionId: item.acceptedConnectionId || states[item.id]?.acceptedConnectionId || null,
        alreadyKnown: !!states[item.id]?.alreadyKnown || item.state !== "to_connect",
      };
      const linkedIds = new Set(Object.values(states).map(state => state.acceptedConnectionId).filter(Boolean));
      const accepted = status ? [] : (await acceptedLinkedInOpportunities(organisationId)).filter(item => !linkedIds.has(item.linkedinConnectionState.acceptedConnectionId));
      const combined = [...candidates.map(item => ({ ...item, linkedinConnectionState: states[item.id], invitationSentAt: invitations.find(i => i.id === item.id)?.invitationSentAt || null, connectionSources: invitations.find(i => i.id === item.id)?.provenance })), ...accepted]
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || a.id.localeCompare(b.id));
      return NextResponse.json({ items: combined.filter(item=>matchesSearch(item,search)).slice(page * 25, page * 25 + 25), total: combined.filter(item=>matchesSearch(item,search)).length, page });
    }
    let query = supabaseAdmin.from("acquisition_items").select("*, acquisition_item_events(id, action, previous_status, new_status, outcome, note, created_at, actor_user_id, idempotency_key)", { count: "exact" }).eq("organisation_id", organisationId);
    if (status) query = query.eq("status", status);
    if (sourceEngine) query = query.eq("source_engine", sourceEngine);
    if (recordType === "personal_opportunity") query = query.or("record_type.eq.personal_opportunity,and(record_type.eq.social_opportunity,source_engine.eq.root_health_personal)");
    else if (recordType) query = query.eq("record_type", recordType);
    if (itemId) query = query.eq("id", itemId);
    let data: Awaited<typeof query>["data"], count: number | null;
    if(search) {
      const all: NonNullable<Awaited<typeof query>["data"]>=[];
      for(let offset=0;;offset+=500) {const result=await query.order("created_at",{ascending:false}).order("id").range(offset,offset+499);if(result.error)throw result.error;all.push(...(result.data||[]));if(!result.data||result.data.length<500)break;}
      const grouped=[...all.filter(item=>item.source_engine!=="root_health_personal"),...groupPersonalOpportunities(all.filter(item=>item.source_engine==="root_health_personal")).map(group=>({...group.item,personalGroup:group}))];const found=grouped.filter(item=>matchesSearch(item,search) || "personalGroup" in item && item.personalGroup.members.some((member:Record<string,unknown>)=>matchesSearch(member,search)));count=found.length;data=found.slice(page*25,page*25+25);
    } else {const result=await query.order("created_at",{ascending:false}).order("id").range(page*25,page*25+24);if(result.error)throw result.error;data=result.data;count=result.count;}
    const candidates = (data || []).filter(item => {
      const handoff = item.metadata?.handoff;
      return ["b2b_lead", "partner_opportunity"].includes(item.record_type) && ["prepare_outreach", "route_outreach"].includes(handoff?.action) &&
        handoff.destination === "/dashboard/growth/pipeline" && uuid.test(handoff?.target_id || "") && item.acquisition_item_events?.some((event: { idempotency_key: string; action: string }) =>
        event.idempotency_key === handoff.idempotency_key && event.action === handoff.action);
    });
    const linked = new Set<string>();
    if (candidates.length) {
      const { data: targets, error: targetError } = await supabaseAdmin.from("growth_targets").select("id")
        .eq("organisation_id", organisationId).in("id", candidates.map(item => item.metadata.handoff.target_id));
      if (targetError) throw targetError;
      for (const target of targets || []) linked.add(target.id);
    }
    const performance = await personalPerformance(supabaseAdmin, organisationId, data || []);
    const linkedinStates = await linkedInRecommendationStates(organisationId, data || []);
    return NextResponse.json({ items: (data || []).map(item => ({ ...item, personalPerformance: performance[item.id] || null,
      ...(linkedinStates[item.id] ? { linkedinConnectionState: linkedinStates[item.id] } : {}),
      outreachTargetId: candidates.includes(item) && linked.has(item.metadata.handoff.target_id) ? item.metadata.handoff.target_id : null,
    })), total: count, page });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Unable to load acquisition queue." }, { status: 503 }); }
}
