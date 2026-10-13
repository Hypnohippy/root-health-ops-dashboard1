import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lifecycleLinkedInIdentity, linkedInReplyNotification, unresolvedLinkedInNotification, type LifecycleRow } from "@/lib/contactLifecycle";
import { notificationPatch, notificationEventKey, type LinkedInMessageNotification } from "@/lib/linkedinMessageNotification";

const identityOf = (row: LifecycleRow) => lifecycleLinkedInIdentity(row.linkedin_identity) || lifecycleLinkedInIdentity(row.linkedin_url) || lifecycleLinkedInIdentity(row.permalink);
async function rows(table: "inbox_items" | "growth_targets", org: string) {
  const result: LifecycleRow[]=[];
  for (let offset=0;;offset+=500) {
    const {data,error}=await supabaseAdmin.from(table).select("*").eq("organisation_id",org).order("id").range(offset,offset+499);
    if(error) throw error;
    result.push(...(data || []));
    if(!data || data.length<500) return result;
  }
}
/** Reuses the existing relationship. CAS retains concurrent conversation/receipt evidence. */
export async function ingestLinkedInNotification(org: string, notification: LinkedInMessageNotification) {
  let matched: LifecycleRow | undefined, duplicate=false, saved=false;
  for(let attempt=0;attempt<3;attempt++) {
    const matches=(await rows("inbox_items",org)).filter(row=>row.platform==="linkedin" && identityOf(row)===notification.identity);
    if(matches.length!==1) throw Error(matches.length ? "Ambiguous relationship; manual review required." : "No existing LinkedIn relationship; manual review required.");
    matched=matches[0];
    const patch=notificationPatch(matched,notification);
    if(!patch) { duplicate=true; saved=true; break; }
    let query=supabaseAdmin.from("inbox_items").update(patch).eq("organisation_id",org).eq("id",matched.id);
    for(const field of ["raw","status","response_state","response_updated_at","last_replied_at"] as const) {
      query=matched[field]==null ? query.is(field,null) : query.eq(field, typeof matched[field]==="object" ? JSON.stringify(matched[field]) : matched[field]);
    }
    const {data,error}=await query.select("id");
    if(error) throw error;
    if(data?.length===1) { saved=true; break; }
  }
  if(!saved || !matched) throw Error("Relationship changed; retry notification intake.");
  // Replays repair a partial prior attempt; never reopen a handled inbox state.
  const targets=(await rows("growth_targets",org)).filter(row=>identityOf(row)===notification.identity && !row.linkedin_conversation_active);
  for(const target of targets) {
    const {error}=await supabaseAdmin.from("growth_targets").update({linkedin_conversation_active:true}).eq("organisation_id",org).eq("id",target.id);
    if(error) throw error;
  }
  return {itemId:matched.id,duplicate,cadenceSuspended:true};
}

/** Independent per-event outcomes let retries recover a partially imported digest. */
export async function ingestLinkedInNotifications(org: string, notifications: LinkedInMessageNotification[]) {
  const results: { eventKey: string; itemId?: string; duplicate?: boolean; error?: string }[] = [];
  for (const notification of notifications) {
    try { results.push({ eventKey: notificationEventKey(notification), ...await ingestLinkedInNotification(org, notification) }); }
    catch { results.push({ eventKey: notificationEventKey(notification), error: "Notification intake failed; retry or review the existing relationship." }); }
  }
  return results;
}

/** Explicit human disposition, not a sent receipt or classification of reply content. */
export async function resolveLinkedInNotification(org:string,actor:string,body:Record<string,unknown>) {
  if(typeof body.id!=="string" || typeof body.notificationId!=="string" || body.confirmed!==true || typeof body.evidence!=="string" || body.evidence.trim().length<10 || body.evidence.length>2000) throw Error("Confirm you have read and handled the reply, with evidence.");
  const {data:row,error}=await supabaseAdmin.from("inbox_items").select("*").eq("organisation_id",org).eq("id",body.id).maybeSingle();
  if(error || !row) throw Error("Reply not found.");
  const current=linkedInReplyNotification(row),raw=(row.raw || {}) as Record<string,unknown>;
  const sameMail = Array.isArray(raw.linkedin_message_notifications) ? raw.linkedin_message_notifications.filter(item => item && typeof item === "object" && (item as Record<string,unknown>).gmailMessageId === current?.gmailMessageId) : [];
  if(!current || (notificationEventKey(current as LinkedInMessageNotification)!==body.notificationId && !(current.gmailMessageId===body.notificationId && sameMail.length===1))) throw Error("A newer notification arrived; review it first.");
  if(!unresolvedLinkedInNotification(row)) return {duplicate:true};
  const history=Array.isArray(raw.linkedin_reply_dispositions) ? raw.linkedin_reply_dispositions : [];
  const confirmedAt=new Date().toISOString();
  let query=supabaseAdmin.from("inbox_items").update({response_state:"no_reply_needed",response_updated_at:confirmedAt,
    raw:{...raw,linkedin_reply_dispositions:[...history,{gmailMessageId:current.gmailMessageId,eventKey:notificationEventKey(current as LinkedInMessageNotification),actor,confirmedAt,evidence:body.evidence,source:"manual LinkedIn reply disposition"}]}}).eq("organisation_id",org).eq("id",row.id);
  for(const field of ["raw","response_state","response_updated_at","last_replied_at"] as const) query=row[field]==null ? query.is(field,null) : query.eq(field,typeof row[field]==="object" ? JSON.stringify(row[field]) : row[field]);
  const result=await query.select("id");
  if(result.error || result.data?.length!==1) throw Error("Reply evidence changed; reload before marking handled.");
  return {duplicate:false};
}
