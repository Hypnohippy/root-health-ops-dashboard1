import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AcquisitionWorkflowError } from "@/lib/acquisitionWorkflow";
import { personalDistributionKind, type PersonalPerformance } from "@/lib/personalDistribution";
import type { PersonalSignalItem } from "@/lib/personalSignal";

type Item = PersonalSignalItem & { id: string; organisation_id: string };
export function personalPublishingId(organisationId: string, acquisitionId: string) {
  const hex = createHash("sha256").update(`personal-distribution:v1:${organisationId}:${acquisitionId}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function personalAttribution(item: Item) {
  return { acquisition_id: item.id, campaign_id: `pa-${item.id}`, asset_id: personalPublishingId(item.organisation_id, item.id),
    source_engine: item.source_engine, source_record_id: item.source_record_id,
    action_type: personalDistributionKind(item), theme: item.signal || null, asset_type: "social_post" };
}
export function capacityCheckCTA(item: Item, platform: string) {
  const a = personalAttribution(item);
  const url = new URL("https://www.roothealth.app/capacity-check");
  url.search = new URLSearchParams({ acquisition_id: a.acquisition_id, asset_id: a.asset_id,
    utm_source: platform, utm_medium: "social", utm_campaign: a.campaign_id, utm_content: a.asset_id }).toString();
  return url.href;
}
export function planPersonalPublishing(item: Item, input: unknown, userId: string) {
  if (personalDistributionKind(item) !== "SOCIAL_CONTENT") throw new AcquisitionWorkflowError("Only a verified Content Signal can create this social content draft.");
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const platform = String(value.platform || "").toLowerCase();
  if (!["linkedin", "facebook", "threads"].includes(platform)) throw new AcquisitionWorkflowError("Choose a supported text publishing channel.");
  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (!message || message.length > (platform === "threads" ? 350 : 2500)) throw new AcquisitionWorkflowError("Add a standalone content draft within the channel limit.");
  if (item.source_url && message.includes(item.source_url)) throw new AcquisitionWorkflowError("Do not publish the individual's source discussion in standalone content.");
  const attribution = personalAttribution(item);
  const finalMessage = `${message}\n\nExplore the Root Capacity Check: ${capacityCheckCTA(item, platform)}`;
  if (platform === "threads" && finalMessage.length > 500) throw new AcquisitionWorkflowError("Shorten the Threads draft: content and tagged link must fit within 500 characters.");
  return { id: attribution.asset_id, organisation_id: item.organisation_id,
    message: finalMessage, platforms: [platform],
    // Reuse the existing pending state, outside both scheduled dispatcher filters.
    status: "pending", scheduled_for: new Date().toISOString(),
    meta: { personal_acquisition: attribution, approvals: { state: "pending", source: "personal_acquisition", created_at: new Date().toISOString() },
      created_by: { user_id: userId }, requires_manual_publish: true }, source: "personal_acquisition" };
}
export async function routePersonalPublishing(db: SupabaseClient, item: Item, input: unknown, userId: string) {
  const row = planPersonalPublishing(item, input, userId);
  const read = () => db.from("scheduled_posts").select("id,organisation_id,meta,status").eq("id", row.id).eq("organisation_id", item.organisation_id).maybeSingle();
  let result = await read();
  if (result.error) throw result.error;
  if (!result.data) {
    const created = await db.from("scheduled_posts").insert(row).select("id,organisation_id,meta,status").single();
    if (created.error && created.error.code !== "23505") throw created.error;
    result = created.error ? await read() : created;
  }
  if (result.error) throw result.error;
  if (!result.data || result.data.meta?.personal_acquisition?.acquisition_id !== item.id || result.data.meta?.personal_acquisition?.source_record_id !== item.source_record_id) throw new AcquisitionWorkflowError("Publishing identity conflict. No existing draft was replaced.", 409);
  return result.data;
}
const funnelNames = ["capacity_check_viewed", "capacity_check_started", "capacity_check_completed", "signup_started", "signup_completed", "subscription_started"];
export function publishingProgress(post: { status: string; posted_at?: string | null; meta?: { publish?: { mode?: string }; approvals?: { state?: string } }; error_info?: { results?: { ok?: boolean; postedId?: string; platform?: string; skipped?: boolean }[] } | null }) {
  if (post.status === "posted") {
    const verified = post.meta?.publish?.mode !== "simulate" && Boolean(post.posted_at && Number.isFinite(Date.parse(post.posted_at))) &&
      post.error_info?.results?.some(result => result.ok === true && !result.skipped && ["linkedin", "facebook", "threads"].includes(result.platform || "") && typeof result.postedId === "string" && result.postedId.length > 0);
    return verified ? "Published" : "Publication unverified";
  }
  if (post.status === "pending") return post.meta?.approvals?.state === "approved" ? "Approved — awaiting manual publication" : "Pending approval";
  return ({ queued: "Queued", scheduled: "Scheduled", failed: "Publication failed" } as Record<string, string>)[post.status] || "Publication not observed";
}
export async function personalPerformance(db: SupabaseClient, organisationId: string, items: Item[]) {
  const selected = items.filter(item => personalDistributionKind(item) === "SOCIAL_CONTENT" || personalDistributionKind(item) === "SEARCH_ASSET");
  const results: Record<string, PersonalPerformance> = {};
  for (const item of selected) results[item.id] = { publishing: null, funnel: null };
  if (!selected.length) return results;
  const { data, error } = await db.from("scheduled_posts").select("id,status,meta,posted_at,error_info").eq("organisation_id", organisationId)
    .in("id", selected.map(item => personalPublishingId(organisationId, item.id)));
  if (!error) for (const post of data || []) {
    const id = post.meta?.personal_acquisition?.acquisition_id;
    if (results[id]) results[id].publishing = { id: post.id, status: publishingProgress(post), approval: post.meta?.approvals?.state || null };
  }
  // Cross-project authentication follows existing server bearer-token integrations.
  const endpoint = process.env.ROOT_PERSONAL_ACQUISITION_URL;
  const token = process.env.ROOT_PERSONAL_ACQUISITION_TOKEN;
  if (!endpoint || !token) return results;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) return results;
    const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(3000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ acquisitionIds: selected.map(item => item.id) }) });
    if (!response.ok) return results;
    const body = await response.json();
    if (body.available !== true || !Array.isArray(body.counts)) return results;
    for (const row of body.counts) if (results[row.acquisition_id] && funnelNames.every(name => Number.isSafeInteger(row[name]) && row[name] >= 0)) {
      results[row.acquisition_id].funnel = Object.fromEntries(funnelNames.map(name => [name, row[name]]));
    }
  } catch { /* Missing configuration/storage/network is unavailable, never zero. */ }
  return results;
}
