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
        ctasText && `\n\nCTAS:\n${ctasText
