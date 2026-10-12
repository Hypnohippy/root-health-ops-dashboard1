import { planLinkedInCadenceBackfill } from "@/lib/linkedinCadenceBackfill";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lifecycleLinkedInIdentity, type LifecycleInput, type LifecycleRow, type LifecycleTable } from "@/lib/contactLifecycle";

async function readSource(table: LifecycleTable, organisationId: string) {
  const rows: LifecycleRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from(table).select("*")
      .eq("organisation_id", organisationId).order("id").range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

export async function readLifecycleInput(organisationId: string, projectCadence = true): Promise<LifecycleInput> {
  const [acquisition_items, inbox_items, growth_targets] = await Promise.all([
    readSource("acquisition_items", organisationId), readSource("inbox_items", organisationId), readSource("growth_targets", organisationId),
  ]);
  const notified = inbox_items.filter(row => row.platform === "linkedin" && Array.isArray((row.raw as Record<string, unknown> | null)?.linkedin_message_notifications));
  const identityById=new Map(notified.map(row=>[row.id,lifecycleLinkedInIdentity(row.linkedin_identity) || lifecycleLinkedInIdentity(row.permalink)]));
  const identities = [...new Set([...identityById.values()].filter((value):value is string=>!!value))];
  for (let start=0;start<identities.length;start+=100) {
    const messages: Record<string, unknown>[]=[];
    for(let offset=0;;offset+=500) {
      const {data,error}=await supabaseAdmin.from("linkedin_conversation_messages").select("linkedin_identity,direction,message,contains_inbound_reply,confirmed_at")
        .eq("organisation_id",organisationId).in("linkedin_identity",identities.slice(start,start+100)).order("id").range(offset,offset+499);
      if(error) throw error; // Missing storage never silently enables drafting.
      messages.push(...(data || [])); if(!data || data.length<500) break;
    }
    for(const row of notified) {
      const notifications=(row.raw as Record<string, unknown>).linkedin_message_notifications as {receivedAt:string}[];
      const latest=notifications.map(n=>Date.parse(n.receivedAt)||0).sort((a,b)=>b-a)[0];
      const text=messages.filter(m=>m.linkedin_identity===identityById.get(row.id) && (m.direction==="inbound" || m.contains_inbound_reply===true) &&
        typeof m.message==="string" && m.message.trim() && Date.parse(String(m.confirmed_at))>=latest)
        .sort((a,b)=>String(a.confirmed_at).localeCompare(String(b.confirmed_at))).map(m=>String(m.message));
      if(text.length) row.linkedin_recorded_reply_text=text.join("\n\n");
    }
  }
  const input = { acquisition_items, inbox_items, growth_targets };
  return projectCadence ? planLinkedInCadenceBackfill(organisationId,input).projected : input;
}
