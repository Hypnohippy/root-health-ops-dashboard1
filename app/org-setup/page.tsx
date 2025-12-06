"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type StepId = "org" | "brand" | "goals" | "channels";

type PostingFrequency = "low" | "medium" | "high";

type OrgFormState = {
  orgName: string;
  orgSlug: string;
  industry: string;
  orgSize: string;
  website: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  brandTone: string;
  ownerName: string;
  ownerRole: string;
  inviteEmails: string;
  postingFrequency: PostingFrequency;
  goals: string[];
  contentTypes: string[];
  connectFacebook: boolean;
  connectInstagram: boolean;
  connectTiktok: boolean;
  connectLinkedin: boolean;
  connectGoogle: boolean;
  connectEmailNewsletter: boolean;
  connectWhatsApp: boolean;
  logoFile: File | null;
  mediaFiles: File[];
};

const initialFormState: OrgFormState = {
  orgName: "",
  orgSlug: "",
  industry: "",
  orgSize: "",
  website: "",
  primaryColor: "#2563eb",
  secondaryColor: "#0f172a",
  accentColor: "#f97316",
  brandTone: "warm",
  ownerName: "",
  ownerRole: "Lead therapist",
  inviteEmails: "",
  postingFrequency: "medium",
  goals: [],
  contentTypes: [],
  connectFacebook: true,
  connectInstagram: true,
  connectTiktok: false,
  connectLinkedin: true,
  connectGoogle: false,
  connectEmailNewsletter: true,
  connectWhatsApp: false,
  logoFile: null,
  mediaFiles: [],
};

const goalOptions = [
  "Get more enquiries",
  "Fill group programmes",
  "Stay in touch with past clients",
  "Build referral network",
  "Educate and build trust",
];

const contentTypeOptions = [
  "Short posts",
  "Carousel posts",
  "Reels / video",
  "Email newsletters",
  "Blog-style articles",
];

const steps: { id: StepId; title: string; description: string }[] = [
  {
    id: "org",
    title: "Your organisation",
    description: "Who you are, how big you are and where people can find you.",
  },
  {
    id: "brand",
    title: "Brand and colours",
    description: "Set the visual tone so your content feels like you.",
  },
  {
    id: "goals",
    title: "Goals and content",
    description: "Tell us what success looks like and how you like to show up.",
  },
  {
    id: "channels",
    title: "Channels and assets",
    description: "Choose where we’ll post and drop in any key media.",
  },
];

// 🔹 Top-level page: just wraps inner logic in Suspense to satisfy Next.js
export default function OrgSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 px-6 py-4 text-sm text-slate-200">
            Loading organisation setup…
          </div>
        </div>
      }
    >
      <OrgSetupInner />
    </Suspense>
  );
}

// 🔹 All the real logic lives here
function OrgSetupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billingStatus = searchParams.get("billing");

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<OrgFormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [orgSummary, setOrgSummary] = useState<{
    name?: string;
    slug?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
const [coachLoading, setCoachLoading] = useState(false);
  const triggerCoach = async (reason: string, errorMessage?: string) => {
  try {
    setCoachLoading(true);
    setCoachMessage(null);

    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "onboarding",
        reason,
        stepId: steps[stepIndex]?.id ?? "unknown-step",
        orgName: form.orgName,
        industry: form.industry,
        errorMessage,
      }),
    });

    if (!res.ok) throw new Error("Coach request failed");

    const data = await res.json();
    setCoachMessage(data.message ?? null);
  } catch (err) {
    console.error("[coach] request error", err);
    setCoachMessage(
      "Something glitched while fetching advice, but this is almost always fixable. Try the last step again, and if it still fails, send a quick screenshot to support."
    );
  } finally {
    setCoachLoading(false);
  }
};



  // If billing=success, show the "workspace ready" screen
  if (billingStatus === "success") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-700 rounded-3xl shadow-xl p-8 md:p-10 backdrop-blur">
          <h1 className="text-2xl md:text-3xl font-semibold mb-3">
            Your Root Health workspace is ready
          </h1>
          <p className="text-sm text-slate-300 mb-4">
            Your organisation is set up and billing is active. You can now use
            Root Health Ops to manage content, campaigns and replies.
          </p>

          <div className="rounded-2xl border border-emerald-600/60 bg-emerald-500/10 px-4 py-3 mb-6 text-sm text-emerald-100">
            <p className="font-medium mb-1">What’s next?</p>
            <ul className="list-disc list-inside text-xs space-y-1 text-emerald-50/90">
              <li>Head to your Ops Dashboard to see everything in one place.</li>
              <li>
                Or open the Connect page to plug in Facebook, Instagram,
                LinkedIn and more.
              </li>
            </ul>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="flex-1 rounded-full bg-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-50 hover:bg-blue-400"
            >
              Go to Ops Dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push("/connect")}
              className="flex-1 rounded-full border border-slate-600 bg-slate-900/70 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:border-blue-400"
            >
              Go to Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Guard: if user already has an org, go straight to dashboard
  React.useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch("/api/org-status");
        if (!res.ok) {
          throw new Error("Failed to check org status");
        }
        const data = await res.json();

        if (data?.authenticated && data?.hasOrganisation) {
          setRedirecting(true);
          router.replace("/dashboard");
          return;
        }
      } catch (err) {
        console.error("[org-setup] status check failed", err);
      } finally {
        setCheckingStatus(false);
      }
    };

    checkStatus();
  }, [router]);

  if (checkingStatus || redirecting) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/80 px-6 py-4 text-sm text-slate-200">
          {redirecting
            ? "Taking you to your Ops Dashboard…"
            : "Checking your organisation setup…"}
        </div>
      </div>
    );
  }

  const currentStep = steps[stepIndex];

  const updateField = <K extends keyof OrgFormState>(
    key: K,
    value: OrgFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArrayValue = (key: "goals" | "contentTypes", value: string) => {
    setForm((prev) => {
      const existing = prev[key];
      if (existing.includes(value)) {
        return { ...prev, [key]: existing.filter((v) => v !== value) };
      }
      return { ...prev, [key]: [...existing, value] };
    });
  };

  const onLogoChange = (file: File | null) => {
    updateField("logoFile", file);
  };

  const onMediaChange = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    updateField("mediaFiles", arr);
  };

  const goNext = () => {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(i - 1, 0));
  };

const handleSubmit = async () => {
  setSubmitting(true);
  setError(null);
  setCoachMessage(null);

  try {
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
    fd.append("postingFrequency", form.postingFrequency);

    fd.append("goals", JSON.stringify(form.goals));
    fd.append("contentTypes", JSON.stringify(form.contentTypes));

    fd.append("connectFacebook", String(form.connectFacebook));
    fd.append("connectInstagram", String(form.connectInstagram));
    fd.append("connectTiktok", String(form.connectTiktok));
    fd.append("connectLinkedin", String(form.connectLinkedin));
    fd.append("connectGoogle", String(form.connectGoogle));
    fd.append("connectEmailNewsletter", String(form.connectEmailNewsletter));
    fd.append("connectWhatsApp", String(form.connectWhatsApp));

    if (form.logoFile) {
      fd.append("logo", form.logoFile);
    }

    form.mediaFiles.forEach((file, idx) => {
      fd.append(`media_${idx}`, file);
    });

    // 🔹 Save organisation via the new API
    const res = await fetch("/api/org-setup2", {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        // not JSON; ignore
      }

      const message =
        data?.error || data?.details || raw || "Failed to save organisation";

      throw new Error(message);
    }

    const data = await res.json();
    setOrgSummary({
      name: data.organisation?.name,
      slug: data.organisation?.slug,
    });

    // Force a clean reload onto the success URL to avoid any client-side glitches
    window.location.href = "/org-setup?billing=success";
  } catch (err: any) {
    console.error("[org-setup] submit error", err);
    const message =
      err?.message || "Something went wrong saving your setup.";
    setError(message);

    // Trigger Root Coach AI (if wired)
    triggerCoach("submit-error", message);
  } finally {
    setSubmitting(false);
  }
};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl bg-slate-900/70 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Set up your organisation
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              This is a one-time setup. We’ll use this to connect your brand,
              channels and team so Root Health can do the heavy lifting.
            </p>
          </div>
          <div className="text-xs text-slate-400 bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-3 max-w-xs">
            <p className="font-medium text-slate-200 mb-1">
              You stay in control
            </p>
            <p>
              Nothing is posted automatically. You always approve what goes out
              under your name.
            </p>
          </div>
        </header>

        {/* Step indicator */}
        <nav className="mb-6 flex flex-wrap gap-3 text-xs">
          {steps.map((s, index) => {
            const isActive = index === stepIndex;
            const isDone = index < stepIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStepIndex(index)}
                className={`flex-1 min-w-[120px] rounded-full border px-3 py-1.5 text-left transition ${
                  isActive
                    ? "border-blue-500 bg-blue-500/20 text-blue-100"
                    : isDone
                    ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900/70 text-slate-300"
                }`}
              >
                <span className="block text-[11px] uppercase tracking-wide">
                  Step {index + 1}
                </span>
                <span className="block text-xs font-medium">{s.title}</span>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 md:p-6 mb-4">
          <h2 className="text-lg font-semibold mb-1">{currentStep.title}</h2>
          <p className="text-xs text-slate-300 mb-4">
            {currentStep.description}
          </p>

          {currentStep.id === "org" && (
            <OrgStep form={form} updateField={updateField} />
          )}
          {currentStep.id === "brand" && (
            <BrandStep form={form} updateField={updateField} />
          )}
          {currentStep.id === "goals" && (
            <GoalsStep
              form={form}
              toggleArrayValue={toggleArrayValue}
              updateField={updateField}
            />
          )}
          {currentStep.id === "channels" && (
            <ChannelsStep
              form={form}
              updateField={updateField}
              onLogoChange={onLogoChange}
              onMediaChange={onMediaChange}
            />
          )}
        </section>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-600/60 bg-red-500/10 px-4 py-3 text-xs text-red-100">
            {error}
          </div>
        )}
        {(coachLoading || coachMessage) && (
  <div className="mb-4 rounded-2xl border border-emerald-600/60 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-50">
    <div className="font-semibold mb-1 text-emerald-100">
      Root Coach
    </div>
    {coachLoading ? (
      <p>Thinking about your next best step…</p>
    ) : (
      <p>{coachMessage}</p>
    )}
  </div>
)}


        {/* Footer controls */}
        <footer className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4">
          <div className="text-[11px] text-slate-400">
            Step {stepIndex + 1} of {steps.length}
          </div>
          <div className="flex gap-2 justify-end">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-100 hover:border-slate-400"
              >
                Back
              </button>
            )}

            {stepIndex < steps.length - 1 && (
              <button
                type="button"
                onClick={goNext}
                className="rounded-full bg-blue-500 px-4 py-2 text-xs font-semibold text-slate-50 hover:bg-blue-400"
              >
                Continue
              </button>
            )}

            {stepIndex === steps.length - 1 && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {submitting
                  ? "Saving & opening billing…"
                  : "Save setup & continue to billing"}
              </button>
            )}
          </div>
        </footer>

        {orgSummary?.name && (
          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-[11px] text-slate-300">
            <p className="mb-1">
              <span className="font-semibold text-slate-100">
                Workspace draft:
              </span>{" "}
              {orgSummary.name}
            </p>
            {orgSummary.slug && (
              <p className="text-slate-500">
                Slug:{" "}
                <span className="font-mono text-slate-300">
                  {orgSummary.slug}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* --- Step components --- */

function OrgStep({
  form,
  updateField,
}: {
  form: OrgFormState;
  updateField: <K extends keyof OrgFormState>(
    key: K,
    value: OrgFormState[K]
  ) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 text-xs">
      <div className="space-y-2">
        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Organisation name
          </span>
          <input
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
            value={form.orgName}
            onChange={(e) => updateField("orgName", e.target.value)}
            placeholder="Calm Minds Therapy Clinic"
          />
        </label>

        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Website (optional)
          </span>
          <input
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
            value={form.website}
            onChange={(e) => updateField("website", e.target.value)}
            placeholder="https://example.com"
          />
        </label>

        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Industry / focus
          </span>
          <input
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
            value={form.industry}
            onChange={(e) => updateField("industry", e.target.value)}
            placeholder="e.g. Trauma-informed therapy, coaching for burnout…"
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Size
          </span>
          <select
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
            value={form.orgSize}
            onChange={(e) => updateField("orgSize", e.target.value)}
          >
            <option value="">Select size…</option>
            <option value="solo">Solo practitioner</option>
            <option value="small">2–5 clinicians</option>
            <option value="medium">6–20 clinicians</option>
            <option value="large">20+ clinicians</option>
          </select>
        </label>

        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Custom URL slug (optional)
          </span>
          <input
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 font-mono"
            value={form.orgSlug}
            onChange={(e) => updateField("orgSlug", e.target.value)}
            placeholder="calm-minds"
          />
          <span className="mt-1 block text-[10px] text-slate-500">
            Used in links and internal routing, e.g.{" "}
            <span className="font-mono text-slate-300">
              /org/calm-minds/dashboard
            </span>
          </span>
        </label>

        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Your name
          </span>
          <input
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
            value={form.ownerName}
            onChange={(e) => updateField("ownerName", e.target.value)}
            placeholder="Dr Jane Smith"
          />
        </label>

        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Your role
          </span>
          <input
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
            value={form.ownerRole}
            onChange={(e) => updateField("ownerRole", e.target.value)}
            placeholder="Lead therapist, clinic director…"
          />
        </label>
      </div>
    </div>
  );
}

function BrandStep({
  form,
  updateField,
}: {
  form: OrgFormState;
  updateField: <K extends keyof OrgFormState>(
    key: K,
    value: OrgFormState[K]
  ) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 text-xs">
      <div className="space-y-2">
        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Primary brand colour
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-8 w-8 rounded-full border border-slate-700 bg-slate-950/80"
              value={form.primaryColor}
              onChange={(e) => updateField("primaryColor", e.target.value)}
            />
            <input
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-mono text-slate-100"
              value={form.primaryColor}
              onChange={(e) => updateField("primaryColor", e.target.value)}
            />
          </div>
        </label>

        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Secondary colour
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-8 w-8 rounded-full border border-slate-700 bg-slate-950/80"
              value={form.secondaryColor}
              onChange={(e) => updateField("secondaryColor", e.target.value)}
            />
            <input
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-mono text-slate-100"
              value={form.secondaryColor}
              onChange={(e) => updateField("secondaryColor", e.target.value)}
            />
          </div>
        </label>

        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Accent colour
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-8 w-8 rounded-full border border-slate-700 bg-slate-950/80"
              value={form.accentColor}
              onChange={(e) => updateField("accentColor", e.target.value)}
            />
            <input
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-mono text-slate-100"
              value={form.accentColor}
              onChange={(e) => updateField("accentColor", e.target.value)}
            />
          </div>
        </label>
      </div>

      <div className="space-y-3">
        <div>
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Brand tone
          </span>
          <div className="flex flex-wrap gap-2">
            {["warm", "clinical", "playful", "direct"].map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => updateField("brandTone", tone)}
                className={`rounded-full border px-3 py-1.5 text-[11px] ${
                  form.brandTone === tone
                    ? "border-blue-500 bg-blue-500/20 text-blue-100"
                    : "border-slate-700 bg-slate-950/80 text-slate-300"
                }`}
              >
                {tone[0].toUpperCase() + tone.slice(1)}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            This guides the language Root Health will use in content and
            replies.
          </p>
        </div>

        <div>
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            How often would you like to show up?
          </span>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "low", label: "Gentle (1–2 posts/week)" },
              { id: "medium", label: "Steady (3–4 posts/week)" },
              { id: "high", label: "Active (5+ posts/week)" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  updateField("postingFrequency", opt.id as PostingFrequency)
                }
                className={`rounded-full border px-3 py-1.5 text-[11px] ${
                  form.postingFrequency === opt.id
                    ? "border-blue-500 bg-blue-500/20 text-blue-100"
                    : "border-slate-700 bg-slate-950/80 text-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalsStep({
  form,
  toggleArrayValue,
  updateField,
}: {
  form: OrgFormState;
  toggleArrayValue: (key: "goals" | "contentTypes", value: string) => void;
  updateField: <K extends keyof OrgFormState>(
    key: K,
    value: OrgFormState[K]
  ) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 text-xs">
      <div>
        <span className="block mb-2 text-[11px] font-medium text-slate-200">
          What are your main goals?
        </span>
        <div className="space-y-1.5">
          {goalOptions.map((goal) => {
            const active = form.goals.includes(goal);
            return (
              <button
                key={goal}
                type="button"
                onClick={() => toggleArrayValue("goals", goal)}
                className={`w-full text-left rounded-xl border px-3 py-2 text-xs ${
                  active
                    ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-100"
                    : "border-slate-700 bg-slate-950/80 text-slate-200"
                }`}
              >
                {goal}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          We’ll prioritise campaigns that move you towards these outcomes.
        </p>
      </div>

      <div>
        <span className="block mb-2 text-[11px] font-medium text-slate-200">
          Types of content you’re happy with
        </span>
        <div className="space-y-1.5">
          {contentTypeOptions.map((ct) => {
            const active = form.contentTypes.includes(ct);
            return (
              <button
                key={ct}
                type="button"
                onClick={() => toggleArrayValue("contentTypes", ct)}
                className={`w-full text-left rounded-xl border px-3 py-2 text-xs ${
                  active
                    ? "border-blue-500/70 bg-blue-500/15 text-blue-100"
                    : "border-slate-700 bg-slate-950/80 text-slate-200"
                }`}
              >
                {ct}
              </button>
            );
          })}
        </div>
        <label className="mt-3 block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Team members to invite (optional)
          </span>
          <textarea
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
            rows={3}
            value={form.inviteEmails}
            onChange={(e) => updateField("inviteEmails", e.target.value)}
            placeholder="colleague1@example.com, colleague2@example.com"
          />
          <span className="mt-1 block text-[10px] text-slate-500">
            Separate with commas or new lines. We’ll prepare invites for later.
          </span>
        </label>
      </div>
    </div>
  );
}

function ChannelsStep({
  form,
  updateField,
  onLogoChange,
  onMediaChange,
}: {
  form: OrgFormState;
  updateField: <K extends keyof OrgFormState>(
    key: K,
    value: OrgFormState[K]
  ) => void;
  onLogoChange: (file: File | null) => void;
  onMediaChange: (files: FileList | null) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 text-xs">
      <div className="space-y-3">
        <span className="block text-[11px] font-medium text-slate-200">
          Where do you want Root Health to show up for you?
        </span>
        <div className="space-y-1.5">
          {[
            ["connectFacebook", "Facebook Page"],
            ["connectInstagram", "Instagram"],
            ["connectTiktok", "TikTok"],
            ["connectLinkedin", "LinkedIn"],
            ["connectGoogle", "Google Business Profile"],
            ["connectEmailNewsletter", "Email newsletter"],
            ["connectWhatsApp", "WhatsApp / messaging"],
          ].map(([key, label]) => {
            const k = key as keyof OrgFormState;
            const value = form[k] as boolean;
            return (
              <label
                key={key}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2"
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 rounded border-slate-600 bg-slate-900/80"
                  checked={value}
                  onChange={(e) => updateField(k, e.target.checked as any)}
                />
                <span className="text-xs text-slate-100">{label}</span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          You can change this anytime from the Connect page.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Logo (optional)
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              onLogoChange(e.target.files?.[0] ? e.target.files[0] : null)
            }
            className="w-full text-[11px] text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:text-slate-100"
          />
          <span className="mt-1 block text-[10px] text-slate-500">
            Used in your Ops dashboard and campaign previews.
          </span>
        </label>

        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-slate-200">
            Any hero images or key media we should know about?
          </span>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(e) => onMediaChange(e.target.files)}
            className="w-full text-[11px] text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:text-slate-100"
          />
          <span className="mt-1 block text-[10px] text-slate-500">
            Optional, but helpful. You can always add more later inside your
            media library.
          </span>
        </label>
      </div>
    </div>
  );
}
