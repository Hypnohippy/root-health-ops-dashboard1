import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { GenerationProfile } from "@/lib/tenantGeneration";
import { canonicalLinkedInProfile } from "@/lib/growthOutreach";
import { interactionTypeFor, messageTypeLabel, objectiveFor, plainSource, plainStage, profileFit, type ResponseContactContext } from "@/lib/responseContactContext";

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const date = (value: unknown) => text(value) ? new Date(String(value)).toLocaleDateString("en-GB") : null;
const companyFromHeadline = (headline: string) => headline.match(/\bat\s+([^|·,]+)/i)?.[1]?.trim() || null;

export async function getResponseContactContext(organisationId: string, itemId: string, profile: GenerationProfile): Promise<ResponseContactContext> {
  const { data: item, error } = await supabaseAdmin.from("inbox_items").select("id,platform,kind,status,author_name,author_handle,text,permalink,post_text,created_at_platform,inserted_at,last_reply_text,last_replied_at,response_state,source_engine,email_classification,outreach_reference")
    .eq("id", itemId).eq("organisation_id", organisationId).maybeSingle();
  if (error) throw error; if (!item) throw new Error("Response item not found.");
  const identity = canonicalLinkedInProfile(item.permalink || "");
  const [{ data: targets, error: targetError }, { data: acquisitions, error: acquisitionError }] = await Promise.all([
    supabaseAdmin.from("growth_targets").select("id,target_name,company,role_title,linkedin_url,linkedin_identity,stage,status,last_action_at,reply_status,replied_at,reply_notes,deal_stage,call_outcome,notes,acquisition_item_id,source_type,source_record_id").eq("organisation_id", organisationId).limit(500),
    supabaseAdmin.from("acquisition_items").select("id,source_engine,source_record_id,source_url,evidence,entity,person,company,reason,signal,suggested_action,status,current_action,actioned_at,outcome,outcome_at,metadata").eq("organisation_id", organisationId).limit(500),
  ]);
  if (targetError || acquisitionError) throw targetError || acquisitionError;
  const target = (targets || []).find(row => identity && [row.linkedin_identity, canonicalLinkedInProfile(row.linkedin_url || "")].includes(identity)) || null;
  const acquisition = (acquisitions || []).find(row => (target?.acquisition_item_id && row.id === target.acquisition_item_id) || (identity && canonicalLinkedInProfile(row.source_url || "") === identity)) || null;
  const { data: acquisitionEvents, error: eventError } = acquisition ? await supabaseAdmin.from("acquisition_item_events").select("action,new_status,outcome,note,created_at").eq("organisation_id", organisationId).eq("acquisition_item_id", acquisition.id).order("created_at", { ascending: false }).limit(10) : { data: [], error: null };
  if (eventError) throw eventError;
  const metadata = acquisition?.metadata && typeof acquisition.metadata === "object" ? acquisition.metadata as Record<string,unknown> : {};
  const role = text(target?.role_title) || text(metadata.headline) || text(item.author_handle) || text(item.post_text);
  const company = text(target?.company) || text(acquisition?.company) || text(metadata.company) || companyFromHeadline(role || "");
  const sector = text(metadata.sector);
  const fit = profileFit(role || "", company || "", profile);
  const type = interactionTypeFor(item, target);
  const hasSignal = Boolean(text(acquisition?.signal) || ["positive","interested","engaged","call_booked"].includes(target?.reply_status || "") || ["opportunity","meeting","converted","won"].includes(target?.deal_stage || ""));
  const history = [
    item.kind === "connection_accepted" ? `New LinkedIn connection. This person accepted your connection request${date(item.created_at_platform || item.inserted_at) ? ` on ${date(item.created_at_platform || item.inserted_at)}` : ""}. No earlier conversation is recorded.` : null,
    target?.last_action_at ? `${plainStage(target.stage) || "Previous outreach"} — last action ${date(target.last_action_at)}.` : null,
    target?.replied_at ? `Reply recorded ${date(target.replied_at)}${text(target.reply_notes) ? `: ${text(target.reply_notes)}` : "."}` : null,
    text(item.last_reply_text) ? `Last response sent: ${text(item.last_reply_text)}` : null,
    ...(acquisitionEvents || []).map(event => `${String(event.action || "Queue action").replaceAll("_", " ")} on ${date(event.created_at) || "an unknown date"}${text(event.note) ? `: ${text(event.note)}` : ""}${text(event.outcome) ? ` — ${text(event.outcome)}` : ""}.`),
  ].filter(Boolean) as string[];
  const known = [text(acquisition?.reason), text(acquisition?.signal), text(acquisition?.evidence), text(target?.notes), text(target?.reply_notes), text(item.outreach_reference)].filter(Boolean) as string[];
  const relevance = fit.length ? `Their recorded role or company context matches the saved target profile (${fit.join(", ")}).` : acquisition?.reason ? String(acquisition.reason) : `No explicit Growth Profile match is recorded${role || company ? "; the available role and company context is shown for human review" : " because role and company detail is incomplete"}.`;
  return {
    interactionType: type, messageType: messageTypeLabel(type), name: text(target?.target_name) || text(acquisition?.person) || text(item.author_name), role, company, sector,
    source: plainSource(acquisition?.source_engine || target?.source_type || item.source_engine, item.kind), whyRelevant: relevance,
    relationship: history[0] || "No earlier relationship event is recorded.", latestEvent: text(item.text) || "No event text was recorded.", whatWeKnow: known.slice(0, 4), history,
    lastAction: target?.last_action_at ? `${plainStage(target.stage) || "Outreach action"} on ${date(target.last_action_at)}` : null,
    currentStage: plainStage(target?.stage) || messageTypeLabel(type), buyingSignal: hasSignal ? "actual" : (fit.length || acquisition ? "strategic_fit" : "unknown"),
    buyingSignalLabel: hasSignal ? "A recorded signal or response exists." : fit.length || acquisition ? "Strategic fit only; no explicit buying signal is recorded." : "No buying signal or confirmed strategic fit is recorded.",
    objective: objectiveFor(type, hasSignal),
  };
}
