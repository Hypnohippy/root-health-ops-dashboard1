// app/org-setup/page.tsx
"use client";

import React, { useState, DragEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";

type BrandTone =
  | "warm"
  | "professional"
  | "playful"
  | "clinical"
  | "spiritual"
  | "direct";

type PostingFrequency = "low" | "medium" | "high";

type OrgSetupForm = {
  // Step 1 – org basics
  orgName: string;
  orgSlug: string;
  industry: string;
  orgSize: string;
  website: string;

  // Step 2 – brand
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  brandTone: BrandTone;
  logoFile: File | null;

  // Step 3 – team
  ownerName: string;
  ownerRole: string;
  inviteEmails: string;

  // Step 4 – social & platforms
  connectFacebook: boolean;
  connectInstagram: boolean;
  connectTiktok: boolean;
  connectLinkedin: boolean;
  connectGoogle: boolean;
  connectEmailNewsletter: boolean;
  connectWhatsApp: boolean;

  // Step 5 – content & media
  postingFrequency: PostingFrequency;
  goals: string[];
  contentTypes: string[];
  mediaFiles: File[];
};

const goalsOptions = [
  { id: "more_leads", label: "More therapy enquiries / leads" },
  { id: "fill_diary", label: "Fill empty diary slots" },
  { id: "nurture", label: "Nurture existing clients" },
  { id: "reactivation", label: "Re-activate past clients" },
  { id: "authority", label: "Build authority & trust" },
];

const contentTypeOptions = [
  { id: "education", label: "Educational posts" },
  { id: "stories", label: "Client stories (anonymous)" },
  { id: "reels", label: "Short video / reels" },
  { id: "emails", label: "Email newsletters" },
  { id: "ads", label: "Ads / promotions" },
];

const totalSteps = 5;

export default function OrgSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isBillingRedirect, setIsBillingRedirect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [form, setForm] = useState<OrgSetupForm>({
    orgName: "",
    orgSlug: "",
    industry: "",
    orgSize: "",
    website: "",

    primaryColor: "#2563eb",
    secondaryColor: "#0f172a",
    accentColor: "#f97316",
    brandTone: "warm",
    logoFile: null,

    ownerName: "",
    ownerRole: "Lead therapist",
    inviteEmails: "",

    connectFacebook: false,
    connectInstagram: false,
    connectTiktok: false,
    connectLinkedin: false,
    connectGoogle: false,
    connectEmailNewsletter: false,
    connectWhatsApp: false,

    postingFrequency: "medium",
    goals: ["more_leads", "fill_diary"],
    contentTypes: ["education", "stories"],
    mediaFiles: [],
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const toggleArrayField = (field: "goals" | "contentTypes", value: string) => {
    setForm((prev) => {
      const arr = prev[field];
      if (arr.includes(value)) {
        return { ...prev, [field]: arr.filter((v) => v !== value) };
      }
      return { ...prev, [field]: [...arr, value] };
    });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setForm((prev) => ({ ...prev, logoFile: file }));
  };

  const handleMediaDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    setForm((prev) => ({
      ...prev,
      mediaFiles: [...prev.mediaFiles, ...files],
    }));
  };

  const handleMediaInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setForm((prev) => ({
      ...prev,
      mediaFiles: [...prev.mediaFiles, ...files],
    }));
  };

  const handleNext = () => {
    if (step < totalSteps) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const handleSubmitOrgSetup = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Build FormData so we can send files (logo + media)
      const fd = new FormData();
      fd.append("orgName", form.orgName);
      fd.append("orgSlug", form.orgSlug);
      fd.append("industry", form.industry);
      fd.append("orgSize", form.orgSize);
      fd.append("website", form.website);

      fd.append("primaryColor", form.primaryColor);
      fd.append("secondaryColor", form.secondaryColor);
      fd.append("accentColor", form.accentColor);
      fd.append("brandTone", form.brandTone);

      fd.append("ownerName", form.ownerName);
      fd.append("ownerRole", form.ownerRole);
      fd.append("inviteEmails", form.inviteEmails);

      fd.append("connectFacebook", String(form.connectFacebook));
      fd.append("connectInstagram", String(form.connectInstagram));
      fd.append("connectTiktok", String(form.connectTiktok));
      fd.append("connectLinkedin", String(form.connectLinkedin));
      fd.append("connectGoogle", String(form.connectGoogle));
      fd.append("connectEmailNewsletter", String(form.connectEmailNewsletter));
      fd.append("connectWhatsApp", String(form.connectWhatsApp));

      fd.append("postingFrequency", form.postingFrequency);
      fd.append("goals", JSON.stringify(form.goals));
      fd.append("contentTypes", JSON.stringify(form.contentTypes));

      if (form.logoFile) {
        fd.append("logo", form.logoFile);
      }

      form.mediaFiles.forEach((file, idx) => {
        fd.append(`media_${idx}`, file);
      });

      // TODO: implement /api/org-setup to:
      // - create / update organisation in Supabase
      // - create org member (owner) if needed
      // - save brand + preferences
      // - upload logo + media to storage
      const res = await fetch("/api/org-setup", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save organisation setup");
      }

      setSuccessMessage("Organisation setup saved. You’re ready for billing & connections.");
      // Optionally auto-advance to last step
      if (step < totalSteps) {
        setStep(totalSteps);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong saving your setup.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBillingRedirect = async () => {
    setIsBillingRedirect(true);
    setError(null);

    try {
      // TODO: implement /api/billing/checkout
      // This should:
      // - create a Stripe customer + subscription for this org
      // - return { url } for Stripe Checkout or Billing Portal
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to start billing.");
      }

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No billing URL returned from server.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not start billing.");
      setIsBillingRedirect(false);
    }
  };

  const goToConnectPage = () => {
    // TODO: point this to your "Connect" / social-accounts page
    router.push("/connect");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl bg-slate-900/70 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Root Health Ops — Organisation Setup
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              A therapist-friendly setup to get your whole practice running on Root Health in minutes.
            </p>
          </div>
          {/* Simple mini-preview of brand colours */}
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-full border border-slate-700"
              style={{ backgroundColor: form.primaryColor }}
            />
            <div
              className="h-8 w-8 rounded-full border border-slate-700"
              style={{ backgroundColor: form.secondaryColor }}
            />
            <div
              className="h-8 w-8 rounded-full border border-slate-700"
              style={{ backgroundColor: form.accentColor }}
            />
          </div>
        </header>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-xs uppercase tracking-wide text-slate-400 mb-2">
            <span>Step {step} of {totalSteps}</span>
            <span>
              {step === 1 && "Clinic details"}
              {step === 2 && "Brand & logo"}
              {step === 3 && "Team & access"}
              {step === 4 && "Social connections"}
              {step === 5 && "Media & launch"}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Error / success */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmitOrgSetup}>
          {/* STEP CONTENT */}
          <div className="space-y-6">
            {/* Step 1 – org basics */}
            {step === 1 && (
              <section className="grid gap-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Clinic / organisation name
                  </label>
                  <input
                    type="text"
                    name="orgName"
                    value={form.orgName}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="e.g. Calm Minds Therapy"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    This is how we’ll label your workspace and Stripe subscription.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Workspace short name / slug
                  </label>
                  <input
                    type="text"
                    name="orgSlug"
                    value={form.orgSlug}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="e.g. calm-minds"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Used in URLs and internal references. Leave blank and we’ll generate one.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Therapy specialism / sector
                  </label>
                  <input
                    type="text"
                    name="industry"
                    value={form.industry}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="e.g. trauma therapy, CBT clinic, coaching"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Clinic size
                  </label>
                  <select
                    name="orgSize"
                    value={form.orgSize}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">Select size</option>
                    <option value="solo">Solo practitioner</option>
                    <option value="2-5">2–5 therapists</option>
                    <option value="6-15">6–15 therapists</option>
                    <option value="16-50">16–50 therapists</option>
                    <option value="51+">51+ therapists</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Website (optional)
                  </label>
                  <input
                    type="url"
                    name="website"
                    value={form.website}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="https://www.yourclinic.com"
                  />
                </div>
              </section>
            )}

            {/* Step 2 – brand & logo */}
            {step === 2 && (
              <section className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Upload your logo
                  </label>
                  <div className="flex items-center gap-4">
                    <label className="flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-slate-900/70 text-xs text-slate-400 cursor-pointer hover:border-blue-500">
                      <span className="text-center px-2">
                        {form.logoFile ? "Change logo" : "Upload logo"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoChange}
                      />
                    </label>
                    <div className="text-xs text-slate-400 space-y-1">
                      <p>PNG or SVG, ideally on transparent background.</p>
                      {form.logoFile && (
                        <p className="text-emerald-300">
                          Selected: {form.logoFile.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Brand tone of voice
                  </label>
                  <select
                    name="brandTone"
                    value={form.brandTone}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="warm">Warm & reassuring</option>
                    <option value="professional">Professional & grounded</option>
                    <option value="playful">Light & playful</option>
                    <option value="clinical">Clinical & precise</option>
                    <option value="spiritual">Spiritual & reflective</option>
                    <option value="direct">Direct & to the point</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-400">
                    We’ll align all AI-generated content with this tone.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Primary brand colour
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      name="primaryColor"
                      value={form.primaryColor}
                      onChange={handleChange}
                      className="h-10 w-16 rounded-lg border border-slate-700 bg-slate-900/80"
                    />
                    <input
                      type="text"
                      name="primaryColor"
                      value={form.primaryColor}
                      onChange={handleChange}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      placeholder="#2563eb"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Secondary brand colour
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      name="secondaryColor"
                      value={form.secondaryColor}
                      onChange={handleChange}
                      className="h-10 w-16 rounded-lg border border-slate-700 bg-slate-900/80"
                    />
                    <input
                      type="text"
                      name="secondaryColor"
                      value={form.secondaryColor}
                      onChange={handleChange}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      placeholder="#0f172a"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Accent colour
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      name="accentColor"
                      value={form.accentColor}
                      onChange={handleChange}
                      className="h-10 w-16 rounded-lg border border-slate-700 bg-slate-900/80"
                    />
                    <input
                      type="text"
                      name="accentColor"
                      value={form.accentColor}
                      onChange={handleChange}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      placeholder="#f97316"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Step 3 – team & access */}
            {step === 3 && (
              <section className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Your name
                    </label>
                    <input
                      type="text"
                      name="ownerName"
                      value={form.ownerName}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      placeholder="e.g. Dr Jane Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Your role
                    </label>
                    <input
                      type="text"
                      name="ownerRole"
                      value={form.ownerRole}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      placeholder="Lead therapist, clinical director..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Invite your team (optional)
                  </label>
                  <textarea
                    name="inviteEmails"
                    value={form.inviteEmails}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:border-blue-500 min-h-[80px]"
                    placeholder="Paste or type email addresses, separated by commas or new lines."
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    We’ll send them an invite once your workspace and subscription are active.
                  </p>
                </div>
              </section>
            )}

            {/* Step 4 – social connections */}
            {step === 4 && (
              <section className="space-y-6">
                <p className="text-sm text-slate-300">
                  Choose the channels you want Root Health to support. We’ll guide
                  you to connect each account securely after setup.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <ToggleCard
                    label="Facebook Page"
                    description="Schedule posts, boost reach and reply to comments."
                    checked={form.connectFacebook}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        connectFacebook: !prev.connectFacebook,
                      }))
                    }
                  />
                  <ToggleCard
                    label="Instagram"
                    description="Reels, stories and feed posts from the same content."
                    checked={form.connectInstagram}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        connectInstagram: !prev.connectInstagram,
                      }))
                    }
                  />
                  <ToggleCard
                    label="TikTok"
                    description="Short videos optimised for discoverability."
                    checked={form.connectTiktok}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        connectTiktok: !prev.connectTiktok,
                      }))
                    }
                  />
                  <ToggleCard
                    label="LinkedIn"
                    description="Professional presence and referral partner content."
                    checked={form.connectLinkedin}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        connectLinkedin: !prev.connectLinkedin,
                      }))
                    }
                  />
                  <ToggleCard
                    label="Google Business Profile"
                    description="Local SEO posts and updates."
                    checked={form.connectGoogle}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        connectGoogle: !prev.connectGoogle,
                      }))
                    }
                  />
                  <ToggleCard
                    label="Email newsletter"
                    description="Educational campaigns and gentle lead nurturing."
                    checked={form.connectEmailNewsletter}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        connectEmailNewsletter: !prev.connectEmailNewsletter,
                      }))
                    }
                  />
                  <ToggleCard
                    label="WhatsApp / messaging"
                    description="Automated follow-ups and gentle check-ins."
                    checked={form.connectWhatsApp}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        connectWhatsApp: !prev.connectWhatsApp,
                      }))
                    }
                  />
                </div>
              </section>
            )}

            {/* Step 5 – media & launch */}
            {step === 5 && (
              <section className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      How active do you want to be?
                    </label>
                    <div className="flex flex-col gap-2">
                      <RadioPill
                        name="postingFrequency"
                        value="low"
                        current={form.postingFrequency}
                        onChange={handleChange}
                        label="Gentle"
                        description="1–2 key posts per week"
                      />
                      <RadioPill
                        name="postingFrequency"
                        value="medium"
                        current={form.postingFrequency}
                        onChange={handleChange}
                        label="Steady"
                        description="3–4 posts per week"
                      />
                      <RadioPill
                        name="postingFrequency"
                        value="high"
                        current={form.postingFrequency}
                        onChange={handleChange}
                        label="Active"
                        description="Most days of the week"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Your priorities
                    </label>
                    <div className="grid gap-2">
                      {goalsOptions.map((g) => (
                        <label
                          key={g.id}
                          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
                            form.goals.includes(g.id)
                              ? "border-emerald-500 bg-emerald-500/10"
                              : "border-slate-700 bg-slate-900/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={form.goals.includes(g.id)}
                            onChange={() => toggleArrayField("goals", g.id)}
                          />
                          <span>{g.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Content you’re happy to create
                  </label>
                  <div className="grid gap-2 md:grid-cols-3">
                    {contentTypeOptions.map((c) => (
                      <label
                        key={c.id}
                        className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
                          form.contentTypes.includes(c.id)
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-slate-700 bg-slate-900/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={form.contentTypes.includes(c.id)}
                          onChange={() => toggleArrayField("contentTypes", c.id)}
                        />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    We’ll use this to pre-build campaigns and media suggestions.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Drop any existing media (optional)
                  </label>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleMediaDrop}
                    className="mt-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-slate-900/60 px-4 py-8 text-center text-sm text-slate-300"
                  >
                    <p>Drag and drop images or short videos here</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Think: clinic photos, branding, any short educational clips.
                    </p>
                    <label className="mt-3 inline-flex items-center rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1 text-xs cursor-pointer hover:border-blue-500">
                      Browse files
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={handleMediaInputChange}
                      />
                    </label>
                    {form.mediaFiles.length > 0 && (
                      <p className="mt-3 text-xs text-emerald-300">
                        {form.mediaFiles.length} file(s) added.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      Next: secure billing & plug-and-play social connections
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      We’ll never post without your approval. You stay in control — we do the heavy lifting.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                    <button
                      type="button"
                      onClick={goToConnectPage}
                      className="rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2 text-xs hover:border-blue-500"
                    >
                      Preview Connect setup
                    </button>
                    <button
                      type="button"
                      onClick={handleBillingRedirect}
                      disabled={isBillingRedirect}
                      className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                    >
                      {isBillingRedirect ? "Opening billing..." : "Continue to billing"}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Footer buttons */}
          <div className="mt-8 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-xs text-slate-500">
              You can change anything later in your organisation settings.
            </div>
            <div className="flex gap-2 justify-end">
              {step > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2 text-xs hover:border-slate-400"
                >
                  Back
                </button>
              )}
              {step < totalSteps && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-full bg-slate-100 px-4 py-2 text-xs font-medium text-slate-900 hover:bg-white"
                >
                  Next
                </button>
              )}
              {step === totalSteps && (
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-full bg-blue-500 px-4 py-2 text-xs font-medium text-slate-50 hover:bg-blue-400 disabled:opacity-60"
                >
                  {isSaving ? "Saving setup..." : "Save organisation setup"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Simple helper components */

function ToggleCard({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex h-full flex-col items-start rounded-2xl border px-4 py-3 text-left text-sm transition ${
        checked
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-slate-700 bg-slate-900/60 hover:border-slate-500"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
            checked
              ? "border-emerald-400 bg-emerald-500/40"
              : "border-slate-500 bg-slate-800"
          }`}
        >
          {checked ? "✓" : ""}
        </span>
        <span className="font-medium">{label}</span>
      </div>
      <p className="text-xs text-slate-400">{description}</p>
    </button>
  );
}

function RadioPill({
  name,
  value,
  current,
  onChange,
  label,
  description,
}: {
  name: string;
  value: PostingFrequency;
  current: PostingFrequency;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
  description: string;
}) {
  const active = current === value;
  return (
    <label
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm cursor-pointer ${
        active
          ? "border-blue-500 bg-blue-500/10"
          : "border-slate-700 bg-slate-900/60 hover:border-slate-500"
      }`}
    >
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-slate-400">{description}</div>
      </div>
      <input
        type="radio"
        name={name}
        value={value}
        checked={active}
        onChange={onChange}
        className="h-4 w-4"
      />
    </label>
  );
}
