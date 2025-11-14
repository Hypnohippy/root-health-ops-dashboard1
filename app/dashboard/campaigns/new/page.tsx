"use client";

import React, { useState } from "react";

type Variant = {
  primary_text: string;
  headline: string;
};

type StructuredAd = {
  hook: string;
  before: string[];
  after: string[];
  explainer: string;
  ctas: string[];
  button?: {
    label: string;
    url: string;
  };
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
  // Mode
  const [mode, setMode] = useState<"short" | "structured">("short");

  // Core campaign fields
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("Meta");
  const [objective, setObjective] = useState("Leads");
  const [budgetDaily, setBudgetDaily] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("United Kingdom");
  const [ageRange, setAgeRange] = useState("25-55");
  const [audienceKeywords, setAudienceKeywords] = useState(
    "stress, burnout, anxiety, overwhelm"
  );
  const [url, setUrl] = useState("https://roothealth.app");
  const [mediaUrl, setMediaUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  // UTM
  const [utmSource, setUtmSource] = useState("facebook");
  const [utmMedium, setUtmMedium] = useState("paid_social");
  const [utmCampaign, setUtmCampaign] = useState("root_health_launch");

  // Short variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(
    null
  );
  const [previewPlatform, setPreviewPlatform] =
    useState<PlatformPreviewType>("meta");

  // Structured ad
  const [structuredAd, setStructuredAd] = useState<StructuredAd | null>(null);

  // Long-form fields (derived/overridable)
  const [hook, setHook] = useState("");
  const [beforeItems, setBeforeItems] = useState<string>("");
  const [afterItems, setAfterItems] = useState<string>("");
  const [explainer, setExplainer] = useState("");
  const [ctasText, setCtasText] = useState<string>("");
  const [buttonLabel, setButtonLabel] = useState("Find out more");

  // Status
  const [isGeneratingShort, setIsGeneratingShort] = useState(false);
  const [isGeneratingStructured, setIsGeneratingStructured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetMessages() {
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
    } catch (e) {
      setError("Invalid URL. Please check it starts with http:// or https://");
    }
  }

  async function handleGenerateShortVariants() {
    resetMessages();
    setIsGeneratingShort(true);
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
      setMessage("Generated 3 ad variants.");
    } catch (e: any) {
      setError(e?.message || "Error generating variants");
    } finally {
      setIsGeneratingShort(false);
    }
  }

  async function handleGenerateStructured() {
    resetMessages();
    setIsGeneratingStructured(true);
    try {
      const res = await fetch("/api/ai/campaign/structured", {
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
        setError(data.error || "Failed to generate structured ad");
        return;
      }

      const structured: StructuredAd = {
        hook: data.hook || "",
        before: data.before || [],
        after: data.after || [],
        explainer: data.explainer || "",
        ctas: data.ctas || [],
        button: data.button,
      };

      setStructuredAd(structured);
      setHook(structured.hook || "");
      setBeforeItems((structured.before || []).join("\n"));
      setAfterItems((structured.after || []).join("\n"));
      setExplainer(structured.explainer || "");
      setCtasText((structured.ctas || []).join("\n"));
      if (structured.button?.label) setButtonLabel(structured.button.label);
      if (structured.button?.url) setUrl(structured.button.url);

      setMessage("Structured long-form ad generated.");
    } catch (e: any) {
      setError(e?.message || "Error generating structured ad");
    } finally {
      setIsGeneratingStructured(false);
    }
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
      button_label: buttonLabel || "Find out more",
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      status: "draft",
    };
  }

  async function saveCampaignFromVariant(
    variantIndex: number,
    abGroup: "A" | "B" | "C"
  ) {
    const variant = variants[variantIndex];
    if (!variant) return;

    const payload = {
      ...baseCampaignPayload(),
      primary_text: variant.primary_text,
      headline: variant.headline,
      hook: hook || null,
      before_items: beforeItems || null,
      after_items: afterItems || null,
      explainer: explainer || null,
      ctas_text: ctasText || null,
      long_form: null,
      ab_group: abGroup,
    };

    await saveCampaign(payload);
  }

  async function handleSaveSelectedVariant() {
    resetMessages();
    if (selectedVariantIndex === null) {
      setError("No variant selected");
      return;
    }
    setIsSaving(true);
    try {
      await saveCampaignFromVariant(selectedVariantIndex, "A");
      setMessage("Selected variant saved as A.");
    } catch (e: any) {
      setError(e?.message || "Error saving selected variant");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveAllVariants() {
    resetMessages();
    if (!variants.length) {
      setError("No variants to save");
      return;
    }
    setIsSaving(true);
    try {
      const labels: ("A" | "B" | "C")[] = ["A", "B", "C"];
      const toSave = variants.slice(0, 3);
      await Promise.all(
        toSave.map((_, idx) => saveCampaignFromVariant(idx, labels[idx]))
      );
      setMessage("Saved variants A, B, C.");
    } catch (e: any) {
      setError(e?.message || "Error saving all variants");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveStructured() {
    resetMessages();
    if (!structuredAd) {
      setError("No structured ad to save yet");
      return;
    }
    setIsSaving(true);
    try {
      const longForm = [
        hook && `HOOK:\n${hook}`,
        beforeItems && `\n\nBEFORE:\n${beforeItems}`,
        afterItems && `\n\nAFTER:\n${afterItems}`,
        explainer && `\n\nEXPLAINER:\n${explainer}`,
        ctasText && `\n\nCTAS:\n${ctasText}`,
      ]
        .filter(Boolean)
        .join("");

      const payload = {
        ...baseCampaignPayload(),
        primary_text: explainer || structuredAd.explainer || "",
        headline: hook || structuredAd.hook || "",
        hook: hook || null,
        before_items: beforeItems || null,
        after_items: afterItems || null,
        explainer: explainer || null,
        ctas_text: ctasText || null,
        long_form: longForm || null,
        ab_group: "A",
      };

      await saveCampaign(payload);
      setMessage("Structured long-form campaign saved.");
    } catch (e: any) {
      setError(e?.message || "Error saving structured campaign");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedVariant =
    selectedVariantIndex !== null ? variants[selectedVariantIndex] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              New Campaign – Root Health
            </h1>
            <p className="text-sm text-gray-600">
              Generate AI-powered ads, preview by platform, and save A/B/C
              variants to Airtable.
            </p>
          </div>
          <div className="inline-flex rounded-full border bg-white p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("short")}
              className={`px-3 py-1 rounded-full ${
                mode === "short"
                  ? "bg-black text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              Short variants
            </button>
            <button
              type="button"
              onClick={() => setMode("structured")}
              className={`px-3 py-1 rounded-full ${
                mode === "structured"
                  ? "bg-black text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              Structured long-form
            </button>
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

        {/* Layout: left form, right preview */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
          {/* LEFT COLUMN – FORM */}
          <div className="space-y-6">
            {/* Core settings */}
            <section className="rounded-xl border bg-white p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Campaign settings</h2>
                <span className="text-[11px] text-gray-500">
                  Saved into Airtable &quot;Campaigns&quot;
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Campaign name
                  </label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Root Health – Stress reset"
                  />
                  <p className="text-[11px] text-gray-500">
                    Internal name so you recognise this later.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Platform
                  </label>
                  <select
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    <option>Meta</option>
                    <option>LinkedIn</option>
                    <option>Google</option>
                    <option>TikTok</option>
                  </select>
                  <p className="text-[11px] text-gray-500">
                    Used to shape the copy & preview.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Objective
                  </label>
                  <select
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                  >
                    <option>Leads</option>
                    <option>Traffic</option>
                    <option>Awareness</option>
                  </select>
                  <p className="text-[11px] text-gray-500">
                    Changes the tone & CTA the AI uses.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Daily budget (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={budgetDaily}
                    onChange={(e) => setBudgetDaily(e.target.value)}
                    placeholder="10"
                  />
                  <p className="text-[11px] text-gray-500">
                    For planning & reporting – not used by AI.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Start date
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    End date
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Location
                  </label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="United Kingdom"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Age range
                  </label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={ageRange}
                    onChange={(e) => setAgeRange(e.target.value)}
                    placeholder="25-55"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Audience keywords
                </label>
                <textarea
                  className="w-full rounded-md border px-2 py-1.5 text-sm min-h-[60px]"
                  value={audienceKeywords}
                  onChange={(e) => setAudienceKeywords(e.target.value)}
                  placeholder="stress, burnout, anxiety, overwhelm, can't switch off"
                />
                <p className="text-[11px] text-gray-500">
                  Sent to the AI so it understands who&apos;s seeing this.
                </p>
              </div>
            </section>

            {/* UTM + URL */}
            <section className="rounded-xl border bg-white p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Landing page & tracking</h2>
                <span className="text-[11px] text-gray-500">
                  URL is used in the copy & button.
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Landing page URL</label>
                <input
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://roothealth.app"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">utm_source</label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                    placeholder="facebook"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">utm_medium</label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                    placeholder="paid_social"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">utm_campaign</label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                    placeholder="root_health_launch"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={applyUtmToUrl}
                className="inline-flex items-center rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white"
              >
                Apply UTM to URL
              </button>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Image URL (optional)
                  </label>
                  <input
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://..."
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
                    placeholder="https://..."
                  />
                </div>
              </div>
            </section>

            {/* Mode-specific content */}
            {mode === "short" ? (
              <section className="rounded-xl border bg-white p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">
                    Short ad variants (A/B/C)
                  </h2>
                  <button
                    type="button"
                    onClick={handleGenerateShortVariants}
                    disabled={isGeneratingShort}
                    className="inline-flex items-center rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {isGeneratingShort ? "Generating..." : "Generate 3 variants"}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  2–4 sentence primary text + 4–8 word headline, designed for
                  quick A/B/C testing.
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
                          onClick={handleSaveSelectedVariant}
                          disabled={
                            isSaving || selectedVariantIndex === null
                          }
                          className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          Save selected
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAllVariants}
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
                          <p className="text-sm">
                            {selectedVariant.headline}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-xl border bg-white p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">
                    Structured long-form ad
                  </h2>
                  <button
                    type="button"
                    onClick={handleGenerateStructured}
                    disabled={isGeneratingStructured}
                    className="inline-flex items-center rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {isGeneratingStructured
                      ? "Generating..."
                      : "Generate structured ad"}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Hook, BEFORE/AFTER checklists, explainer, CTAs and button
                  ready to format into posts or landing copy.
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Hook</label>
                    <textarea
                      className="w-full rounded-md border px-2 py-1.5 text-sm min-h-[60px]"
                      value={hook}
                      onChange={(e) => setHook(e.target.value)}
                      placeholder="The moment you realise stress has quietly taken over your life..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      Button label
                    </label>
                    <input
                      className="w-full rounded-md border px-2 py-1.5 text-sm"
                      value={buttonLabel}
                      onChange={(e) => setButtonLabel(e.target.value)}
                      placeholder="Find out more"
                    />
                    <p className="text-[11px] text-gray-500">
                      Saved into Airtable as button_label.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      BEFORE list (one per line)
                    </label>
                    <textarea
                      className="w-full rounded-md border px-2 py-1.5 text-sm min-h-[80px]"
                      value={beforeItems}
                      onChange={(e) => setBeforeItems(e.target.value)}
                      placeholder="• Struggle to switch off at night&#10;• Living on autopilot..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      AFTER list (one per line)
                    </label>
                    <textarea
                      className="w-full rounded-md border px-2 py-1.5 text-sm min-h-[80px]"
                      value={afterItems}
                      onChange={(e) => setAfterItems(e.target.value)}
                      placeholder="• Clearer head and calmer body&#10;• Space in the day that feels like yours again..."
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Explainer paragraph
                  </label>
                  <textarea
                    className="w-full rounded-md border px-2 py-1.5 text-sm min-h-[80px]"
                    value={explainer}
                    onChange={(e) => setExplainer(e.target.value)}
                    placeholder="Root Health is your self-paced, practical guide to understanding what your mind and body are trying to tell you..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    CTAs (one per line)
                  </label>
                  <textarea
                    className="w-full rounded-md border px-2 py-1.5 text-sm min-h-[80px]"
                    value={ctasText}
                    onChange={(e) => setCtasText(e.target.value)}
                    placeholder="Start your reset today&#10;See your stress patterns in one place&#10;Take the next gentle step"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSaveStructured}
                    disabled={isSaving}
                    className="inline-flex items-center rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    Save structured campaign
                  </button>
                </div>
              </section>
            )}
          </div>

          {/* RIGHT COLUMN – PREVIEW */}
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

              {mode === "short" && selectedVariant ? (
                <PlatformPreview
                  platform={previewPlatform}
                  primaryText={selectedVariant.primary_text}
                  headline={selectedVariant.headline}
                  url={url}
                  pageName="Root Health"
                />
              ) : mode === "structured" ? (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-gray-500">
                    Previewing structured content as a scrollable social post:
                  </p>
                  <div className="rounded-xl border bg-gray-50 p-3 space-y-3">
                    {hook && (
                      <p className="font-semibold whitespace-pre-wrap">
                        {hook}
                      </p>
                    )}
                    {beforeItems && (
                      <div>
                        <p className="text-[11px] uppercase text-gray-500 font-semibold">
                          Before
                        </p>
                        <ul className="list-disc pl-4 whitespace-pre-wrap">
                          {beforeItems
                            .split("\n")
                            .filter(Boolean)
                            .map((item, idx) => (
                              <li key={idx}>{item.replace(/^•\s?/, "")}</li>
                            ))}
                        </ul>
                      </div>
                    )}
                    {afterItems && (
                      <div>
                        <p className="text-[11px] uppercase text-gray-500 font-semibold">
                          After
                        </p>
                        <ul className="list-disc pl-4 whitespace-pre-wrap">
                          {afterItems
                            .split("\n")
                            .filter(Boolean)
                            .map((item, idx) => (
                              <li key={idx}>{item.replace(/^•\s?/, "")}</li>
                            ))}
                        </ul>
                      </div>
                    )}
                    {explainer && (
                      <p className="whitespace-pre-wrap">{explainer}</p>
                    )}
                    {ctasText && (
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase text-gray-500 font-semibold">
                          Calls to action
                        </p>
                        <ul className="list-disc pl-4 whitespace-pre-wrap">
                          {ctasText
                            .split("\n")
                            .filter(Boolean)
                            .map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                        </ul>
                      </div>
                    )}
                    <div className="pt-2">
                      <button className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white">
                        {buttonLabel || "Find out more"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Generate a short variant or structured ad to see a preview
                  here.
                </p>
              )}
            </section>

            {/* Tiny explainer box */}
            <section className="rounded-xl border bg-white p-4 space-y-2 text-xs text-gray-600">
              <p className="font-semibold text-gray-800">
                How this saves into Airtable
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  Short mode uses <code>primary_text</code>,{" "}
                  <code>headline</code> and <code>ab_group</code> (A/B/C).
                </li>
                <li>
                  Structured mode fills <code>hook</code>,{" "}
                  <code>before_items</code>, <code>after_items</code>,{" "}
                  <code>explainer</code>, <code>ctas_text</code> and{" "}
                  <code>long_form</code>.
                </li>
                <li>
                  URL + UTM fields go into <code>url</code>,{" "}
                  <code>utm_source</code>, <code>utm_medium</code>,{" "}
                  <code>utm_campaign</code>.
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
