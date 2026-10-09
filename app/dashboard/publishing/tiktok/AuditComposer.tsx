"use client";
import { useCallback, useEffect, useState } from "react";
import MediaDropzone from "@/app/dashboard/components/MediaDropzone";
import type { TikTokCreator, TikTokSettings } from "@/lib/tiktokPosting";

type Result = { ok?: boolean; error?: string; userMessage?: string; pending?: boolean; published?: boolean; manualCompletionRequired?: boolean; publishId?: string; providerStatus?: string; postId?: string; mode?: string; receipt?: { providerStatus?: string; publishId?: string }; results?: Result[] };
const initial: TikTokSettings = { mode: "direct", privacyLevel: "", allowComment: false, allowDuet: false, allowStitch: false, caption: "", brandOrganic: false, brandContent: false, consent: false };
const input = "rounded border border-white/25 bg-slate-950 p-2";
export default function TikTokComposer() {
  const [org, setOrg] = useState("");
  const [postId, setPostId] = useState("");
  const [creator, setCreator] = useState<TikTokCreator | null>(null);
  const [scopes, setScopes] = useState<string[] | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [video, setVideo] = useState("");
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setOrg(query.get("organisationId") || ""); setPostId(query.get("postId") || "");
    if (!query.get("organisationId")) {
      void fetch("/api/social-accounts").then(r => r.json()).then(data => { if (data.organisationId) setOrg(data.organisationId); }).catch(() => setError("Could not resolve your workspace. Open this page from Publishing."));
    }
  }, []);
  const loadCreator = useCallback(async () => {
    if (!org) return;
    setBusy("creator"); setError("");
    try {
      const response = await fetch(`/api/tiktok/creator-info?organisationId=${encodeURIComponent(org)}`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
      const data = await response.json(); setReconnect(data.reconnectRequired === true);
      if (!response.ok || !data.ok) throw Error(data.error || "Creator info unavailable.");
      setCreator(data.creator); setScopes(data.scopes);
      setSettings(current => ({ ...current, privacyLevel: data.creator.privacy_level_options.includes(current.privacyLevel) ? current.privacyLevel : "", allowComment: data.creator.comment_disabled ? false : current.allowComment, allowDuet: data.creator.duet_disabled ? false : current.allowDuet, allowStitch: data.creator.stitch_disabled ? false : current.allowStitch }));
    } catch (e) { setCreator(null); setError(e instanceof Error ? e.message : "Creator info unavailable."); }
    finally { setBusy(""); }
  }, [org]);
  useEffect(() => { void loadCreator(); }, [loadCreator]);
  useEffect(() => {
    if (!org || !postId) return;
    let active = true;
    void fetch(`/api/tiktok/direct-post?organisationId=${encodeURIComponent(org)}&postId=${encodeURIComponent(postId)}`, { cache: "no-store" }).then(r => r.json()).then(data => {
      if (!active) return; if (!data.ok) throw Error(data.error);
      setVideo(data.videoUrl); setSettings(current => ({ ...current, caption: data.message || "" }));
      if (data.receipt) setResult({ pending: !["PUBLISH_COMPLETE", "FAILED", "INIT_REJECTED"].includes(data.receipt.providerStatus), published: data.receipt.providerStatus === "PUBLISH_COMPLETE", receipt: data.receipt, publishId: data.receipt.publishId, providerStatus: data.receipt.providerStatus });
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Post unavailable."); });
    return () => { active = false; };
  }, [org, postId]);
  const refreshStatus = useCallback(async () => {
    if (!org || !postId) return;
    setBusy("status"); setError("");
    try {
      const response = await fetch("/api/tiktok/direct-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: org, postId }), signal: AbortSignal.timeout(30000) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || "Status unavailable.");
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Status unavailable. Do not upload again."); }
    finally { setBusy(""); }
  }, [org, postId]);
  useEffect(() => {
    if (!result?.pending || !result.publishId || result.manualCompletionRequired || polls >= 12 || busy) return;
    const timer = setTimeout(() => { setPolls(p => p + 1); void refreshStatus(); }, 5000);
    return () => clearTimeout(timer);
  }, [result, polls, busy, refreshStatus]);
  async function submit() {
    setBusy("publish"); setError("");
    try {
      let id = postId;
      if (!id) {
        const prepared = await fetch("/api/tiktok/direct-post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: org, action: "prepare", message: settings.caption, videoUrl: video }), signal: AbortSignal.timeout(30000) });
        const data = await prepared.json(); if (!prepared.ok || !data.ok) throw Error(data.error || "Could not prepare post.");
        id = data.postId; setPostId(id);
        window.history.replaceState(null, "", `?organisationId=${encodeURIComponent(org)}&postId=${encodeURIComponent(id)}`);
      }
      const response = await fetch("/api/tiktok/direct-post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: org, postId: id, settings }), signal: AbortSignal.timeout(125000) });
      const data = await response.json(), tk = data;
      if (!response.ok || !tk) throw Error(data.error || "Request outcome uncertain. Refresh status; do not upload again.");
      setResult({ ...tk.details, ...tk }); setPolls(0);
      if (!tk.ok) { setReconnect(tk.details?.reconnectRequired === true); setError(tk.error || tk.userMessage || "TikTok could not publish."); }
    } catch (e) { setError(e instanceof Error ? e.message : "Request outcome uncertain. Refresh status before retrying."); }
    finally { setBusy(""); }
  }
  const change = <K extends keyof TikTokSettings>(key: K, value: TikTokSettings[K]) => setSettings(current => ({ ...current, [key]: value }));
  const locked = !!result?.publishId && !["FAILED", "INIT_REJECTED"].includes(result.providerStatus || result.receipt?.providerStatus || "");
  const ready = !!org && !!video && settings.consent && !busy && !locked && (settings.mode === "draft" || !!creator && creator.privacy_level_options.includes(settings.privacyLevel)) && !(settings.brandContent && settings.privacyLevel === "SELF_ONLY");
  return <main className="mx-auto max-w-3xl space-y-5 p-6 text-slate-100">
    <a href={`/dashboard/publishing${org ? `?organisationId=${encodeURIComponent(org)}` : ""}`} className="underline">Back to Publishing</a>
    <h1 className="text-2xl font-semibold">Post to TikTok</h1>
    <p>Review your video, caption and account settings. TikTok may take a few minutes to process a post.</p>
    <section aria-label="TikTok connection" className="space-y-2 rounded border border-white/20 p-4">
      <p>{creator ? `Direct Post available for ${creator.creator_nickname} (@${creator.creator_username})` : "Direct Post access needs checking."}</p>
      {scopes && <p className="text-sm">Connected token scopes: {scopes.join(", ")}</p>}
      {creator && <p>Maximum video duration: {creator.max_video_post_duration_sec} seconds.</p>}
      {creator?.privacy_level_options.length === 1 && creator.privacy_level_options[0] === "SELF_ONLY" && <p>Only me is available. This is private/test posting, not public posting.</p>}
      <p className="text-sm">TikTok can restrict unaudited clients to private accounts and Only me posting, even when a public privacy option is returned.</p>
      <button className={input} disabled={!!busy} onClick={() => void loadCreator()}>Refresh creator settings</button>
      {reconnect && <a className="ml-3 underline" href={`/api/oauth/tiktok/start?organisationId=${encodeURIComponent(org)}`}>Reconnect TikTok with publishing permission</a>}
    </section>
    <label className="block">Posting mode <select className={`${input} ml-2`} value={settings.mode} disabled={locked || !!busy} onChange={e => change("mode", e.target.value as "direct" | "draft")}><option value="direct">Direct Post</option><option value="draft">Upload draft to TikTok — finish in inbox</option></select></label>
    {settings.mode === "draft" && <p>Intentional draft upload: you must finish this draft in TikTok inbox. Direct Post never falls back automatically.</p>}
    {!postId && <MediaDropzone organisationId={org || undefined} accept="video/mp4,video/quicktime,video/webm" disabled={!!busy || !org} onUploaded={media => { if (media.kind === "video") setVideo(media.url); else setError("TikTok requires a video."); }} />}
    {postId && <p className="text-sm">Saved Ops post: {postId}</p>}
    {video && <video src={video} controls preload="metadata" aria-label="TikTok video preview" className="max-h-80 w-full" />}
    <label className="block">Caption<textarea className={`${input} mt-1 min-h-28 w-full`} maxLength={2200} value={settings.caption} disabled={locked || !!busy} onChange={e => change("caption", e.target.value)} /></label>
    {settings.mode === "direct" && creator && <fieldset disabled={locked || !!busy} className="space-y-3 rounded border border-white/20 p-4"><legend>Creator-supported post settings</legend>
      <label className="block">Privacy <select className={`${input} ml-2`} value={settings.privacyLevel} onChange={e => change("privacyLevel", e.target.value)}><option value="">Select privacy</option>{creator.privacy_level_options.map(option => <option key={option} value={option}>{({ SELF_ONLY: "Only me (private)", PUBLIC_TO_EVERYONE: "Everyone (public)", MUTUAL_FOLLOW_FRIENDS: "Friends", FOLLOWER_OF_CREATOR: "Followers" } as Record<string, string>)[option] || option}</option>)}</select></label>
      {([ ["Comments", "allowComment", creator.comment_disabled], ["Duet", "allowDuet", creator.duet_disabled], ["Stitch", "allowStitch", creator.stitch_disabled] ] as const).map(([label, key, disabled]) => <label className="block" key={key}><input type="checkbox" checked={settings[key]} disabled={disabled} onChange={e => change(key, e.target.checked)} /> Allow {label}{disabled ? " — disabled by TikTok account settings" : ""}</label>)}
      <label className="block"><input type="checkbox" checked={settings.brandOrganic} onChange={e => change("brandOrganic", e.target.checked)} /> Promotes my own brand {settings.brandOrganic && "— will be labelled Promotional content"}</label>
      <label className="block"><input type="checkbox" checked={settings.brandContent} disabled={settings.privacyLevel === "SELF_ONLY"} onChange={e => change("brandContent", e.target.checked)} /> Paid partnership {settings.brandContent && "— will be labelled Paid partnership"}</label>
      <label className="block"><input type="checkbox" checked={settings.isAigc === true} onChange={e => change("isAigc", e.target.checked)} /> I confirm this video contains AI-generated content</label>
    </fieldset>}
    <label className="block"><input type="checkbox" checked={settings.consent} disabled={locked || !!busy} onChange={e => change("consent", e.target.checked)} /> I have reviewed this video and settings and consent to sending it to this TikTok account. By posting, I agree to TikTok’s <a className="underline" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>{settings.brandContent && <> and <a className="underline" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a></>}.</label>
    <div className="flex gap-3"><button className={`${input} bg-emerald-900`} disabled={!ready} onClick={() => void submit()}>{busy === "publish" ? "Sending to TikTok…" : settings.mode === "draft" ? "Upload draft to TikTok" : `Direct Post${settings.privacyLevel === "SELF_ONLY" ? " — Only me" : ""}`}</button>{postId && <button className={input} disabled={!!busy} onClick={() => void refreshStatus()}>Refresh publish status</button>}</div>
    {busy === "creator" && <p role="status">Loading latest TikTok creator settings…</p>}
    {error && <p role="alert" className="rounded border border-amber-400 p-3">{error}</p>}
    {result && <section aria-label="TikTok publish result" role="status" className="rounded border border-white/20 p-4"><p>{result.userMessage || (result.published ? "TikTok confirms publication." : "Refresh the saved status before any further upload.")}</p><p>Status: {result.providerStatus || result.receipt?.providerStatus || "Unknown"}</p>{result.publishId && <p>Publish ID: {result.publishId}</p>}{result.published && <p>Published: yes. Manual completion required: no.</p>}{result.pending && <p>Publication pending. Keep this saved post and refresh status later.</p>}</section>}
  </main>;
}
