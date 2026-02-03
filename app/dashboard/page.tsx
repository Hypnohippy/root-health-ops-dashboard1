"use client";

import React, { useEffect, useMemo, useState } from "react";
import MediaDropzone, { UploadedMedia } from "./components/MediaDropzone";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads";

type SocialAccountRow = {
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
  is_active?: boolean | null;
  connection_type?: string | null;
};

type QuickBlastResult = {
  success: boolean;
  organisationId?: string;
  userMessage?: string;
  note?: string;
  results?: any[];
  summary?: {
    attempted: number;
    ok: number;
    failed: number;
  };
  error?: string;
};

type AiVariant = {
  title: string;
  text: string;
  cta: string;
  hashtags: string[];
};

type AiResponse = {
  success: boolean;
  variants?: AiVariant[];
  error?: string;
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  facebook: "Facebook Page",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
  tiktok: "TikTok",
  google: "Google Business Profile",
  email: "Email",
  whatsapp: "WhatsApp",
};

const DRAFTS_KEY = "rootops_quickblast_drafts_v1";

type Draft = {
  id: string;
  savedAt: number;
  message: string;
  imageUrl: string;
  videoUrl: string;
  selectedPlatforms: ProviderId[];
};

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveDrafts(drafts: Draft[]) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 50)));
  } catch {}
}

function joinVariant(v: AiVariant) {
  const hash =
    Array.isArray(v.hashtags) && v.hashtags.length > 0
      ? `\n\n${v.hashtags.join(" ")}`
      : "";
  const cta = v.cta ? `\n\n${v.cta}` : "";
  return `${(v.text || "").trim()}${cta}${hash}`.trim();
}

function formatPlatformName(p: string) {
  const k = (p || "").toLowerCase().trim() as ProviderId;
  return PROVIDER_LABELS[k] || p;
}

function extractFriendlyError(item: any): string {
  const um = String(item?.userMessage || "").trim();
  if (um) return um;

  const metaUserMsg =
    item?.details?.error?.error_user_msg || item?.error?.error_user_msg;
  if (metaUserMsg) return String(metaUserMsg);

  const metaTitle =
    item?.details?.error?.error_user_title || item?.error?.error_user_title;
  const metaMessage =
    item?.details?.error?.message || item?.error?.message;
  if (metaTitle && metaMessage) return `${metaTitle}: ${metaMessage}`;
  if (metaMessage) return String(metaMessage);

  const err = item?.error;
  if (typeof err === "string" && err.trim()) return err.trim();

  if (err && typeof err === "object") {
    const msg = (err as any)?.message;
    if (msg) return String(msg);
  }

  const reason = String(item?.reason || "").trim();
  if (reason) return reason;

  return "Something went wrong. Try again in a minute.";
}

function friendlySuggestionForPlatform(platform: ProviderId, item: any) {
  const msg = extractFriendlyError(item).toLowerCase();

  if (platform === "instagram") {
    if (msg.includes("processing")) {
      return "Tip: Instagram can take 10–60s to process media. Try again after a short pause.";
    }
    if (msg.includes("image") || msg.includes("media") || msg.includes("ready")) {
      return "Tip: For Instagram video, upload an MP4 and make sure Video URL is set (not Image URL).";
    }
  }

  if (platform === "facebook") {
    if (msg.includes("limit how often") || msg.includes("spam")) {
      return "Tip: This is a temporary Meta rate-limit. Wait a bit (often 15–60 mins) then try again.";
    }
    if (msg.includes("invalid") || msg.includes("missing")) {
      return "Tip: Upload via the uploader so you get a clean direct URL.";
    }
  }

  if (platform === "threads") {
    if (msg.includes("permission")) {
      return "Tip: This usually means the app/token lacks permission for that content type (e.g., media).";
    }
  }

  if (platform === "linkedin") {
    if (msg.includes("duplicate")) {
      return "Tip: Change the first line or CTA slightly, then resend.";
    }
  }

  return null;
}

function isoForDateTimeLocal(dtLocal: string) {
  if (!dtLocal) return "";
  const d = new Date(dtLocal);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function defaultLocalDateTimePlus(minutes: number) {
  const d = new Date(Date.now() + minutes * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

type Mode = "now" | "approval";
type MediaMode = "auto" | "image" | "video";

function looksLikeVideoUrl(u: string) {
  const s = (u || "").trim().toLowerCase();
  if (!s) return false;
  return s.includes(".mp4") || s.includes(".mov") || s.includes(".webm");
}

function looksLikeImageUrl(u: string) {
  const s = (u || "").trim().toLowerCase();
  if (!s) return false;
  return (
    s.includes(".jpg") ||
    s.includes(".jpeg") ||
    s.includes(".png") ||
    s.includes(".webp") ||
    s.includes(".gif")
  );
}

export default function DashboardHomePage() {
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountRow[]>([]);
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  // AI composer
  const [aiSubject, setAiSubject] = useState("");
  const [aiTone, setAiTone] = useState("calm");
  const [aiLength, setAiLength] = useState("short");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVariants, setAiVariants] = useState<AiVariant[]>([]);

  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );

  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const [mediaMode, setMediaMode] = useState<MediaMode>("auto");

  const [selected, setSelected] = useState<ProviderId[]>([]);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<QuickBlastResult | null>(null);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);

  const [mode, setMode] = useState<Mode>("now");
  const [scheduledLocal, setScheduledLocal] = useState<string>(
    defaultLocalDateTimePlus(10)
  );

  const connectedPlatforms = useMemo(() => {
    const active = (socialAccounts || []).filter((r) => r.is_active !== false);
    return new Set(active.map((r) => r.platform));
  }, [socialAccounts]);

  const connectedCount = useMemo(
    () => connectedPlatforms.size,
    [connectedPlatforms]
  );

  const charCount = message.length;

  const lengthHint = useMemo(() => {
    if (charCount === 0) return "Write something";
    if (charCount <= 120) return "Great length";
    if (charCount <= 240) return "A bit long (still OK)";
    return "Very long — consider shortening";
  }, [charCount]);

  function togglePlatform(p: ProviderId) {
    setSelected((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p);
      return [...prev, p];
    });
  }

  async function loadSocialAccounts() {
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      const org =
        typeof data?.organisationId === "string"
          ? data.organisationId
          : typeof data?.organisation_id === "string"
          ? data.organisation_id
          : null;

      setOrganisationId(org);

      const rows: SocialAccountRow[] = data?.socialAccounts ?? [];
      setSocialAccounts(rows);
    } catch (e) {
      console.error("[dashboard] loadSocialAccounts failed", e);
      setSocialAccounts([]);
      setOrganisationId(null);
    } finally {
      setLoadingAccounts(false);
    }
  }

  function refreshChannels() {
    void loadSocialAccounts();
  }

  function saveForLater() {
    const d: Draft = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      message,
      imageUrl,
      videoUrl,
      selectedPlatforms: selected,
    };
    const next = [d, ...drafts];
    setDrafts(next);
    saveDrafts(next);
  }

  function restoreDraft(d: Draft) {
    setMessage(d.message || "");
    setImageUrl(d.imageUrl || "");
    setVideoUrl(d.videoUrl || "");
    setSelected(Array.isArray(d.selectedPlatforms) ? d.selectedPlatforms : []);
  }

  function deleteDraft(id: string) {
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    saveDrafts(next);
  }

  async function generateAiQuickBlast() {
    setAiBusy(true);
    setAiError(null);
    setAiVariants([]);

    try {
      const subject = aiSubject.trim();
      if (!subject) {
        setAiError(
          "Please type a subject first (e.g., 'coping with failure')."
        );
        return;
      }

      const res = await fetch("/api/ai/quick-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          tone: aiTone,
          length: aiLength,
          audience: "clients",
          platforms: selected,
        }),
      });

      const json: AiResponse = await res.json().catch(() => null as any);

      if (!res.ok) {
        setAiError((json as any)?.error || `AI request failed (${res.status})`);
        return;
      }

      const vars = Array.isArray((json as any)?.variants)
        ? (json as any).variants
        : [];
      if (vars.length === 0) {
        setAiError("AI returned no variants. Try Generate again.");
        return;
      }

      setAiVariants(vars);
    } catch (e: any) {
      setAiError(e?.message || "AI generation failed");
    } finally {
      setAiBusy(false);
    }
  }

  function effectiveMediaPayload() {
    const img = (imageUrl || "").trim();
    const vid = (videoUrl || "").trim();

    if (mediaMode === "image") {
      return { imageUrl: img, videoUrl: "" };
    }
    if (mediaMode === "video") {
      return { imageUrl: "", videoUrl: vid };
    }

    // auto
    // Prefer video if it looks like a video
    if (vid && looksLikeVideoUrl(vid)) return { imageUrl: "", videoUrl: vid };
    if (img && looksLikeImageUrl(img)) return { imageUrl: img, videoUrl: "" };

    // If both filled, prefer video (safer for your use-case)
    if (vid) return { imageUrl: "", videoUrl: vid };
    return { imageUrl: img, videoUrl: "" };
  }

  async function sendQuickBlastNow() {
    setSending(true);
    setResult(null);

    try {
      const media = effectiveMediaPayload();

      const res = await fetch("/api/social/quick-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          imageUrl: media.imageUrl,
          videoUrl: media.videoUrl,
          platforms: selected,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setResult({
          success: false,
          error: json?.error || `Request failed (${res.status})`,
          userMessage:
            json?.userMessage ||
            "We couldn’t send that just now. Try again in a minute.",
        });
        return;
      }

      const merged: QuickBlastResult = {
        ...(json || {}),
        userMessage:
          json?.userMessage ||
          (json?.success
            ? "Sent."
            : json?.error
            ? "Some posts didn’t send. See what to change below."
            : undefined),
      };

      setResult(merged);
    } catch (e: any) {
      setResult({
        success: false,
        error: e?.message || "Send failed",
        userMessage: "Network hiccup. Please try again (or refresh the page).",
      });
    } finally {
      setSending(false);
    }
  }

  async function queueForApproval() {
    setSending(true);
    setResult(null);

    try {
      if (!organisationId) {
        setResult({
          success: false,
          error: "Organisation not loaded yet.",
          userMessage: "Workspace not loaded yet. Refresh and try again.",
        });
        return;
      }

      const scheduledIso = isoForDateTimeLocal(scheduledLocal);
      if (!scheduledIso) {
        setResult({
          success: false,
          error: "Invalid schedule time.",
          userMessage: "That date/time doesn’t look valid. Pick a new time.",
        });
        return;
      }

      const media = effectiveMediaPayload();

      const res = await fetch("/api/social/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          platforms: selected,
          imageUrl: media.imageUrl,
          scheduledAt: scheduledIso,
          organisationId,
          meta: {
            approvals: {
              state: "pending",
              source: "quick_blast",
              created_at: new Date().toISOString(),
            },
            ...(media.videoUrl ? { video_url: media.videoUrl } : {}),
          },
          createdBy: {
            user_id: "owner",
            name: "Clinic Owner",
            email: null,
          },
        }),
      });

      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setResult({
          success: false,
          error: json?.error || `Request failed (${res.status})`,
          userMessage:
            json?.userMessage ||
            json?.message ||
            "We couldn’t queue that for approval just now. Try again in a minute.",
        });
        return;
      }

      setResult({
        success: true,
        organisationId,
        userMessage:
          "Queued for approval ✅ Head to Approvals to review and approve it (then Post now).",
        note: "Tip: This is exactly the ‘clinic workflow’ feel — author → approvals → publish.",
      });
    } catch (e: any) {
      setResult({
        success: false,
        error: e?.message || "Queue failed",
        userMessage: "Network hiccup. Please try again (or refresh the page).",
      });
    } finally {
      setSending(false);
    }
  }

  async function sendQuickBlast() {
    if (mode === "now") return sendQuickBlastNow();
    return queueForApproval();
  }

  useEffect(() => {
    void loadSocialAccounts();
    setDrafts(loadDrafts());
  }, []);

  useEffect(() => {
    if (selected.length > 0) return;
    const defaults = socialAccounts
      .map((r) => r.platform)
      .filter((p) => connectedPlatforms.has(p));
    if (defaults.length > 0) setSelected(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAccounts, socialAccounts]);

  const channelCards: ProviderId[] = [
    "facebook",
    "linkedin",
    "instagram",
    "threads",
    "tiktok",
    "google",
    "email",
    "whatsapp",
  ];

  const friendlySummary = useMemo(() => {
    if (!result) return null;

    const attempted = result.summary?.attempted ?? (result.results?.length || 0);
    const ok =
      result.summary?.ok ??
      (result.results || []).filter((r: any) => r?.ok).length;
    const failed =
      result.summary?.failed ??
      (result.results || []).filter((r: any) => r && !r.ok && !r.skipped).length;

    const headline = result.success
      ? attempted > 0
        ? `Sent successfully (${ok}/${attempted}).`
        : "Success."
      : failed > 0
      ? `Some channels didn’t send (${ok}/${attempted}).`
      : "No channels sent.";

    const topMsg =
      result.userMessage ||
      (result.success
        ? "Nice — you’re live."
        : "No stress — we’ll fix what’s blocking it.");

    return { attempted, ok, failed, headline, topMsg };
  }, [result]);

  const onUploadedQuickBlast = (m: UploadedMedia) => {
    const url = String(m?.url || "").trim();
    if (!url) return;

    const ct = String(m?.contentType || "").toLowerCase();
    const kind = String((m as any)?.kind || "").toLowerCase();

    const isVideo =
      kind === "video" ||
      ct.startsWith("video/") ||
      looksLikeVideoUrl(url);

    const isImage =
      kind === "image" ||
      ct.startsWith("image/") ||
      looksLikeImageUrl(url);

    // Prefer video if ambiguous
    if (isVideo && !isImage) {
      setVideoUrl(url);
      setImageUrl("");
      setMediaMode("video");
      return;
    }

    if (isImage && !isVideo) {
      setImageUrl(url);
      setVideoUrl("");
      setMediaMode("image");
      return;
    }

    // Ambiguous (no content-type) → decide by extension
    if (looksLikeVideoUrl(url)) {
      setVideoUrl(url);
      setImageUrl("");
      setMediaMode("video");
      return;
    }

    setImageUrl(url);
    setVideoUrl("");
    setMediaMode("image");
  };

  const clearImage = () => setImageUrl("");
  const clearVideo = () => setVideoUrl("");

  const media = effectiveMediaPayload();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Root Health Ops</div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold">
                Enterprise Beta
              </h1>
              <p className="mt-2 text-sm text-slate-300 max-w-2xl">
                A calm, premium cockpit for social momentum. Send fast. Recover
                cleanly. Keep going.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-slate-400">Connected:</div>
                  <div className="text-lg font-semibold text-slate-100">
                    {loadingAccounts ? "…" : connectedCount}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={refreshChannels}
                  className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-500"
                >
                  Refresh
                </button>
              </div>
              <div className="mt-2 text-slate-500">Loaded from connections</div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Quick Blast</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Write once, choose channels, send — or queue for approval.
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>{charCount} chars</div>
                  <div className="mt-1 text-slate-300">{lengthHint}</div>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Dispatch mode</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Send now publishes immediately. Queue for approval routes
                      it into your clinic workflow.
                    </div>
                  </div>

                  <div className="inline-flex rounded-full bg-slate-900 border border-slate-700 overflow-hidden text-[11px]">
                    <button
                      type="button"
                      onClick={() => setMode("now")}
                      className={[
                        "px-3 py-1.5",
                        mode === "now"
                          ? "bg-emerald-500 text-slate-950"
                          : "text-slate-300",
                      ].join(" ")}
                    >
                      Send now
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("approval")}
                      className={[
                        "px-3 py-1.5",
                        mode === "approval"
                          ? "bg-emerald-500 text-slate-950"
                          : "text-slate-300",
                      ].join(" ")}
                    >
                      Queue for approval
                    </button>
                  </div>
                </div>

                {mode === "approval" && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        When should it land in the queue?
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduledLocal}
                        onChange={(e) => setScheduledLocal(e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                      <div className="mt-1 text-[11px] text-slate-500">
                        This is the scheduled time stored on the post (and shown
                        in Approvals/Scheduled).
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-300">
                      <div className="font-semibold text-slate-200">
                        What happens next
                      </div>
                      <ul className="mt-2 space-y-1">
                        <li>
                          • Your post lands in{" "}
                          <span className="text-slate-100 font-semibold">
                            Approvals
                          </span>{" "}
                          as pending
                        </li>
                        <li>• Approver sees full content + “Posted by Clinic Owner”</li>
                        <li>• Approve → it becomes ready → Post now</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* ✅ Media uploader (image/video) */}
              <div className="mt-6 rounded-3xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Media (optional)</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Drop a file here or click “Choose file”. We upload to Supabase and fill the correct URL automatically.
                    </div>
                  </div>

                  <div className="inline-flex rounded-full bg-slate-900 border border-slate-700 overflow-hidden text-[11px]">
                    <button
                      type="button"
                      onClick={() => setMediaMode("auto")}
                      className={[
                        "px-3 py-1.5",
                        mediaMode === "auto"
                          ? "bg-emerald-500 text-slate-950"
                          : "text-slate-300",
                      ].join(" ")}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaMode("image")}
                      className={[
                        "px-3 py-1.5",
                        mediaMode === "image"
                          ? "bg-emerald-500 text-slate-950"
                          : "text-slate-300",
                      ].join(" ")}
                    >
                      Image
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaMode("video")}
                      className={[
                        "px-3 py-1.5",
                        mediaMode === "video"
                          ? "bg-emerald-500 text-slate-950"
                          : "text-slate-300",
                      ].join(" ")}
                    >
                      Video
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <MediaDropzone
                    organisationId={organisationId || undefined}
                    label="Upload image or video"
                    helpText="Drag & drop an image/video here (or click to choose)"
                    accept="image/*,video/*"
                    maxMb={50}
                    disabled={loadingAccounts}
                    onUploaded={onUploadedQuickBlast}
                  />
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2 text-[11px]">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-slate-400">Image URL</div>
                      {imageUrl ? (
                        <button
                          type="button"
                          onClick={clearImage}
                          className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-200 hover:bg-white/10"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1 break-all text-slate-200">
                      {imageUrl || "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-slate-400">Video URL</div>
                      {videoUrl ? (
                        <button
                          type="button"
                          onClick={clearVideo}
                          className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-200 hover:bg-white/10"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1 break-all text-slate-200">
                      {videoUrl || "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-slate-500">
                  Effective payload → imageUrl: {media.imageUrl ? "✅" : "—"} • videoUrl:{" "}
                  {media.videoUrl ? "✅" : "—"}
                </div>
              </div>

              {/* AI Composer */}
              <div className="mt-6 rounded-3xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">AI helper</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Type a subject + pick tone/length → Generate → Use (then edit if you want).
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={generateAiQuickBlast}
                    disabled={aiBusy}
                    className="rounded-2xl bg-blue-500 px-4 py-2 text-xs font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-60"
                  >
                    {aiBusy ? "Generating…" : "Generate"}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Subject (what’s the post about?)
                    </label>
                    <input
                      value={aiSubject}
                      onChange={(e) => setAiSubject(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      placeholder='e.g. "coping with failure"'
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Tone
                      </label>
                      <select
                        value={aiTone}
                        onChange={(e) => setAiTone(e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="calm">Calm</option>
                        <option value="supportive">Supportive</option>
                        <option value="direct">Direct</option>
                        <option value="philosophical">Philosophical</option>
                        <option value="story">Story-style</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Length
                      </label>
                      <select
                        value={aiLength}
                        onChange={(e) => setAiLength(e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="short">Short</option>
                        <option value="medium">Medium</option>
                        <option value="long">Long</option>
                      </select>
                    </div>
                  </div>
                </div>

                {aiError && (
                  <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                    {aiError}
                  </div>
                )}

                {aiVariants.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {aiVariants.map((v, idx) => (
                      <div
                        key={`${idx}-${v.title}`}
                        className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold">
                            {v.title || `Variant ${idx + 1}`}
                          </div>
                          <button
                            type="button"
                            onClick={() => setMessage(joinVariant(v))}
                            className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                          >
                            Use this
                          </button>
                        </div>
                        <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">
                          {joinVariant(v)}
                        </div>
                      </div>
                    ))}
                    <div className="text-[11px] text-slate-500">
                      Tip: Click “Use this”, tweak the wording, then dispatch.
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="Write a quick update…"
                  />
                </div>

                {/* Manual fields remain as fallback */}
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Image URL (optional)
                    </label>
                    <input
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      placeholder="Paste a direct image URL…"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Video URL (optional)
                    </label>
                    <input
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      placeholder="Paste a direct video URL…"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-300">
                      Channels
                    </label>
                    <button
                      type="button"
                      onClick={refreshChannels}
                      className="text-[11px] text-slate-400 hover:text-slate-300"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {channelCards.map((p) => {
                      const isConnected = connectedPlatforms.has(p);
                      const isSelected = selected.includes(p);

                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatform(p)}
                          disabled={!isConnected}
                          className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm transition ${
                            !isConnected
                              ? "border-slate-800 bg-slate-950/40 text-slate-600 cursor-not-allowed"
                              : isSelected
                              ? "border-emerald-500/60 bg-emerald-500/10 text-slate-100"
                              : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600"
                          }`}
                        >
                          <div>
                            <div className="font-medium">{PROVIDER_LABELS[p]}</div>
                            <div className="text-[11px] text-slate-500">
                              {isConnected ? "connected" : "not connected"}
                            </div>
                          </div>
                          <div
                            className={`text-[11px] px-2 py-1 rounded-full border ${
                              !isConnected
                                ? "border-slate-800 text-slate-600"
                                : isSelected
                                ? "border-emerald-500/60 text-emerald-200"
                                : "border-slate-600 text-slate-300"
                            }`}
                          >
                            {isSelected ? "Selected" : "Select"}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2 text-[11px] text-slate-500">
                    Only connected channels will actually send.
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={sendQuickBlast}
                    disabled={
                      sending || message.trim().length === 0 || selected.length === 0
                    }
                    className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {sending
                      ? mode === "now"
                        ? "Sending…"
                        : "Queueing…"
                      : mode === "now"
                      ? "Send Quick Blast"
                      : "Queue for approval"}
                  </button>

                  <button
                    type="button"
                    onClick={saveForLater}
                    className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500"
                  >
                    Save for later
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdminOpen((v) => !v)}
                    className="rounded-2xl border border-slate-700 bg-slate-900/80 px-5 py-2 text-sm text-slate-200 hover:border-slate-600"
                  >
                    Admin view
                  </button>
                </div>

                {result && (
                  <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950 p-4">
                    <div className="text-sm">
                      <div
                        className={result.success ? "text-emerald-200" : "text-amber-200"}
                      >
                        {friendlySummary?.headline ||
                          (result.success ? "Success." : "Not sent.")}
                      </div>
                      <div className="mt-1 text-[12px] text-slate-300">
                        {friendlySummary?.topMsg ||
                          (result.success
                            ? "Nice — you’re live."
                            : "No stress — we’ll fix what’s blocking it.")}
                      </div>
                      {result.note ? (
                        <div className="mt-2 text-[12px] text-emerald-300">
                          {result.note}
                        </div>
                      ) : null}
                    </div>

                    {Array.isArray(result.results) && result.results.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {result.results.map((r: any, idx: number) => {
                          const platform =
                            (String(r?.platform || "") as ProviderId) || "facebook";
                          const ok = !!r?.ok;
                          const skipped = !!r?.skipped;
                          const label = formatPlatformName(r?.platform || platform);

                          const friendly = ok ? "Posted." : extractFriendlyError(r);
                          const tip = !ok
                            ? friendlySuggestionForPlatform(platform, r)
                            : null;

                          return (
                            <div
                              key={`${platform}-${idx}`}
                              className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-[12px] font-semibold text-slate-200">
                                  {label}
                                </div>
                                <div
                                  className={[
                                    "text-[11px] rounded-full border px-2 py-0.5",
                                    ok
                                      ? "border-emerald-500/60 text-emerald-200 bg-emerald-500/10"
                                      : skipped
                                      ? "border-slate-600 text-slate-300 bg-slate-900/40"
                                      : "border-red-500/50 text-red-200 bg-red-500/10",
                                  ].join(" ")}
                                >
                                  {ok ? "✅ Posted" : skipped ? "⚠️ Skipped" : "❌ Failed"}
                                </div>
                              </div>

                              <div className="mt-1 text-[12px] text-slate-300 whitespace-pre-wrap">
                                {friendly}
                              </div>
                              {tip ? (
                                <div className="mt-1 text-[11px] text-slate-400">
                                  {tip}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {adminOpen && (
                      <details className="mt-4">
                        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300">
                          Show technical details (admin)
                        </summary>
                        <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-200">
{JSON.stringify(result, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {adminOpen && (
                  <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950 p-4 text-xs text-slate-300">
                    <div className="text-slate-400 mb-2">Admin info (safe).</div>
                    <div>Selected platforms: {selected.join(", ") || "(none)"}</div>
                    <div className="mt-1">
                      Connected platforms: {Array.from(connectedPlatforms).join(", ") || "(none)"}
                    </div>
                    <div className="mt-1">
                      OrganisationId: {organisationId || "(loading…)"}
                    </div>
                    <div className="mt-1">Mode: {mode === "now" ? "Send now" : "Queue for approval"}</div>
                    <div className="mt-1">mediaMode: {mediaMode}</div>
                    <div className="mt-1">imageUrl: {media.imageUrl ? "✅ set" : "—"}</div>
                    <div className="mt-1">videoUrl: {media.videoUrl ? "✅ set" : "—"}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Drafts */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6">
              <h3 className="text-base font-semibold">Saved drafts</h3>
              <p className="mt-1 text-sm text-slate-300">
                Drafts are stored on this device. (Later we can sync per org.)
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Use “Save for later” and we’ll restore the full draft library
              </p>

              <div className="mt-4 space-y-3">
                {drafts.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                    No drafts yet.
                  </div>
                ) : (
                  drafts.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
                    >
                      <div className="text-[11px] text-slate-500">
                        {new Date(d.savedAt).toLocaleString()}
                      </div>
                      <div className="mt-1 text-sm text-slate-200 line-clamp-3">
                        {d.message || "(empty)"}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        Channels: {d.selectedPlatforms?.join(", ") || "(none)"}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => restoreDraft(d)}
                          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteDraft(d.id)}
                          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-red-500 hover:text-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 text-xs text-slate-500">
            Tip: Upload media → write → choose channels → post (or queue).
          </div>
        </div>
      </div>
    </div>
  );
}
