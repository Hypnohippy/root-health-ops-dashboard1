import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { GenerationProfile } from "@/lib/tenantGeneration";
import { buildContactLifecycle } from "@/lib/contactLifecycle";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { presentResponseLifecycle } from "@/lib/responseLifecycle";
import { interactionTypeFor, messageTypeLabel, objectiveFor, plainSource, profileFit, type ResponseContactContext } from "@/lib/responseContactContext";

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const date = (value: unknown) => text(value) ? new Date(String(value)).toLocaleDateString("en-GB") : null;
const companyFromHeadline = (headline: string) => headline.match(/\bat\s+([^|·,]+)/i)?.[1]?.trim() || null;

export async function getResponseContactContext(organisationId: string, itemId: string, profile: GenerationProfile): Promise<ResponseContactContext> {
  const input = await readLifecycleInput(organisationId);
  const item = input.inbox_items.find(row => row.id === itemId && row.organisation_id === organisationId);
  if (!item) throw new Error("Response item not found.");
  const contact = buildContactLifecycle(organisationId, input).find(row => row.records.some(ref => ref.table === "inbox_items" && ref.id === itemId))!;
  const lifecycle = presentResponseLifecycle(contact, item);
  const target = input.growth_targets.find(row => row.organisation_id === organisationId && contact.records.some(ref => ref.table === "growth_targets" && ref.id === row.id)) || null;
  const acquisition = input.acquisition_items.find(row => row.organisation_id === organisationId && contact.records.some(ref => ref.table === "acquisition_items" && ref.id === row.id)) || null;
  const { data: acquisitionEvents, error: eventError } = acquisition ? await supabaseAdmin.from("acquisition_item_events").select("action,new_status,outcome,note,created_at").eq("organisation_id", organisationId).eq("acquisition_item_id", acquisition.id).order("created_at", { ascending: false }).limit(10) : { data: [], error: null };
  if (eventError) throw eventError;
  const metadata = acquisition?.metadata && typeof acquisition.metadata === "object" ? acquisition.metadata as Record<string,unknown> : {};
  const role = text(target?.role_title) || text(metadata.headline) || text(item.author_handle) || text(item.post_text);
  const company = text(target?.company) || text(acquisition?.company) || text(metadata.company) || companyFromHeadline(role || "");
  const sector = text(metadata.sector);
  const fit = profileFit(role || "", company || "", profile);
  const type = interactionTypeFor(item, lifecycle);
  const hasSignal = Boolean(text(acquisition?.signal) || ["positive","interested","engaged","call_booked"].includes(String(target?.reply_status || "")) || ["opportunity","meeting","converted","won"].includes(String(target?.deal_stage || "")));
  const history = [
    item.kind === "connection_accepted" ? `Accepted your LinkedIn connection${date(item.created_at_platform || item.inserted_at) ? ` on ${date(item.created_at_platform || item.inserted_at)}` : ""}.` : null,
    target?.last_action_at ? `Outreach action recorded on ${date(target.last_action_at)}.` : null,
    target?.replied_at ? `Reply recorded ${date(target.replied_at)}${text(target.reply_notes) ? `: ${text(target.reply_notes)}` : "."}` : null,
    text(item.last_reply_text) ? `Last response sent: ${text(item.last_reply_text)}` : null,
    ...(acquisitionEvents || []).map(event => `${String(event.action || "Queue action").replaceAll("_", " ")} on ${date(event.created_at) || "an unknown date"}${text(event.note) ? `: ${text(event.note)}` : ""}${text(event.outcome) ? ` — ${text(event.outcome)}` : ""}.`),
  ].filter(Boolean) as string[];
  const known = [text(acquisition?.reason), text(acquisition?.signal), text(acquisition?.evidence), text(target?.notes), text(target?.reply_notes), text(item.outreach_reference)].filter(Boolean) as string[];
  const relevance = fit.length ? `Their recorded role or company context matches the saved target profile (${fit.join(", ")}).` : acquisition?.reason ? String(acquisition.reason) : `No explicit Growth Profile match is recorded${role || company ? "; the available role and company context is shown for human review" : " because role and company detail is incomplete"}.`;
  return {
    interactionType: type, messageType: messageTypeLabel(type), name: text(target?.target_name) || text(acquisition?.person) || text(item.author_name), role, company, sector,
    source: plainSource(text(acquisition?.source_engine || target?.source_type || item.source_engine), text(item.kind)), whyRelevant: relevance,
    relationship: lifecycle.label, latestEvent: text(item.text) || "No event text was recorded.", whatWeKnow: known.slice(0, 4), history,
    lifecycle,
    lastAction: lifecycle.lastAction ? `${lifecycle.lastAction.action.replaceAll("_", " ")}${lifecycle.lastAction.at ? ` on ${date(lifecycle.lastAction.at)}` : ""}` : null,
    currentStage: lifecycle.label, buyingSignal: hasSignal ? "actual" : (fit.length || acquisition ? "strategic_fit" : "unknown"),
    buyingSignalLabel: hasSignal ? "A recorded signal or response exists." : fit.length || acquisition ? "Strategic fit only; no explicit buying signal is recorded." : "No buying signal or confirmed strategic fit is recorded.",
    objective: objectiveFor(type, hasSignal),
  };
}
