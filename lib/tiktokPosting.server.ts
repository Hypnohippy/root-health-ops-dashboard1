import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { creatorFields, grantedTikTokScopes, tikTokOutcome, tikTokPostInfo, type TikTokSettings } from "@/lib/tiktokPosting";
import { videoDurationSeconds } from "@/lib/videoDuration";
import { randomUUID } from "node:crypto";

type Json = Record<string, unknown>;
type Account = { id: string; page_id: string; page_access_token: string; token_expires_at: string | null; meta: Json | null };
export type TikTokReceipt = { requestKey: string; mode: "direct" | "draft"; accountId: string; acceptedAt: string; publishId?: string; providerStatus: string; postIds?: string[]; published?: boolean; caption?: string; privacyLevel?: string; uploadAccepted?: boolean };
type Post = { id: string; message: string; platforms: string[]; meta: Json | null };
export class TikTokError extends Error {
  constructor(message: string, public code = "tiktok_unavailable", public status = 400, public reconnectRequired = false) { super(message); }
}
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
export async function tikTokSession(org: string) {
  const { data, error } = await supabaseAdmin.from("social_accounts").select("id,page_id,page_access_token,token_expires_at,meta").eq("organisation_id", org).eq("platform", "tiktok").eq("is_active", true).limit(1).maybeSingle();
  if (error) throw new TikTokError("Could not read the TikTok connection.", "connection_read_failed", 503);
  const account = data as Account | null;
  if (!account?.page_access_token) throw new TikTokError("Reconnect TikTok on Connect before posting.", "not_connected", 409, true);
  let token = account.page_access_token, meta = object(account.meta), refreshed = false;
  async function refresh() {
    const refreshToken = String(meta.refresh_token || object(meta.raw_refresh).refresh_token || object(meta.raw_token).refresh_token || "");
    if (refreshed || !refreshToken || !process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) throw new TikTokError("TikTok access expired. Reconnect TikTok to continue.", "access_token_invalid", 409, true);
    refreshed = true;
    const form = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: refreshToken });
    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store", signal: AbortSignal.timeout(20000) });
    const json = object(await response.json()), result = typeof json.access_token === "string" ? json : object(json.data);
    if (!response.ok || typeof result.access_token !== "string" || !result.access_token) throw new TikTokError("TikTok token refresh failed. Reconnect TikTok.", "refresh_failed", 409, true);
    token = result.access_token;
    meta = { ...meta, refresh_token: typeof result.refresh_token === "string" && result.refresh_token ? result.refresh_token : refreshToken,
      ...(typeof result.scope === "string" ? { scopes: result.scope.split(/[,\s]+/).filter(Boolean) } : {}) };
    const expires = Number(result.expires_in);
    const { error: saveError } = await supabaseAdmin.from("social_accounts").update({ page_access_token: token, token_expires_at: expires > 0 ? new Date(Date.now() + expires * 1000).toISOString() : account!.token_expires_at, meta, updated_at: new Date().toISOString() }).eq("id", account!.id).eq("organisation_id", org).eq("platform", "tiktok");
    if (saveError) throw new TikTokError("Could not save refreshed TikTok access. Reconnect before posting.", "refresh_save_failed", 503, true);
  }
  async function api(path: string, body: Json = {}): Promise<Json> {
    if (!refreshed && account!.token_expires_at && Date.parse(account!.token_expires_at) <= Date.now() + 60000) await refresh();
    const response = await fetch(`https://open.tiktokapis.com/v2/post/publish/${path}/`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000) });
    const json = object(await response.json()), error = object(json.error), code = String(error.code || "invalid_response");
    // Only a definitive token rejection permits retrying an init; never retry ambiguous failures.
    if (code === "access_token_invalid" && !refreshed) { await refresh(); return api(path, body); }
    if (!response.ok || code !== "ok") {
      const reconnect = ["scope_not_authorized", "access_token_invalid"].includes(code);
      throw new TikTokError(reconnect ? "Reconnect TikTok and approve video.publish for Direct Post (video.upload for draft upload)." : code === "unaudited_client_can_only_post_to_private_accounts" ? "TikTok requires this unaudited client to use a private account and Only me privacy. No draft fallback was attempted." : `TikTok could not complete this action (${code.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 100)}).`, code, reconnect ? 409 : 502, reconnect);
    }
    return object(json.data);
  }
  function requireScope(scope: string) {
    const scopes = grantedTikTokScopes(meta);
    if (scopes && !scopes.includes(scope)) throw new TikTokError(`Reconnect TikTok and approve ${scope}. The saved token does not include it.`, "scope_not_authorized", 409, true);
  }
  return { accountId: account.page_id, scopes: () => grantedTikTokScopes(meta), api, requireScope };
}
export async function getTikTokCreator(org: string) {
  const session = await tikTokSession(org); session.requireScope("video.publish");
  const creator = creatorFields(await session.api("creator_info/query"));
  return { creator, scopes: session.scopes(), videoPublishVerified: true, reconnectRequired: false, checkedAt: new Date().toISOString() };
}
export async function ownedTikTokPost(org: string, id: string): Promise<Post> {
  const { data, error } = await supabaseAdmin.from("scheduled_posts").select("id,message,platforms,meta").eq("id", id).eq("organisation_id", org).maybeSingle();
  if (error || !data) throw new TikTokError("Post not found in this organisation.", "post_not_found", 404);
  return data as Post;
}
async function saveReceipt(org: string, post: Post, receipt: TikTokReceipt) {
  const next = { ...object(post.meta), tiktok_post: receipt };
  let query = supabaseAdmin.from("scheduled_posts").update({ meta: next }).eq("id", post.id).eq("organisation_id", org);
  query = post.meta === null ? query.is("meta", null) : query.eq("meta", JSON.stringify(post.meta));
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) throw new TikTokError("Post changed or another TikTok request is running. Refresh status; do not upload again.", "post_changed", 409);
  post.meta = next;
}
function receiptOf(post: Post) { return object(post.meta).tiktok_post as TikTokReceipt | undefined; }
async function statusFor(org: string, post: Post, session: Awaited<ReturnType<typeof tikTokSession>>) {
  const receipt = receiptOf(post);
  if (!receipt) throw new TikTokError("No TikTok publish attempt is recorded for this post.", "missing_receipt", 404);
  if (receipt.accountId !== session.accountId) throw new TikTokError("This attempt belongs to a different TikTok account. Reconnect the original account to check status.", "account_changed", 409, true);
  if (!receipt.publishId) return { ...tikTokOutcome({ status: "INITIALIZATION_UNCERTAIN" }, receipt.mode), publishId: null, mode: receipt.mode, receipt, userMessage: "TikTok initialization is in progress or its outcome is uncertain. No second upload will be started. Check provider status before trying another post." };
  const data = await session.api("status/fetch", { publish_id: receipt.publishId }), outcome = tikTokOutcome(data, receipt.mode);
  const next = { ...receipt, providerStatus: outcome.providerStatus, published: outcome.published, postIds: outcome.postIds };
  await saveReceipt(org, post, next);
  if (post.platforms?.length === 1 && post.platforms[0] === "tiktok") {
    const { error } = await supabaseAdmin.from("scheduled_posts").update({ status: outcome.published ? "posted" : outcome.ok ? "pending" : "failed", posted_at: outcome.published ? new Date().toISOString() : null }).eq("id", post.id).eq("organisation_id", org);
    if (error) throw new TikTokError("Provider status was saved, but the Ops post status needs another refresh. Do not re-upload.", "status_save_failed", 503);
  }
  return { ...outcome, publishId: receipt.publishId, mode: receipt.mode, receipt: next };
}
export async function refreshTikTokPost(org: string, id: string, publishId?: string) {
  const post = await ownedTikTokPost(org, id);
  if (publishId && receiptOf(post)?.publishId !== publishId) throw new TikTokError("Publish ID does not belong to this post.", "publish_id_mismatch", 404);
  return statusFor(org, post, await tikTokSession(org));
}
async function downloadVideo(org: string, videoUrl: string) {
  const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid.local"), url = new URL(videoUrl);
  if (url.protocol !== "https:" || url.origin !== base.origin || url.username || url.password || !url.pathname.startsWith(`/storage/v1/object/public/public-media/uploads/org_${org}/`)) throw new TikTokError("Upload the video through Ops for this organisation before posting to TikTok.", "invalid_video_source");
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  const limit = 50 * 1024 * 1024;
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > limit) throw new TikTokError("Could not read this video. Ops supports uploads up to 50 MB.", "video_download_failed");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new TikTokError("Video exceeds the 50 MB Ops upload limit.", "video_too_large"); chunks.push(value); } } finally { await reader.cancel(); }
  if (!size) throw new TikTokError("The video file is empty.", "empty_video");
  const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  const contentType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(contentType)) throw new TikTokError("Use an MP4, MOV or WebM video.", "invalid_video_type");
  return { bytes, contentType, duration: videoDurationSeconds(bytes) };
}
export async function publishTikTokPost(org: string, id: string, settings?: TikTokSettings) {
  const post = await ownedTikTokPost(org, id), session = await tikTokSession(org), existing = receiptOf(post);
  if (existing && !(settings?.consent === true && ["INIT_REJECTED", "FAILED"].includes(existing.providerStatus))) return statusFor(org, post, session);
  // Never convert legacy inbox receipts into another upload.
  const legacy = object(object(post.meta).tiktok_inbox_upload);
  if (legacy.publishId) return { ...tikTokOutcome({ status: legacy.published ? "PUBLISH_COMPLETE" : "SEND_TO_USER_INBOX" }, "draft"), mode: "draft", publishId: String(legacy.publishId), receipt: null };
  if (!settings || !["direct", "draft"].includes(settings.mode) || settings.consent !== true) throw new TikTokError("Review TikTok settings and explicitly choose Direct Post or draft upload before sending.", "settings_required", 409);
  session.requireScope(settings.mode === "direct" ? "video.publish" : "video.upload");
  const creator = settings.mode === "direct" ? creatorFields(await session.api("creator_info/query")) : null;
  const postInfo = creator ? tikTokPostInfo(settings, creator) : null;
  const video = await downloadVideo(org, String(object(post.meta).video_url || ""));
  if (creator && video.duration > creator.max_video_post_duration_sec) throw new TikTokError(`This video is ${Math.ceil(video.duration)} seconds; TikTok allows at most ${creator.max_video_post_duration_sec} seconds for this creator.`, "video_too_long");
  let receipt: TikTokReceipt = { requestKey: randomUUID(), mode: settings.mode, accountId: session.accountId, acceptedAt: new Date().toISOString(), providerStatus: "INITIALIZING", caption: settings.caption ?? post.message, ...(creator ? { privacyLevel: settings.privacyLevel } : {}) };
  await saveReceipt(org, post, receipt); // CAS claim BEFORE the provider can accept anything.
  let init: Json;
  try { init = await session.api(settings.mode === "direct" ? "video/init" : "inbox/video/init", { ...(postInfo ? { post_info: postInfo } : {}), source_info: { source: "FILE_UPLOAD", video_size: video.bytes.length, chunk_size: video.bytes.length, total_chunk_count: 1 } }); }
  catch (error) {
    // Explicit provider rejection proves no init was accepted. Ambiguous network errors remain locked.
    if (error instanceof TikTokError) { receipt = { ...receipt, providerStatus: "INIT_REJECTED" }; await saveReceipt(org, post, receipt); }
    throw error;
  }
  if (typeof init.publish_id !== "string" || typeof init.upload_url !== "string") throw new TikTokError("TikTok did not return a usable upload receipt. Do not start another upload.", "invalid_init", 502);
  receipt = { ...receipt, publishId: init.publish_id, providerStatus: "PROCESSING_UPLOAD" };
  await saveReceipt(org, post, receipt); // Persist publish_id before PUT; retry only fetches status.
  const upload = new URL(init.upload_url);
  if (upload.protocol !== "https:" || !(upload.hostname === "tiktokapis.com" || upload.hostname.endsWith(".tiktokapis.com")) || upload.username || upload.password) throw new TikTokError("TikTok returned an invalid upload destination. No video was transferred.", "invalid_upload_url", 502);
  try {
    const response = await fetch(upload, { method: "PUT", headers: { "Content-Type": video.contentType, "Content-Length": String(video.bytes.length), "Content-Range": `bytes 0-${video.bytes.length - 1}/${video.bytes.length}` }, body: video.bytes as BodyInit, redirect: "error", signal: AbortSignal.timeout(60000) });
    if (!response.ok) return { ...tikTokOutcome({ status: "UPLOAD_UNCERTAIN" }, receipt.mode), publishId: receipt.publishId, mode: receipt.mode, receipt, userMessage: "TikTok did not confirm the transfer. Refresh status; do not re-upload this attempt." };
    receipt = { ...receipt, uploadAccepted: true }; await saveReceipt(org, post, receipt);
  } catch { return { ...tikTokOutcome({ status: "UPLOAD_UNCERTAIN" }, receipt.mode), publishId: receipt.publishId, mode: receipt.mode, receipt, userMessage: "Upload outcome is uncertain. Refresh status; no duplicate transfer will be made." }; }
  try { return await statusFor(org, post, session); }
  catch { return { ...tikTokOutcome({ status: "PROCESSING_UPLOAD" }, receipt.mode), publishId: receipt.publishId, mode: receipt.mode, receipt, userMessage: receipt.mode === "direct" ? "Direct Post upload accepted. Status is temporarily unavailable; refresh status, do not upload again." : "Draft upload accepted. Check status or finish the existing draft in TikTok inbox; do not upload again." }; }
}
