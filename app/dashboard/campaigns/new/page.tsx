"use client";

import React, { useState } from "react";

type Variant = {
  primary_text: string;
  headline: string;
};

type PlatformPreviewType = "meta" | "linkedin" | "google";

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
      <div className="rounded-xl border bg-white p-4 text-sm max-w-xl space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-gray-300" />
          <div>
            <div className="font-semibold">{pageName}</div>
            <div className="text-xs text-gray-500">Sponsored · Meta</div>
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap">{primaryText}</p>
        <div className="border rounded-lg overflow-hidden">
          <div className="h-36 bg-gray-200" />
          <div className="p-3">
            <div className="text-[11px] uppercase text-gray-500 tracking-wide">
              {url?.replace(/^https?:\/\//, "") || "roothealth.app"}
            </div>
            <div className="text-sm font-semibold">{headline}</div>
          </div>
        </div>
      </div>
    );
  }

  if (platform === "linkedin") {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm max-w-xl space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-gray-300" />
          <div>
            <div className="font-semibold">{pageName}</div>
            <div className="text-xs text-gray-500">Promoted · LinkedIn</div>
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap">{primaryText}</p>
        <div className="border rounded-lg overflow-hidden">
          <div className="h-32 bg-gray-200" />
          <div className="p-3">
            <div className="text-xs text-gray-500">
              {url?.replace(/^https?:\/\//, "") || "roothealth.app"}
            </div>
            <div className="text-sm font-semibold">{headline}</div>
          </div>
        </div>
      </div>
    );
  }

  // google
  return (
    <div className="rounded-xl border bg-white p-4 text-sm max-w-xl space-y-2">
      <div className="text-xs text-gray-500">Sponsored · Google</div>
      <div className="text-[11px] text-green-700">
        {url?.replace(/^https?:\/\//, "") || "roothealth.app"}
      </div>
      <div className="text-base font-semibold">{headline}</div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{primaryText}</p>
    </div>
  );
}

export default function NewCampaignPage() {
  // core fields
  const [name, setName] = useState("Root Health – December Stress Relief");
  const [platform, setPlatform] = useState("Meta (Facebook/IG)");
  const [objective, setObjective] = useState("Leads");
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

  // variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(
    null
  );
  const [previewPlatform, setPreviewPlatform] =
    useState<PlatformPreviewType>("meta");

  // status
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
      setMessage("Generated 3 ad-style variants.");
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

  const selectedVariant =
    selectedVariantIndex !== null ? variants[selectedVariantIndex] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">
              New Campaign – Root Health
            </h1>
            <p className="text-sm text-gray-600">
              Generate ad-style copy, preview by platform and save A/B/C
              variants into Airtable.
            </p>
          </div>
        </header>

        {(message || error) && (
          <div className="space-y-2">
            {message && (
              <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                {message}
              </div>
            )}
            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Campaign settings */}
            <section className="rounded-xl border bg-white p-4 space-y-4">
              <h2 className="text-sm font-semibold">Campaign settings</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Campaign name</label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Platform</label>
                  <select
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
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
                  <label className="text-xs font-medium">Objective</label>
                  <select
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                  >
                    <option>Leads</option>
                    <option>Traffic</option>
                    <option>Awareness</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Daily budget (£)
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={budgetDaily}
                    onChange={(e) => setBudgetDaily(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Start date</label>
                  <input
                    type="date"
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    End date (optional)
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Location</label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Age range</label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={ageRange}
                    onChange={(e) => setAgeRange(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Audience keywords (comma-separated)
                </label>
                <textarea
                  className="w-full rounded-md border px-2 py-1.5 text-sm min-h-[60px]"
                  value={audienceKeywords}
                  onChange={(e) => setAudienceKeywords(e.target.value)}
                />
              </div>
            </section>

            {/* URL + UTM */}
            <section className="rounded-xl border bg-white p-4 space-y-4">
              <h2 className="text-sm font-semibold">
                Landing URL & tracking
              </h2>
              <div className="space-y-1">
                <label className="text-xs font-medium">Landing URL</label>
                <input
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">utm_source</label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">utm_medium</label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">utm_campaign</label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={applyUtmToUrl}
                className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white"
              >
                Apply UTM to URL
              </button>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Media URL (optional)
                  </label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Video URL (optional)
                  </label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Variants */}
            <section className="rounded-xl border bg-white p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  Short ad variants (A/B/C)
                </h2>
                <button
                  type="button"
                  onClick={handleGenerateVariants}
                  disabled={isGenerating}
                  className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {isGenerating ? "Generating..." : "Generate 3 ad variants"}
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                The AI will create before/after style ads with emojis and a CTA,
                ready to test.
              </p>

              {variants.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      {variants.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedVariantIndex(idx)}
                          className={`rounded-full px-3 py-1 text-xs border ${
                            selectedVariantIndex === idx
                              ? "bg-black text-white"
                              : "bg-white text-black"
                          }`}
                        >
                          Variant {["A", "B", "C"][idx] || idx + 1}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveSelected}
                        disabled={isSaving || selectedVariantIndex === null}
                        className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        Save selected
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAll}
                        disabled={isSaving || variants.length === 0}
                        className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        Save all 3 (A/B/C)
                      </button>
                    </div>
                  </div>

                  {selectedVariant && (
                    <div className="rounded-lg border bg-gray-50 p-3 space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold text-gray-600">
                          Primary text
                        </p>
                        <p className="text-sm whitespace-pre-wrap">
                          {selectedVariant.primary_text}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-gray-600">
                          Headline
                        </p>
                        <p className="text-sm">{selectedVariant.headline}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT – PREVIEW */}
          <div className="space-y-4">
            <section className="rounded-xl border bg-white p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Platform preview</h2>
                <div className="inline-flex rounded-full border bg-gray-50 p-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform("meta")}
                    className={`px-3 py-1 rounded-full ${
                      previewPlatform === "meta"
                        ? "bg-black text-white"
                        : "text-gray-700"
                    }`}
                  >
                    Meta
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform("linkedin")}
                    className={`px-3 py-1 rounded-full ${
                      previewPlatform === "linkedin"
                        ? "bg-black text-white"
                        : "text-gray-700"
                    }`}
                  >
                    LinkedIn
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform("google")}
                    className={`px-3 py-1 rounded-full ${
                      previewPlatform === "google"
                        ? "bg-black text-white"
                        : "text-gray-700"
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
                <p className="text-xs text-gray-500">
                  Generate variants and select one to see how it will look on
                  each platform.
                </p>
              )}
            </section>

            <section className="rounded-xl border bg-white p-4 text-xs text-gray-600 space-y-2">
              <p className="font-semibold text-gray-800">
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
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
