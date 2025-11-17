"use client";

import React, { useState } from "react";

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
        <p className="text-sm whitespace-pre-wrap text-slate-50">
          {primaryText}
        </p>
        <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20">
          <div className="h-36 bg-gradient-to-br from-slate-600/70 via-slate-500/60 to-emerald-500/40" />
          <div className="p-3">
            <div className="text-[11px] uppercase text-slate-300 tracking-wide">
              {url?.replace(/^https?:\/\//, "") || "roothealth.app"}
            </div>
            <div className="text-sm font-semibold text-slate-50">
              {headline}
            </div>
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
        <p className="text-sm whitespace-pre-wrap text-slate-50">
          {primaryText}
        </p>
        <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20">
          <div className="h-32 bg-gradient-to-br from-sky-600/70 via-sky-500/60 to-emerald-500/40" />
          <div className="p-3">
            <div className="text-xs text-slate-300">
              {url?.replace(/^https?:\/\//, "") || "roothealth.app"}
            </div>
            <div className="text-sm font-semibold text-slate-50">
              {headline}
            </div>
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
      <p className="text-sm text-slate-100 whitespace-pre-wrap">
        {primaryText}
      </p>
    </div>
  );
}

export default function NewCampaignPage() {
  // core fields
  const [name, setName] = useState("Root Health – December Stress Relief");
  const [platform, setPlatform] = useState("Meta (Facebook/IG)");
  const [objective, setObjective] = useState<"Leads" | "Traffic" | "Awareness">(
    "Leads"
  );
  const [budgetDaily, setBudgetDaily] = useState("10");
  const [url, setUrl] = useState("https://roothealth.app");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("United Kingdom");
  const [ageRange, setAgeRange] = useState("25-54");
  const [audienceKeywords, setAudienceKeywords] = useState(
    "burnout, stress, anxiety, self care, therapy"
  );
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
  const [selectedVariantIndex, setSelectedVariantIndex] =
    useState<number | null>(null);
  const [previewPlatform, setPreviewPlatform] =
    useState<PlatformPreviewType>("meta");

  // status
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPostingLinkedIn, setIsPostingLinkedIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          platform,
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
          lengthMode === "short"
            ? "short"
            : lengthMode === "long"
            ? "long-form"
            : "medium-length"
        } ad variants.`
      );
    } catch (e: any) {
      setError(e?.message || "Error generating variants");
    } finally {
      setIsGenerating(false);
    }
  }

  function baseCampaignPayload() {
    return {
      name: name || "Root Health campaign",
      platform,
      objective,
      budget_daily: budgetDaily || null,
      start_date: startDate || null,
      end_date: endDate || null,
      location,
      age_range: ageRange,
      audience_keywords: audienceKeywords,
      url,
      media_url: mediaUrl || null,
      video_url: videoUrl || null,
      button_label: "Find out more",
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      status: "draft",
    };
  }

  async function saveCampaign(payload: any) {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to save campaign");
    }
  }

  async function saveFromVariant(index: number, abGroup: "A" | "B" | "C") {
    const v = variants[index];
    if (!v) return;

    const payload = {
      ...baseCampaignPayload(),
      primary_text: v.primary_text,
      headline: v.headline,
      hook: null,
      before_items: null,
      after_items: null,
      explainer: null,
      ctas_text: null,
      long_form: null,
      ab_group: abGroup,
    };

    await saveCampaign(payload);
  }

  async function handleSaveSelected() {
    resetNotices();
    if (selectedVariantIndex === null) {
      setError("No variant selected");
      return;
    }
    setIsSaving(true);
    try {
      await saveFromVariant(selectedVariantIndex, "A");
      setMessage("Selected variant saved as A.");
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
      const toSave = variants.slice(0, 3);
      await Promise.all(
        toSave.map((_, idx) => saveFromVariant(idx, labels[idx]))
      );
      setMessage("Saved variants A, B, C.");
    } catch (e: any) {
      setError(e?.message || "Error saving all variants");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePostSelectedToLinkedIn() {
    resetNotices();

    if (selectedVariantIndex === null || !variants[selectedVariantIndex]) {
      setError("No variant selected");
      return;
    }

    if (platform !== "LinkedIn") {
      setError("Set platform to LinkedIn to post directly.");
      return;
    }

    const v = variants[selectedVariantIndex];

    // Compose the post: ad text + URL on a new line so people can click through
    const text = `${v.primary_text}\n\n${url}`;

    try {
      setIsPostingLinkedIn(true);
      const res = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
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

  const selectedVariant =
    selectedVariantIndex !== null ? variants[selectedVariantIndex] : null;

  const canPostToLinkedIn =
    !!selectedVariant && platform === "LinkedIn" && !isPostingLinkedIn;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">
              New Campaign – Root Health
            </h1>
            <p className="text-sm text-slate-300">
              Your glass cockpit for ad creation. Choose ad length, generate
              performance copy, preview by platform, save A/B/C variants – and
              post to LinkedIn in one click.
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
          {/* LEFT SIDE */}
          <div className="space-y-6">
            {/* Campaign settings */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">
                Campaign settings
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Campaign name
                    <HelpTip text="Internal name only – used so you and your team can recognise this campaign later." />
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Platform
                    <HelpTip text="Where this campaign will run. Used to shape the tone (e.g. more emotional for Meta, more stats-led for LinkedIn)." />
                  </label>
                  <select
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    <option>Meta (Facebook/IG)</option>
                    <option>LinkedIn</option>
                    <option>Google</option>
                    <option>TikTok</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Objective
                    <HelpTip text="Leads = capture signups/interest, Traffic = drive clicks, Awareness = get seen and remembered." />
                  </label>
                  <select
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={objective}
                    onChange={(e) =>
                      setObjective(
                        e.target.value as "Leads" | "Traffic" | "Awareness"
                      )
                    }
                  >
                    <option>Leads</option>
                    <option>Traffic</option>
                    <option>Awareness</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Daily budget (£)
                    <HelpTip text="Planning only – this is stored for reporting and ad planning, not sent to ad networks." />
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={budgetDaily}
                    onChange={(e) => setBudgetDaily(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Start date
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    End date (optional)
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Location
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Age range
                  </label>
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
                  <HelpTip text="Rough description of who this is for – job roles, struggles or interests. Used to point the AI at the right person." />
                </label>
                <textarea
                  className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400 min-h-[60px]"
                  value={audienceKeywords}
                  onChange={(e) => setAudienceKeywords(e.target.value)}
                />
                <p className="text-[11px] text-slate-300">
                  Example: "burnout, NHS staff, senior leaders, new mums, ADHD,
                  small business owners".
                </p>
              </div>
            </section>

            {/* URL + UTM */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">
                Landing URL & tracking
              </h2>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">
                  Landing URL
                  <HelpTip text="Where the ad sends people. Usually a Root Health landing page, quiz or signup page." />
                </label>
                <input
                  className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    utm_source
                    <HelpTip text="Where the click comes from (e.g. facebook, linkedin). Shows up in analytics." />
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    utm_medium
                    <HelpTip text="Type of traffic (e.g. paid_social, email, referral)." />
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    utm_campaign
                    <HelpTip text="Name of this campaign in analytics. Matches what you use in ads so reporting is clean." />
                  </label>
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
                  <label className="text-xs font-medium text-slate-200">
                    Media URL (optional)
                    <HelpTip text="Image URL for the ad preview and future automatic posting." />
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Video URL (optional)
                    <HelpTip text="Video file URL if you're using video creative with this copy." />
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Variants + Length + Actions */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-50">
                    Ad variants (A/B/C)
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    3 creative angles, same audience & settings. Perfect for
                    testing what actually converts.
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

              {/* Ad length selector */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-slate-200">
                  Ad length
                  <HelpTip text="Short = punchy and fast. Medium = full but scannable. Long = story-style ad with deeper emotional build." />
                </p>
                <div className="inline-flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setLengthMode("short")}
                    className={`rounded-full px-3 py-1 text-xs border ${
                      lengthMode === "short"
                        ? "bg-emerald-400 text-slate-950 border-emerald-300"
                        : "bg-black/30 text-slate-100 border-white/20"
                    }`}
                  >
                    Short (2–4 sentences)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLengthMode("medium")}
                    className={`rounded-full px-3 py-1 text-xs border ${
                      lengthMode === "medium"
                        ? "bg-emerald-400 text-slate-950 border-emerald-300"
                        : "bg-black/30 text-slate-100 border-white/20"
                    }`}
                  >
                    Medium (120–220 words)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLengthMode("long")}
                    className={`rounded-full px-3 py-1 text-xs border ${
                      lengthMode === "long"
                        ? "bg-emerald-400 text-slate-950 border-emerald-300"
                        : "bg-black/30 text-slate-100 border-white/20"
                    }`}
                  >
                    Long (story-style)
                  </button>
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
                        onClick={handlePostSelectedToLinkedIn}
                        disabled={!canPostToLinkedIn}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium shadow-md ${
                          canPostToLinkedIn
                            ? "bg-sky-400 text-slate-950 hover:bg-sky-300"
                            : "bg-black/30 text-slate-400 cursor-not-allowed border border-white/15"
                        }`}
                      >
                        {isPostingLinkedIn
                          ? "Posting to LinkedIn..."
                          : "Post selected to LinkedIn"}
                      </button>
                    </div>
                  </div>

                  {selectedVariant && (
                    <div className="rounded-xl border border-white/15 bg-black/30 p-3 space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-300">
                          Primary text (generated)
                        </p>
                        <p className="text-sm whitespace-pre-wrap text-slate-50">
                          {selectedVariant.primary_text}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-slate-300">
                          Headline
                        </p>
                        <p className="text-sm text-slate-50">
                          {selectedVariant.headline}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT SIDE – PREVIEW + INFO */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-50">
                  Platform preview
                </h2>
                <div className="inline-flex rounded-full border border-white/20 bg-black/30 p-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform("meta")}
                    className={`px-3 py-1 rounded-full ${
                      previewPlatform === "meta"
                        ? "bg-emerald-400 text-slate-950"
                        : "text-slate-100"
                    }`}
                  >
                    Meta
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform("linkedin")}
                    className={`px-3 py-1 rounded-full ${
                      previewPlatform === "linkedin"
                        ? "bg-emerald-400 text-slate-950"
                        : "text-slate-100"
                    }`}
                  >
                    LinkedIn
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform("google")}
                    className={`px-3 py-1 rounded-full ${
                      previewPlatform === "google"
                        ? "bg-emerald-400 text-slate-950"
                        : "text-slate-100"
                    }`}
                  >
                    Google
                  </button>
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
                  Generate variants and select one to see how it will look on
                  each platform.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-xs text-slate-200 space-y-2 shadow-lg">
              <p className="font-semibold text-slate-50">
                How this connects to Airtable
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  Each variant is saved as a row in <code>Campaigns</code> with{" "}
                  <code>primary_text</code>, <code>headline</code> and{" "}
                  <code>ab_group</code> (A/B/C).
                </li>
                <li>
                  Core fields like <code>name</code>, <code>platform</code>,{" "}
                  <code>objective</code>, <code>budget_daily</code>,{" "}
                  <code>start_date</code>, <code>end_date</code> and{" "}
                  <code>audience_keywords</code> are shared across the group.
                </li>
                <li>
                  URL & UTM go into <code>url</code>, <code>utm_source</code>,{" "}
                  <code>utm_medium</code>, <code>utm_campaign</code>.
                </li>
                <li>
                  When platform is set to <strong>LinkedIn</strong>, you can
                  post the selected variant straight from this page using your
                  connected LinkedIn account.
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
