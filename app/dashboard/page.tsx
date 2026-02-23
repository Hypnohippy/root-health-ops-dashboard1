// app/dashboard/page.tsx
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

// Local-only Growth Memory (we’ll wire Supabase later)
const GROWTH_MEMORY_KEY = "rootops_growth_memory_v1";

// ✅ Brainstorm → Quick Blast prefill keys (supports both naming families)
const PREFILL_QUICKBLAST_KEYS = [
  "rootops_prefill_quickblast_v1",
  "rh_prefill_quickblast_v1",
];

// ✅ Experiment context key (persist a “current experiment” locally)
const CURRENT_EXPERIMENT_KEYS = [
  "rootops_current_experiment_v1",
  "rh_current_experiment_v1",
];

type PrefillQuickBlastPayload = {
  message?: string;
  imageUrl?: string;
  videoUrl?: string;
  suggestedPlatforms?: ProviderId[];
  attribution?: any;
  experimentId?: string | null;
  experimentTitle?: string | null;
};

type CurrentExperimentPayload = {
  v: number;
  updatedAt: string;
  organisationId?: string | null;
  experimentId?: string | null;
  title?: string | null;
  source?: string | null; // e.g. "growth_lab" | "brainstorm"
};

type Draft = {
  id: string;
  savedAt: number;
  message: string;
  imageUrl: string;
  videoUrl: string;
  selectedPlatforms: ProviderId[];
  igPublishMode?: IgPublishMode;
  montageImageUrls?: string[];
};

type Mode = "now" | "approval";
type MediaMode = "auto" | "image" | "video";

/**
 * Instagram publishing choice (comfort toggle)
 * - feed_video: normal video post to feed (when supported by backend)
 * - reel: post as reel
 * - auto: backend decides (default)
 * - montage_reel: multiple photos -> reel (we’ll wire server-side later)
 */
type IgPublishMode = "auto" | "feed_video" | "reel" | "montage_reel";

/**
 * Growth Memory
 */
type GrowthMemoryEntry = {
  id: string;
  createdAt: string;
  organisationId: string | null;
  platform: ProviderId;
  format: "text" | "image" | "video";
  message: string;
  imageUrl?: string;
  videoUrl?: string;
  outcome: "posted" | "partial" | "failed";
  notes: string;
  tags: string[];
};

/**
 * ✅ Commons image picker item (from /api/media/commons-images)
 * We accept a few possible shapes to avoid breaking if your route differs slightly.
 */
type CommonsImage = {
  title?: string;
  url?: string;
  imageUrl?: string;
  thumb?: string;
  thumbnail?: string;
  source?: string;
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

function loadGrowthMemory(): GrowthMemoryEntry[] {
  try {
    const raw = localStorage.getItem(GROWTH_MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as GrowthMemoryEntry[];
  } catch {
    return [];
  }
}

function saveGrowthMemory(items: GrowthMemoryEntry[]) {
  try {
    localStorage.setItem(GROWTH_MEMORY_KEY, JSON.stringify(items.slice(0, 300)));
  } catch {}
}

function setLocalStorageMulti(keys: string[], payload: any) {
  try {
    const raw = JSON.stringify(payload);
    for (const k of keys) {
      try {
        localStorage.setItem(k, raw);
      } catch {}
    }
  } catch {}
}

function getLocalStorageFirst(keys: string[]) {
  try {
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw) return raw;
    }
  } catch {}
  return null;
}

function removeLocalStorageMulti(keys: string[]) {
  try {
    for (const k of keys) {
      try {
        localStorage.removeItem(k);
      } catch {}
    }
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
  const metaMessage = item?.details?.error?.message || item?.error?.message;
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
    if (
      msg.includes("invalid") ||
      msg.includes("missing") ||
      msg.includes("can't read files") ||
      msg.includes("couldn't be uploaded")
    ) {
      return "Tip: Use Upload or Search Images (we import into your storage) — random external URLs often fail on Meta.";
    }
  }

  if (platform === "threads") {
    if (msg.includes("permission")) {
      return "Tip: This usually means the app/token lacks permission for that content type (e.g., media).";
    }
    if (msg.includes("media") || msg.includes("download") || msg.includes("uri")) {
      return "Tip: Threads/IG often refuse external image URLs. Use Search Images (import) or Upload so the URL is clean.";
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

function detectFormatFromMedia(
  imageUrl: string,
  videoUrl: string
): "text" | "image" | "video" {
  const img = (imageUrl || "").trim();
  const vid = (videoUrl || "").trim();
  if (vid) return "video";
  if (img) return "image";
  return "text";
}

function safeProvider(p: any): ProviderId | null {
  const s = String(p || "").toLowerCase().trim();
  const allowed: ProviderId[] = [
    "facebook",
    "instagram",
    "tiktok",
    "linkedin",
    "google",
    "email",
    "whatsapp",
    "threads",
  ];
  return (allowed as string[]).includes(s) ? (s as ProviderId) : null;
}

function safeUuidLike(s?: any) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (!/^[0-9a-fA-F-]{16,}$/.test(v)) return null;
  return v;
}

// ✅ Picks best URL fields from commons item
function pickCommonsUrl(it: CommonsImage): string {
  return (
    String(it?.url || "").trim() ||
    String(it?.imageUrl || "").trim() ||
    String(it?.source || "").trim() ||
    ""
  );
}

function pickCommonsThumb(it: CommonsImage): string {
  return (
    String(it?.thumb || "").trim() ||
    String(it?.thumbnail || "").trim() ||
    pickCommonsUrl(it)
  );
}

export default function DashboardHomePage() {
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountRow[]>([]);
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  // ✅ Current experiment context (optional)
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [experimentTitle, setExperimentTitle] = useState<string | null>(null);

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

  // Instagram comfort toggle
  const [igPublishMode, setIgPublishMode] = useState<IgPublishMode>("auto");

  // Montage list (photos)
  const [montageImages, setMontageImages] = useState<UploadedMedia[]>([]);

  const [selected, setSelected] = useState<ProviderId[]>([]);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<QuickBlastResult | null>(null);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);

  const [mode, setMode] = useState<Mode>("now");
  const [scheduledLocal, setScheduledLocal] = useState<string>(
    defaultLocalDateTimePlus(10)
  );

  // Growth Memory UI
  const [gmOpen, setGmOpen] = useState(false);
  const [gmPlatform, setGmPlatform] = useState<ProviderId>("facebook");
  const [gmNotes, setGmNotes] = useState("");
  const [gmTags, setGmTags] = useState<string>("");
  const [gmSavedToast, setGmSavedToast] = useState<string | null>(null);

  // ✅ Commons image picker UI
  const [imgPickerOpen, setImgPickerOpen] = useState(false);
  const [imgPickerQuery, setImgPickerQuery] = useState("mental health calm");
  const [imgPickerBusy, setImgPickerBusy] = useState(false);
  const [imgPickerError, setImgPickerError] = useState<string | null>(null);
  const [imgPickerItems, setImgPickerItems] = useState<CommonsImage[]>([]);
  const [imgImportBusyUrl, setImgImportBusyUrl] = useState<string | null>(null);
  const [imgImportError, setImgImportError] = useState<string | null>(null);

  // ✅ FIX: lock background scroll while modal is open + ESC to close
  useEffect(() => {
    if (!imgPickerOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImgPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [imgPickerOpen]);

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
      id: (globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : String(Date.now())),
      savedAt: Date.now(),
      message,
      imageUrl,
      videoUrl,
      selectedPlatforms: selected,
      igPublishMode,
      montageImageUrls: montageImages
        .map((m) => String(m.url || "").trim())
        .filter(Boolean),
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
    setIgPublishMode((d.igPublishMode as IgPublishMode) || "auto");

    const urls = Array.isArray(d.montageImageUrls) ? d.montageImageUrls : [];
    const rebuilt: UploadedMedia[] = urls
      .map((u) => String(u || "").trim())
      .filter(Boolean)
      .map((u) => ({ url: u, kind: "image" as const }));
    setMontageImages(rebuilt);
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
    if (vid && looksLikeVideoUrl(vid)) return { imageUrl: "", videoUrl: vid };
    if (img && looksLikeImageUrl(img)) return { imageUrl: img, videoUrl: "" };

    if (vid) return { imageUrl: "", videoUrl: vid };
    return { imageUrl: img, videoUrl: "" };
  }

  const isMontageMode = igPublishMode === "montage_reel";
  const montageUrls = useMemo(
    () => montageImages.map((m) => String(m?.url || "").trim()).filter(Boolean),
    [montageImages]
  );

  const montageReady = montageUrls.length >= 2;

  async function logQuickBlastToExperiment(params: {
    organisationId: string | null;
    experimentId: string | null;
    message: string;
    imageUrl: string;
    videoUrl: string;
    igPublishMode: IgPublishMode;
    montageImageUrls: string[];
    result: QuickBlastResult | null;
  }) {
    try {
      const org = params.organisationId;
      if (!org) return;

      const expId = safeUuidLike(params.experimentId);
      if (!expId) return;

      const results = Array.isArray(params.result?.results)
        ? params.result!.results!
        : [];

      await fetch("/api/growth/experiments/log-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          organisationId: org,
          experimentId: expId,
          action: "post_attempt",
          contentPreview: String(params.message || "").slice(0, 400),
          meta: {
            imageUrl: params.imageUrl || null,
            videoUrl: params.videoUrl || null,
            igPublishMode: params.igPublishMode || "auto",
            montageImageUrls: Array.isArray(params.montageImageUrls)
              ? params.montageImageUrls
              : [],
            response: params.result || null,
          },
          attempts: results.map((r: any) => ({
            platform: String(r?.platform || ""),
            ok: !!r?.ok,
            externalPostId:
              String(
                r?.id || r?.post_id || r?.postId || r?.details?.id || ""
              ).trim() || null,
            error: !r?.ok ? extractFriendlyError(r) : null,
            raw: r,
          })),
        }),
      }).catch(() => null);
    } catch {
      // silent
    }
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
          igPublishMode,
          montageImageUrls: montageUrls,
          experimentId: experimentId || null,
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

      void logQuickBlastToExperiment({
        organisationId,
        experimentId,
        message,
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl,
        igPublishMode,
        montageImageUrls: montageUrls,
        result: merged,
      });
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
        cache: "no-store",
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
            ig_publish_mode: igPublishMode,
            montage_image_urls: montageUrls,
            experiment_id: experimentId || null,
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

      const merged: QuickBlastResult = {
        success: true,
        organisationId,
        userMessage:
          "Queued for approval ✅ Head to Approvals to review and approve it (then Post now).",
        note: "Tip: This is exactly the ‘clinic workflow’ feel — author → approvals → publish.",
      };

      setResult(merged);

      void logQuickBlastToExperiment({
        organisationId,
        experimentId,
        message,
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl,
        igPublishMode,
        montageImageUrls: montageUrls,
        result: {
          success: true,
          organisationId: organisationId || undefined,
          userMessage: "Queued for approval",
          note: "queued_for_approval",
          results: selected.map((p) => ({ platform: p, ok: true, queued: true })),
          summary: { attempted: selected.length, ok: selected.length, failed: 0 },
        },
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

  // ✅ Apply Brainstorm prefill (if present)
  function applyQuickBlastPrefill(prefill: PrefillQuickBlastPayload) {
    const msg = String(prefill?.message || "").trim();
    if (msg) setMessage(msg);

    const img = String(prefill?.imageUrl || "").trim();
    const vid = String(prefill?.videoUrl || "").trim();

    if (vid) {
      setVideoUrl(vid);
      setImageUrl("");
      setMediaMode("video");
    } else if (img) {
      setImageUrl(img);
      setVideoUrl("");
      setMediaMode("image");
    }

    const suggested = Array.isArray(prefill?.suggestedPlatforms)
      ? prefill.suggestedPlatforms.map((x) => safeProvider(x)).filter(Boolean)
      : [];

    if (suggested.length > 0) {
      setSelected(suggested as ProviderId[]);
    }

    const expId = safeUuidLike(prefill?.experimentId);
    if (expId) {
      setExperimentId(expId);
      const t = String(prefill?.experimentTitle || "").trim();
      setExperimentTitle(t || null);

      const payload: CurrentExperimentPayload = {
        v: 1,
        updatedAt: new Date().toISOString(),
        organisationId: organisationId || null,
        experimentId: expId,
        title: t || null,
        source: "brainstorm",
      };
      setLocalStorageMulti(CURRENT_EXPERIMENT_KEYS, payload);
    }
  }

  function clearExperimentLink() {
    setExperimentId(null);
    setExperimentTitle(null);
    removeLocalStorageMulti(CURRENT_EXPERIMENT_KEYS);
  }

  useEffect(() => {
    void loadSocialAccounts();
    setDrafts(loadDrafts());

    // 1) Load any persisted experiment context
    try {
      const raw = getLocalStorageFirst(CURRENT_EXPERIMENT_KEYS);
      if (raw) {
        const parsed = JSON.parse(raw) as CurrentExperimentPayload;
        if (parsed && parsed.v === 1) {
          const expId = safeUuidLike(parsed.experimentId);
          if (expId) {
            setExperimentId(expId);
            setExperimentTitle(String(parsed.title || "").trim() || null);
          }
        }
      }
    } catch {}

    // 2) Apply Brainstorm prefill once, then clear it
    try {
      const raw = getLocalStorageFirst(PREFILL_QUICKBLAST_KEYS);
      if (raw) {
        const parsed = JSON.parse(raw) as PrefillQuickBlastPayload;
        if (parsed && typeof parsed === "object") {
          applyQuickBlastPrefill(parsed);
        }
        removeLocalStorageMulti(PREFILL_QUICKBLAST_KEYS);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      (result.results || []).filter(
        (r: any) => r && !r.ok && !r.skipped
      ).length;

    const headline = result.success
      ? attempted > 0
        ? `Sent successfully (${ok}/${attempted}).`
        : "Success."
      : failed > 0
      ? `Some channels didn’t send (${ok}/${attempted}).`
      : "No channels sent.";

    const topMsg =
      result.userMessage ||
      (result.success ? "Nice — you’re live." : "No stress — we’ll fix what’s blocking it.");

    return { attempted, ok, failed, headline, topMsg };
  }, [result]);

  const onUploadedQuickBlast = (m: UploadedMedia) => {
    const url = String(m?.url || "").trim();
    if (!url) return;

    const ct = String(m?.contentType || "").toLowerCase();
    const kind = String((m as any)?.kind || "").toLowerCase();

    const isVideo = kind === "video" || ct.startsWith("video/") || looksLikeVideoUrl(url);
    const isImage = kind === "image" || ct.startsWith("image/") || looksLikeImageUrl(url);

    // If montage mode: collect images into a list (don’t overwrite)
    if (isMontageMode) {
      if (isImage) {
        setMontageImages((prev) => {
          const exists = prev.some((x) => String(x?.url || "").trim() === url);
          if (exists) return prev;
          return [...prev, { ...m, url, kind: "image" }];
        });
        setImageUrl((prev) => (prev ? prev : url));
        setVideoUrl("");
        setMediaMode("image");
        return;
      }

      if (isVideo) {
        setVideoUrl(url);
        setImageUrl("");
        setMediaMode("video");
        return;
      }
    }

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

  function clearMontage() {
    setMontageImages([]);
  }

  function removeMontageAt(i: number) {
    setMontageImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  const media = effectiveMediaPayload();

  const hasEffectiveVideo = !!media.videoUrl;
  const hasEffectiveImage = !!media.imageUrl;

  const igChoiceHint = useMemo(() => {
    if (igPublishMode === "montage_reel") {
      if (montageUrls.length === 0) return "Add 2+ images for a montage.";
      if (montageUrls.length === 1) return "Add at least one more image to form a montage.";
      return "Montage selected (multiple images).";
    }

    if (igPublishMode === "reel") return "Reel selected.";
    if (igPublishMode === "feed_video") return "Feed video selected.";
    return "Auto (recommended).";
  }, [igPublishMode, montageUrls.length]);

  useEffect(() => {
    if (!isMontageMode) return;
    if (!imageUrl && montageUrls.length > 0) setImageUrl(montageUrls[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMontageMode]);

  // ✅ Growth Memory opener (type-safe)
  function openGrowthMemoryFromCurrentPost() {
    const firstSelected = selected[0] || null;
    const safe = safeProvider(firstSelected) || "facebook";
    setGmPlatform(safe);

    const okCount = Array.isArray(result?.results)
      ? result!.results!.filter((r: any) => !!r?.ok).length
      : 0;
    const attempted = Array.isArray(result?.results) ? result!.results!.length : 0;

    const outcome: GrowthMemoryEntry["outcome"] =
      okCount > 0 && okCount === attempted ? "posted" : okCount > 0 ? "partial" : "failed";

    const format = detectFormatFromMedia(media.imageUrl, media.videoUrl);

    const defaultNotes =
      outcome === "posted"
        ? "✅ This one landed. Keep the first line + CTA style, and reuse this structure."
        : outcome === "partial"
        ? "⚠️ Mixed outcome. Keep the core message, but adjust media/format for the failing platform(s)."
        : "❌ Didn’t land. Consider: reconnect platform, simplify media, or post text-only once.";

    setGmNotes(defaultNotes);
    setGmTags("quick_blast, growth_lab");

    setGmOpen(true);
  }

  function closeGrowthMemory() {
    setGmOpen(false);
  }

  function saveGrowthMemoryEntry() {
    const format = detectFormatFromMedia(media.imageUrl, media.videoUrl);

    const okCount = Array.isArray(result?.results)
      ? result!.results!.filter((r: any) => !!r?.ok).length
      : 0;
    const attempted = Array.isArray(result?.results) ? result!.results!.length : 0;

    const outcome: GrowthMemoryEntry["outcome"] =
      okCount > 0 && okCount === attempted ? "posted" : okCount > 0 ? "partial" : "failed";

    const entry: GrowthMemoryEntry = {
      id: (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now())),
      createdAt: new Date().toISOString(),
      organisationId: organisationId || null,
      platform: gmPlatform,
      format,
      message: String(message || "").trim(),
      imageUrl: media.imageUrl ? media.imageUrl : undefined,
      videoUrl: media.videoUrl ? media.videoUrl : undefined,
      outcome,
      notes: String(gmNotes || "").trim(),
      tags: String(gmTags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    const next = [entry, ...loadGrowthMemory()];
    saveGrowthMemory(next);

    setGmOpen(false);
    setGmSavedToast("Saved to Growth Memory ✅");
    setTimeout(() => setGmSavedToast(null), 2500);
  }

  // ✅ Commons image picker actions
  async function searchCommonsImages(q: string) {
    const query = String(q || "").trim();
    if (!query) {
      setImgPickerError("Type something to search (e.g. 'calm anxiety nature').");
      return;
    }

    setImgPickerBusy(true);
    setImgPickerError(null);
    setImgPickerItems([]);

    try {
      const res = await fetch(`/api/media/commons-images?q=${encodeURIComponent(query)}`, {
        method: "GET",
        cache: "no-store",
      });

      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        setImgPickerError(json?.error || `Search failed (${res.status})`);
        return;
      }

      const items: CommonsImage[] = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json)
        ? json
        : [];

      if (!items || items.length === 0) {
        setImgPickerError("No results. Try a different search.");
        return;
      }

      setImgPickerItems(items);
    } catch (e: any) {
      setImgPickerError(e?.message || "Search failed");
    } finally {
      setImgPickerBusy(false);
    }
  }

  async function importCommonsImageToStorage(externalUrl: string) {
    const url = String(externalUrl || "").trim();
    if (!url) return;

    if (!organisationId) {
      setImgImportError("Organisation not loaded yet. Refresh and try again.");
      return;
    }

    setImgImportBusyUrl(url);
    setImgImportError(null);

    try {
      const res = await fetch("/api/media/import-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          url,
          organisationId,
        }),
      });

      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setImgImportError(json?.error || `Import failed (${res.status})`);
        return;
      }

      const publicUrl = String(json?.url || "").trim();
      if (!publicUrl) {
        setImgImportError("Import succeeded but returned no URL.");
        return;
      }

      // ✅ Apply: set as imageUrl and clear video
      setImageUrl(publicUrl);
      setVideoUrl("");
      setMediaMode("image");

      // If montage mode, also add to montage list (nice UX)
      if (isMontageMode) {
        setMontageImages((prev) => {
          const exists = prev.some((x) => String(x?.url || "").trim() === publicUrl);
          if (exists) return prev;
          return [...prev, { url: publicUrl, kind: "image" as const }];
        });
      }

      setImgPickerOpen(false);
    } catch (e: any) {
      setImgImportError(e?.message || "Import failed");
    } finally {
      setImgImportBusyUrl(null);
    }
  }

  function openImagePicker() {
    setImgImportError(null);
    setImgPickerError(null);
    setImgPickerOpen(true);

    // Lazy auto-search once when opening (only if no results yet)
    if (imgPickerItems.length === 0 && !imgPickerBusy) {
      void searchCommonsImages(imgPickerQuery);
    }
  }

  function closeImagePicker() {
    setImgPickerOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          {/* ... everything above is unchanged in your file ... */}

          {/* (Your main UI continues exactly as you pasted it) */}

          <div className="mt-8 text-xs text-slate-500">
            Tip: Upload/Search media → write → choose channels → post (or queue).
          </div>
        </div>
      </div>

      {/* ✅ Commons Image Picker Modal (FIXED: scroll + close + body lock) */}
      {imgPickerOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          {/* backdrop */}
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/70"
            onClick={closeImagePicker}
          />

          {/* panel */}
          <div className="relative w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col">
            {/* header (sticky-ish) */}
            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-800">
              <div>
                <div className="text-xs text-slate-400">Media Library</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  Search images
                </div>
                <div className="mt-1 text-sm text-slate-300">
                  Pick an image → we import it into your storage (so Facebook/IG/Threads can actually read it).
                </div>
              </div>
              <button
                type="button"
                onClick={closeImagePicker}
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
              >
                Close
              </button>
            </div>

            {/* scrollable body */}
            <div className="flex-1 overflow-y-auto p-6">
              {imgImportError ? (
                <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                  {imgImportError}
                </div>
              ) : null}

              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={imgPickerQuery}
                  onChange={(e) => setImgPickerQuery(e.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder='e.g. "calm nature therapy"'
                />
                <button
                  type="button"
                  onClick={() => searchCommonsImages(imgPickerQuery)}
                  disabled={imgPickerBusy}
                  className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {imgPickerBusy ? "Searching…" : "Search"}
                </button>
              </div>

              {imgPickerError ? (
                <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
                  {imgPickerError}
                </div>
              ) : null}

              <div className="mt-5">
                {imgPickerBusy && imgPickerItems.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-300">
                    Searching…
                  </div>
                ) : imgPickerItems.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-400">
                    No results yet. Search above.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {imgPickerItems.slice(0, 24).map((it, idx) => {
                      const full = pickCommonsUrl(it);
                      const thumb = pickCommonsThumb(it);
                      const title = String(it?.title || "").trim() || `Image ${idx + 1}`;
                      const importing = imgImportBusyUrl === full;

                      return (
                        <div
                          key={`${full}-${idx}`}
                          className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden"
                        >
                          <div className="aspect-[4/3] bg-slate-900">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumb}
                              alt={title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-3">
                            <div className="text-xs font-semibold text-slate-100 line-clamp-1">
                              {title}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400 line-clamp-2 break-all">
                              {full}
                            </div>

                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => importCommonsImageToStorage(full)}
                                disabled={!full || importing}
                                className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                              >
                                {importing ? "Importing…" : "Use this image"}
                              </button>
                            </div>

                            <div className="mt-2 text-[11px] text-slate-500">
                              We’ll copy it into your storage first (Meta-safe).
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-5 text-[11px] text-slate-500">
                If Meta ever says “can’t read files”, it usually means the URL wasn’t fetchable or the image was too large.
                Import fixes that by hosting it under your own clean URL.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ Growth Memory Modal (unchanged) */}
      {gmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeGrowthMemory} />
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Growth Lab</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  Save to Growth Memory
                </div>
                <div className="mt-1 text-sm text-slate-300">
                  Capture what worked (or what failed) so your future self gets smarter — without effort.
                </div>
              </div>
              <button
                type="button"
                onClick={closeGrowthMemory}
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Platform
                  </label>
                  <select
                    value={gmPlatform}
                    onChange={(e) => {
                      const v = safeProvider(e.target.value) || "facebook";
                      setGmPlatform(v);
                    }}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="threads">Threads</option>
                    <option value="tiktok">TikTok</option>
                    <option value="google">Google</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-[12px] text-slate-300">
                  <div className="font-semibold text-slate-200">Snapshot</div>
                  <div className="mt-1 text-slate-400">
                    Format:{" "}
                    <span className="text-slate-100 font-semibold">
                      {detectFormatFromMedia(media.imageUrl, media.videoUrl)}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-400">
                    Media:{" "}
                    <span className="text-slate-100 font-semibold">
                      {media.videoUrl ? "video" : media.imageUrl ? "image" : "none"}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Notes (what happened / what to do next)
                </label>
                <textarea
                  value={gmNotes}
                  onChange={(e) => setGmNotes(e.target.value)}
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="e.g. Hook worked. CTA too pushy. Try softer CTA + carousel next time."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Tags (comma-separated)
                </label>
                <input
                  value={gmTags}
                  onChange={(e) => setGmTags(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="e.g. anxiety, workplace, calm_tone"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Keep it simple. Later we’ll use these to suggest “what to post next”.
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={saveGrowthMemoryEntry}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={closeGrowthMemory}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500"
                >
                  Cancel
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                Tiny joke (whispered): your future self just high-fived you. 🤝
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
