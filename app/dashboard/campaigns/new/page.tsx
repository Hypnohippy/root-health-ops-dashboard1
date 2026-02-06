"use client";

import React, { useMemo, useState } from "react";

type Variant = {
  primary_text: string;
  headline: string;
};

type PlatformPreviewType = "meta" | "linkedin" | "google";
type LengthMode = "short" | "medium" | "long";

function HelpTip({ text }: { text: string }) {
  return (
    <span
      className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/30 bg-black/40 text-[10px] text-slate-200 cursor-help"
      title={text}
    >
      ?
    </span>
  );
}

function PlatformPreview({
  platform,
  primaryText,
  headline,
  url,
  pageName = "Root Health",
}: {
  platform: PlatformPreviewType;
  primaryText: string;
  headline: string;
  url?: string;
  pageName?: string;
}) {
  if (platform === "meta") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-sm max-w-xl space-y-3 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-white/20" />
          <div>
            <div className="font-semibold text-slate-50">{pageName}</div>
            <div className="text-xs text-slate-300">Sponsored · Meta</div>
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap text-slate-50">{primaryText}</p>
        <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20">
          <div className="h-36 bg-gradient-to-br from-slate-600/70 via-slate-500/60 to-emerald-500/40" />
          <div className="p-3">
            <div className="text-[11px] uppercase text-slate-300 tracking-wide">
              {url?.replace(/^https?:\/\//, "") || "roothealth.app"}
            </div>
            <div className="text-sm font-semibold text-slate-50">{headline}</div>
          </div>
        </div>
      </div>
    );
  }

  if (platform === "linkedin") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-sm max-w-xl space-y-3 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-white/20" />
          <div>
            <div className="font-semibold text-slate-50">{pageName}</div>
            <div className="text-xs text-slate-300">Promoted · LinkedIn</div>
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap text-slate-50">{primaryText}</p>
        <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20">
          <div className="h-32 bg-gradient-to-br from-sky-600/70 via-sky-500/60 to-emerald-500/40" />
          <div className="p-3">
            <div className="text-xs text-slate-300">
              {url?.replace(/^https?:\/\//, "") || "roothealth.app"}
            </div>
            <div className="text-sm font-semibold text-slate-50">{headline}</div>
          </div>
        </div>
      </div>
    );
  }

  // google preview
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-sm max-w-xl space-y-2 shadow-lg">
      <div className="text-xs text-slate-300">Sponsored · Google</div>
      <div className="text-[11px] text-emerald-400">
        {url?.replace(/^https?:\/\//, "") || "roothealth.app"}
      </div>
      <div className="text-base font-semibold text-slate-50">{headline}</div>
      <p className="text-sm text-slate-100 whitespace-pre-wrap">{primaryText}</p>
    </div>
  );
}

function safeSlug(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

// Map your UI labels → canonical platform key stored in DB
function toPlatformKey(ui: string): "meta" | "linkedin" | "google" | "tiktok" {
  const v = String(ui || "").toLowerCase();
  if (v.includes("meta") || v.includes("facebook") || v.includes("ig")) return "meta";
  if (v.includes("linkedin")) return "linkedin";
  if (v.includes("google")) return "google";
  return "tiktok";
}

export default function NewCampaignPage() {
  // core fields
  const [name, setName] = useState("Root Health – December Stress Relief");
  const [platformUi, setPlatformUi] = useState("Meta (Facebook/IG)");
  const [objective, setObjective] = useState<"Leads" | "Traffic" | "Awareness">("Leads");
  const [budgetDaily, setBudgetDaily] = useState("10");
  const [url, setUrl] = useState("https://roothealth.app");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("United Kingdom");
  const [ageRange, setAgeRange] = useState("25-54");
  const [audienceKeywords, setAudienceKeywords] = useState("burnout, stress, anxiety, self care, therapy");
  const [mediaUrl, setMediaUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  // UTM
  const [utmSource, setUtmSource] = useState("facebook");
  const [utmMedium, setUtmMedium] = useState("paid_social");
  const [utmCampaign, setUtmCampaign] = useState("root_health_dec_stress");

  // ad length
  const [lengthMode, setLengthMode] = useState<LengthMode>("medium");

  // variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<PlatformPreviewType>("meta");

  // status
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPostingLinkedIn, setIsPostingLinkedIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const platformKey = useMemo(() => toPlatformKey(platformUi), [platformUi]);

  function resetNotices() {
    setMessage(null);
    setError(null);
  }

  function applyUtmToUrl() {
    try {
      const base = new URL(url);
      if (utmSource) base.searchParams.set("utm_source", utmSource);
      if (utmMedium) base.searchParams.set("utm_medium", utmMedium);
      if (utmCampaign) base.searchParams.set("utm_campaign", utmCampaign);
      setUrl(base.toString());
      setMessage("UTM parameters applied to URL.");
    } catch {
      setError("Invalid URL – make sure it starts with http:// or https://");
    }
  }

  async function handleGenerateVariants() {
    resetNotices();
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: platformUi,
          objective,
          url,
          audienceKeywords,
          brandVoice: "Root Health founder",
          lengthMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate variants");
        return;
      }

      const got = (data.variants || []) as Variant[];
      if (!got.length) {
        setError("AI returned no variants");
        return;
      }

      setVariants(got);
      setSelectedVariantIndex(0);
      setMessage(
        `Generated 3 ${
          lengthMode === "short" ? "short" : lengthMode === "long" ? "long-form" : "medium-length"
        } ad variants.`
      );
    } catch (e: any) {
      setError(e?.message || "Error generating variants");
    } finally {
      setIsGenerating(false);
    }
  }

  function parseAgeRange(range: string): { age_min: number | null; age_max: number | null } {
    const m = String(range || "").match(/(\d+)\s*-\s*(\d+)/);
    if (!m) return { age_min: null, age_max: null };
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { age_min: null, age_max: null };
    return { age_min: a, age_max: b };
  }

  function basePayload() {
    const { age_min, age_max } = parseAgeRange(ageRange);
    const keywords = audienceKeywords
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      // campaigns table
      name: name || "Root Health campaign",
      platform: platformKey, // ✅ canonical
      objective: String(objective || "").toLowerCase(),
      status: "draft",
      budget_daily: budgetDaily ? Number(budgetDaily) : null,
      start_date: startDate || null,
      end_date: endDate || null,
      location: location || null,
      age_min,
      age_max,
      audience_keywords: keywords.length ? keywords : null,
      landing_url: url || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || safeSlug(name),
      // keep any extras in meta (future-proof)
      meta: {
        platform_ui: platformUi,
        age_range_ui: ageRange,
        button_label: "Find out more",
      },
      // variant defaults (we pass per variant)
      media_url: mediaUrl || null,
      video_url: videoUrl || null,
    };
  }

  async function saveCampaignWithVariants(variantsToSave: { ab_group: "A" | "B" | "C"; primary_text: string; headline: string }[]) {
    const base = basePayload();

    // The /api/campaigns route expects:
    // { name, platform, objective, ... , variants: [{ab_group, primary_text, headline, media_url, video_url}] }
    const payload = {
      name: base.name,
      platform: base.platform,
      objective: base.objective,
      status: base.status,
      budget_daily: base.budget_daily,
      start_date: base.start_date,
      end_date: base.end_date,
      location: base.location,
      age_min: base.age_min,
      age_max: base.age_max,
      audience_keywords: base.audience_keywords,
      landing_url: base.landing_url,
      utm_source: base.utm_source,
      utm_medium: base.utm_medium,
      utm_campaign: base.utm_campaign,
      meta: base.meta,
      variants: variantsToSave.map((v) => ({
        ab_group: v.ab_group,
        primary_text: v.primary_text,
        headline: v.headline,
        media_url: base.media_url,
        video_url: base.video_url,
        status: "draft",
      })),
    };

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) throw new Error(data.error || "Failed to save campaign");

    return data?.campaignId as string | undefined;
  }

  async function handleSaveSelected() {
    resetNotices();
    if (selectedVariantIndex === null) {
      setError("No variant selected");
      return;
    }

    const v = variants[selectedVariantIndex];
    if (!v) {
      setError("Selected variant missing");
      return;
    }

    setIsSaving(true);
    try {
      const campaignId = await saveCampaignWithVariants([{ ab_group: "A", primary_text: v.primary_text, headline: v.headline }]);
      setMessage(campaignId ? "Saved selected variant as A ✅" : "Saved selected variant as A ✅");
    } catch (e: any) {
      setError(e?.message || "Error saving selected variant");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveAll() {
    resetNotices();
    if (!variants.length) {
      setError("No variants to save");
      return;
    }

    setIsSaving(true);
    try {
      const labels: ("A" | "B" | "C")[] = ["A", "B", "C"];
      const toSave = variants.slice(0, 3).map((v, idx) => ({
        ab_group: labels[idx],
        primary_text: v.primary_text,
        headline: v.headline,
      }));
      await saveCampaignWithVariants(toSave);
      setMessage("Saved variants A, B, C ✅");
    } catch (e: any) {
      setError(e?.message || "Error saving all variants");
    } finally {
      setIsSaving(false);
    }
  }

  // ✅ Export “plan” as JSON + copy to clipboard (the booking happens on platform side)
  async function handleExportSelected() {
    resetNotices();
    if (selectedVariantIndex === null || !variants[selectedVariantIndex]) {
      setError("No variant selected");
      return;
    }

    const v = variants[selectedVariantIndex];
    const exportObj = {
      campaign: {
        name,
        platform: platformKey,
        objective,
        budget_daily_gbp: budgetDaily ? Number(budgetDaily) : null,
        start_date: startDate || null,
        end_date: endDate || null,
        location,
        age_range: ageRange,
        audience_keywords: audienceKeywords,
        landing_url: url,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        media_url: mediaUrl || null,
        video_url: videoUrl || null,
      },
      variant: {
        ab_group: ["A", "B", "C"][selectedVariantIndex] || "A",
        headline: v.headline,
        primary_text: v.primary_text,
      },
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(exportObj, null, 2));
      setMessage("Export copied to clipboard ✅ (paste into your ads manager setup)");
    } catch {
      setError("Could not copy to clipboard. Your browser may be blocking it.");
    }
  }

  async function handlePostSelectedToLinkedIn() {
    resetNotices();

    if (selectedVariantIndex === null || !variants[selectedVariantIndex]) {
      setError("No variant selected");
      return;
    }

    if (platformKey !== "linkedin") {
      setError("Set platform to LinkedIn to post directly.");
      return;
    }

    const v = variants[selectedVariantIndex];
    const text = `${v.primary_text}\n\n${url}`;

    try {
      setIsPostingLinkedIn(true);
      const res = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setError(data.error || "Failed to post to LinkedIn");
        return;
      }

      setMessage("Posted selected variant to LinkedIn successfully 🟢");
    } catch (e: any) {
      setError(e?.message || "Error posting to LinkedIn");
    } finally {
      setIsPostingLinkedIn(false);
    }
  }

  const selectedVariant = selectedVariantIndex !== null ? variants[selectedVariantIndex] : null;
  const canPostToLinkedIn = !!selectedVariant && platformKey === "linkedin" && !isPostingLinkedIn;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">New Campaign – Root Health</h1>
            <p className="text-sm text-slate-300">
              Plan, generate, preview, save A/B/C variants — then export and book the ad directly on the platform.
            </p>
          </div>
          <a
            href="/dashboard/campaigns"
            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-50 hover:bg-white/10"
          >
            ← Back to campaigns
          </a>
        </header>

        {(message || error) && (
          <div className="space-y-2">
            {message && (
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {message}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Campaign settings */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">Campaign settings</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Campaign name <HelpTip text="Internal name only – used so you can recognise this campaign later." />
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Platform <HelpTip text="Used to shape tone. Stored as meta/linkedin/google/tiktok." />
                  </label>
                  <select
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={platformUi}
                    onChange={(e) => setPlatformUi(e.target.value)}
                  >
                    <option>Meta (Facebook/IG)</option>
                    <option>LinkedIn</option>
                    <option>Google</option>
                    <option>TikTok</option>
                  </select>

                  <p className="text-[11px] text-slate-400">
                    Saved as: <span className="text-slate-200 font-semibold">{platformKey}</span>
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Objective <HelpTip text="Leads = signups, Traffic = clicks, Awareness = seen and remembered." />
                  </label>
                  <select
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value as any)}
                  >
                    <option>Leads</option>
                    <option>Traffic</option>
                    <option>Awareness</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Daily budget (£) <HelpTip text="Planning only – stored for reporting (not sent to ad networks)." />
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={budgetDaily}
                    onChange={(e) => setBudgetDaily(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">Start date</label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">End date (optional)</label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">Location</label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">Age range</label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={ageRange}
                    onChange={(e) => setAgeRange(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">
                  Audience keywords (comma-separated)
                  <HelpTip text="Used to aim the AI at the right person. Also saved for reporting." />
                </label>
                <textarea
                  className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400 min-h-[60px]"
                  value={audienceKeywords}
                  onChange={(e) => setAudienceKeywords(e.target.value)}
                />
                <p className="text-[11px] text-slate-300">
                  Example: "burnout, NHS staff, senior leaders, new mums, ADHD, small business owners".
                </p>
              </div>
            </section>

            {/* URL + UTM */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">Landing URL & tracking</h2>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">
                  Landing URL <HelpTip text="Where the ad sends people." />
                </label>
                <input
                  className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">utm_source</label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">utm_medium</label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">utm_campaign</label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={applyUtmToUrl}
                className="rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md hover:bg-emerald-300"
              >
                Apply UTM to URL
              </button>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">Media URL (optional)</label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">Video URL (optional)</label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Variants */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-50">Ad variants (A/B/C)</h2>
                  <p className="text-[11px] text-slate-300">
                    3 angles, same audience & settings. Save them, export one, then book the ad directly on the platform.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateVariants}
                  disabled={isGenerating}
                  className="rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md hover:bg-emerald-300 disabled:opacity-60"
                >
                  {isGenerating ? "Generating..." : "Generate 3 ad variants"}
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-medium text-slate-200">Ad length</p>
                <div className="inline-flex flex-wrap gap-2">
                  {(["short", "medium", "long"] as LengthMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setLengthMode(m)}
                      className={`rounded-full px-3 py-1 text-xs border ${
                        lengthMode === m
                          ? "bg-emerald-400 text-slate-950 border-emerald-300"
                          : "bg-black/30 text-slate-100 border-white/20"
                      }`}
                    >
                      {m === "short" ? "Short (2–4 sentences)" : m === "medium" ? "Medium (120–220 words)" : "Long (story-style)"}
                    </button>
                  ))}
                </div>
              </div>

              {variants.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {variants.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedVariantIndex(idx)}
                          className={`rounded-full px-3 py-1 text-xs border ${
                            selectedVariantIndex === idx
                              ? "bg-emerald-400 text-slate-950 border-emerald-300"
                              : "bg-black/30 text-slate-100 border-white/20"
                          }`}
                        >
                          Variant {["A", "B", "C"][idx] || idx + 1}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveSelected}
                        disabled={isSaving || selectedVariantIndex === null}
                        className="rounded-md border border-white/30 bg-black/30 px-3 py-1.5 text-xs text-slate-100 hover:bg-black/40 disabled:opacity-60"
                      >
                        Save selected
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveAll}
                        disabled={isSaving || variants.length === 0}
                        className="rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md hover:bg-emerald-300 disabled:opacity-60"
                      >
                        Save all 3 (A/B/C)
                      </button>

                      <button
                        type="button"
                        onClick={handleExportSelected}
                        disabled={!selectedVariant}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium shadow-md ${
                          selectedVariant
                            ? "bg-white/10 text-slate-50 hover:bg-white/20 border border-white/15"
                            : "bg-black/30 text-slate-400 cursor-not-allowed border border-white/15"
                        }`}
                      >
                        Export selected (copy)
                      </button>

                      <button
                        type="button"
                        onClick={handlePostSelectedToLinkedIn}
                        disabled={!canPostToLinkedIn}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium shadow-md ${
                          canPostToLinkedIn
                            ? "bg-sky-400 text-slate-950 hover:bg-sky-300"
                            : "bg-black/30 text-slate-400 cursor-not-allowed border border-white/15"
                        }`}
                      >
                        {isPostingLinkedIn ? "Posting to LinkedIn..." : "Post selected to LinkedIn"}
                      </button>
                    </div>
                  </div>

                  {selectedVariant && (
                    <div className="rounded-xl border border-white/15 bg-black/30 p-3 space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-300">Primary text (generated)</p>
                        <p className="text-sm whitespace-pre-wrap text-slate-50">{selectedVariant.primary_text}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-slate-300">Headline</p>
                        <p className="text-sm text-slate-50">{selectedVariant.headline}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-50">Platform preview</h2>
                <div className="inline-flex rounded-full border border-white/20 bg-black/30 p-1 text-[11px]">
                  {(["meta", "linkedin", "google"] as PlatformPreviewType[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPreviewPlatform(p)}
                      className={`px-3 py-1 rounded-full ${
                        previewPlatform === p ? "bg-emerald-400 text-slate-950" : "text-slate-100"
                      }`}
                    >
                      {p[0].toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {selectedVariant ? (
                <PlatformPreview
                  platform={previewPlatform}
                  primaryText={selectedVariant.primary_text}
                  headline={selectedVariant.headline}
                  url={url}
                  pageName="Root Health"
                />
              ) : (
                <p className="text-xs text-slate-300">
                  Generate variants and select one to see how it will look on each platform.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-xs text-slate-200 space-y-2 shadow-lg">
              <p className="font-semibold text-slate-50">How this works (Supabase)</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  The campaign settings are saved to <code>campaigns</code>.
                </li>
                <li>
                  Each A/B/C variant is saved to <code>campaign_variants</code> linked to that campaign.
                </li>
                <li>
                  Export copies your setup + copy to clipboard so you can recreate it quickly in Meta / LinkedIn / Google Ads.
                </li>
                <li>
                  (Optional) If platform is <strong>LinkedIn</strong>, you can post the selected variant organically from here.
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
