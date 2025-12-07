"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ------------------------------
// Types
// ------------------------------
interface OrgFormState {
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
  postingFrequency: string;

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
}

const initialFormState: OrgFormState = {
  orgName: "",
  orgSlug: "",
  industry: "",
  orgSize: "",
  website: "",

  primaryColor: "#00A676",
  secondaryColor: "#004E64",
  accentColor: "#F4D35E",
  brandTone: "calm",

  ownerName: "",
  ownerRole: "",
  inviteEmails: "",
  postingFrequency: "weekly",

  goals: [],
  contentTypes: [],

  connectFacebook: false,
  connectInstagram: false,
  connectTiktok: false,
  connectLinkedin: false,
  connectGoogle: false,
  connectEmailNewsletter: false,
  connectWhatsApp: false,

  logoFile: null,
  mediaFiles: [],
};

// -----------------------------------------------------------
// Main Page Component
// -----------------------------------------------------------
export default function OrgSetupPage() {
  return <OrgSetupInner />;
}

// -----------------------------------------------------------
// Setup Wizard Component
// -----------------------------------------------------------
function OrgSetupInner() {
  const router = useRouter();

  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<OrgFormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Root Coach state
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachAutoUsed, setCoachAutoUsed] = useState(false);

  const steps = [
    { id: "org", label: "Organisation" },
    { id: "brand", label: "Brand & colours" },
    { id: "people", label: "People & rhythm" },
    { id: "channels", label: "Channels & assets" },
  ];

  // -----------------------------------------------------------
  // Read ?billing=... from URL WITHOUT useSearchParams
  // -----------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    setBillingStatus(billing);
  }, []);

  // -----------------------------------------------------------
  // Root Coach helper
  // -----------------------------------------------------------
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
          errorMessage,
        }),
      });

      if (!res.ok) throw new Error("Coach request failed");

      const data = await res.json();
      setCoachMessage(data.message ?? null);
    } catch (err) {
      console.error("[coach] request error", err);
      setCoachMessage(
        "Something glitched while fetching advice. You're doing everything right — try the step again, and if it still fails, refresh and we’ll fix it."
      );
    } finally {
      setCoachLoading(false);
    }
  };

  // -----------------------------------------------------------
  // Success Screen (billing=success in URL)
  // -----------------------------------------------------------
  if (billingStatus === "success") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-700 rounded-3xl shadow-xl p-8 md:p-10 backdrop-blur">
          <h1 className="text-2xl md:text-3xl font-semibold mb-3">
            Your Root Health workspace is ready
          </h1>
          <p className="text-sm text-slate-300 mb-4">
            Everything is set up and you&apos;re ready to start using Root
            Health Ops to manage content, campaigns and replies.
          </p>

          <div className="rounded-2xl border border-emerald-600/60 bg-emerald-500/10 px-4 py-3 mb-4 text-sm text-emerald-100">
            <p className="font-medium mb-1">What’s next?</p>
            <ul className="list-disc list-inside text-xs space-y-1 text-emerald-50/90">
              <li>Head to your Ops Dashboard to see everything in one place.</li>
              <li>
                Or open the Connect page to plug in Facebook, Instagram,
                LinkedIn and more.
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-blue-500/60 bg-blue-500/10 px-4 py-3 mb-6 text-xs text-blue-50">
            <div className="font-semibold mb-1 text-blue-100">Root Coach</div>
            <p className="mb-1">
              You’ve done the hard part most people avoid – you’ve created a
              dedicated space for your marketing and client communication.
            </p>
            <p className="mb-1">
              For your first visit to the Ops Dashboard, pick one simple win:
              schedule a single post you’re proud of or reply to one person
              already in your world. Tiny consistent actions beat big heroic
              efforts every time.
            </p>
            <p className="mt-1">
              You’re not behind. You’re building something that will quietly
              work for you while you look after people.
            </p>
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

  // -----------------------------------------------------------
  // Submit Handler
  // -----------------------------------------------------------
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setCoachMessage(null);

    try {
      const fd = new FormData();

      // Basic org fields
      fd.append("orgName", form.orgName);
      fd.append("orgSlug", form.orgSlug);
      fd.append("industry", form.industry);
      fd.append("orgSize", form.orgSize);
      fd.append("website", form.website);

      // Brand
      fd.append("primaryColor", form.primaryColor);
      fd.append("secondaryColor", form.secondaryColor);
      fd.append("accentColor", form.accentColor);
      fd.append("brandTone", form.brandTone);

      // People & posting
      fd.append("ownerName", form.ownerName);
      fd.append("ownerRole", form.ownerRole);
      fd.append("inviteEmails", form.inviteEmails);
      fd.append("postingFrequency", form.postingFrequency);

      // Goals & content types
      fd.append("goals", JSON.stringify(form.goals));
      fd.append("contentTypes", JSON.stringify(form.contentTypes));

      // Channels
      fd.append("connectFacebook", String(form.connectFacebook));
      fd.append("connectInstagram", String(form.connectInstagram));
      fd.append("connectTiktok", String(form.connectTiktok));
      fd.append("connectLinkedin", String(form.connectLinkedin));
      fd.append("connectGoogle", String(form.connectGoogle));
      fd.append("connectEmailNewsletter", String(form.connectEmailNewsletter));
      fd.append("connectWhatsApp", String(form.connectWhatsApp));

      // Files
      if (form.logoFile) {
        fd.append("logo", form.logoFile);
      }
      form.mediaFiles.forEach((file, idx) => {
        fd.append(`media_${idx}`, file);
      });

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
          // ignore JSON parse error
        }

        const message =
          data?.error || data?.details || raw || "Failed to save organisation";

        if (!coachAutoUsed) {
          setCoachAutoUsed(true);
          triggerCoach("submit-error", message);
        }

        throw new Error(message);
      }

      await res.json();

      // Reset coach state on success
      setCoachAutoUsed(false);
      setCoachMessage(null);

      // Redirect to success
      window.location.href = "/org-setup?billing=success";
    } catch (err: any) {
      console.error("[org-setup] submit error", err);
      const message =
        err?.message || "Something went wrong saving your setup.";
      setError(message);

      if (!coachAutoUsed) {
        setCoachAutoUsed(true);
        triggerCoach("submit-error", message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // -----------------------------------------------------------
  // Step navigation
  // -----------------------------------------------------------
  const goNext = () => setStepIndex((s) => Math.min(s + 1, steps.length - 1));
  const goBack = () => setStepIndex((s) => Math.max(s - 1, 0));

  // -----------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="max-w-4xl mx-auto bg-slate-900/80 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold">
            Root Health workspace setup
          </h1>
          <p className="mt-2 text-sm text-slate-300 max-w-2xl">
            We&apos;ll grab a few details about your organisation, brand and
            channels so Root Health Ops feels like it&apos;s built for you from
            day one.
          </p>
        </header>

        {/* Step indicator */}
        <div className="flex flex-wrap items-center gap-2 mb-6 text-xs text-slate-300">
          {steps.map((step, idx) => (
            <React.Fragment key={step.id}>
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                  stepIndex === idx
                    ? "bg-blue-500 text-white border-blue-400"
                    : "bg-slate-800 text-slate-200 border-slate-600"
                }`}
              >
                {idx + 1}
              </span>
              <span>{step.label}</span>
              {idx < steps.length - 1 && (
                <span className="text-slate-500 mx-1">/</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Error block */}
        {error && (
          <div className="rounded-xl border border-red-600/60 bg-red-500/10 px-4 py-3 mb-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Root Coach block */}
        {(coachLoading || coachMessage) && (
          <div className="rounded-xl border border-blue-600/60 bg-blue-500/10 px-4 py-3 mb-4 text-sm text-blue-100">
            <div className="font-semibold mb-1">Root Coach</div>
            {coachLoading ? (
              <p>Thinking about your next best step…</p>
            ) : (
              <p>{coachMessage}</p>
            )}
          </div>
        )}

        {/* Step content */}
        <div className="mb-6">
          {stepIndex === 0 && (
            <StepOrganisation form={form} setForm={setForm} />
          )}
          {stepIndex === 1 && <StepBrand form={form} setForm={setForm} />}
          {stepIndex === 2 && <StepPeople form={form} setForm={setForm} />}
          {stepIndex === 3 && <StepChannels form={form} setForm={setForm} />}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0 || submitting}
            className="rounded-full border border-slate-600 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
          >
            Back
          </button>

          {stepIndex < steps.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={submitting || !form.orgName}
              className="rounded-full bg-blue-500 px-4 py-2 text-xs font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-full bg-blue-500 px-6 py-2 text-xs font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-40"
            >
              {submitting ? "Saving…" : "Save setup & continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Step Components (kept in same file for now)
// -----------------------------------------------------------
function StepOrganisation({
  form,
  setForm,
}: {
  form: OrgFormState;
  setForm: React.Dispatch<React.SetStateAction<OrgFormState>>;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <label className="block text-slate-200 mb-1">Organisation name</label>
        <input
          className="w-full rounded-xl bg-s
late-950/60 border border-slate-700 px-3 py-2 text-sm"
          value={form.orgName}
          onChange={(e) =>
            setForm((f) => ({ ...f, orgName: e.target.value }))
          }
          placeholder="Calm Minds Therapy"
        />
      </div>

      <div>
        <label className="block text-slate-200 mb-1">
          Workspace slug (optional)
        </label>
        <input
          className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm"
          value={form.orgSlug}
          onChange={(e) =>
            setForm((f) => ({ ...f, orgSlug: e.target.value }))
          }
          placeholder="calm-minds-therapy"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          This becomes part of your URL. If you leave it blank, we’ll generate
          one for you.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-slate-200 mb-1">Industry</label>
          <input
            className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm"
            value={form.industry}
            onChange={(e) =>
              setForm((f) => ({ ...f, industry: e.target.value }))
            }
            placeholder="Therapy, coaching, counselling…"
          />
        </div>
        <div>
          <label className="block text-slate-200 mb-1">
            Organisation size
          </label>
          <select
            className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm"
            value={form.orgSize}
            onChange={(e) =>
              setForm((f) => ({ ...f, orgSize: e.target.value }))
            }
          >
            <option value="">Select…</option>
            <option value="solo">Just me</option>
            <option value="small">2–5 practitioners</option>
            <option value="medium">6–20 practitioners</option>
            <option value="large">21+ practitioners</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-slate-200 mb-1">Website (optional)</label>
        <input
          className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm"
          value={form.website}
          onChange={(e) =>
            setForm((f) => ({ ...f, website: e.target.value }))
          }
          placeholder="https://yourclinic.com"
        />
      </div>
    </div>
  );
}

function StepBrand({
  form,
  setForm,
}: {
  form: OrgFormState;
  setForm: React.Dispatch<React.SetStateAction<OrgFormState>>;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="block text-slate-200 mb-1">Primary colour</label>
          <input
            type="color"
            className="w-full h-10 rounded-xl bg-transparent border border-slate-700"
            value={form.primaryColor}
            onChange={(e) =>
              setForm((f) => ({ ...f, primaryColor: e.target.value }))
            }
          />
          <p className="mt-1 text-[11px] text-slate-400">{form.primaryColor}</p>
        </div>
        <div>
          <label className="block text-slate-200 mb-1">Secondary colour</label>
          <input
            type="color"
            className="w-full h-10 rounded-xl bg-transparent border border-slate-700"
            value={form.secondaryColor}
            onChange={(e) =>
              setForm((f) => ({ ...f, secondaryColor: e.target.value }))
            }
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {form.secondaryColor}
          </p>
        </div>
        <div>
          <label className="block text-slate-200 mb-1">Accent colour</label>
          <input
            type="color"
            className="w-full h-10 rounded-xl bg-transparent border border-slate-700"
            value={form.accentColor}
            onChange={(e) =>
              setForm((f) => ({ ...f, accentColor: e.target.value }))
            }
          />
          <p className="mt-1 text-[11px] text-slate-400">{form.accentColor}</p>
        </div>
      </div>

      <div>
        <label className="block text-slate-200 mb-1">Brand tone</label>
        <select
          className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm"
          value={form.brandTone}
          onChange={(e) =>
            setForm((f) => ({ ...f, brandTone: e.target.value }))
          }
        >
          <option value="calm">Calm & reassuring</option>
          <option value="direct">Direct & clear</option>
          <option value="friendly">Friendly & informal</option>
          <option value="professional">Professional & formal</option>
        </select>
      </div>

      <div>
        <label className="block text-slate-200 mb-1">
          Main goals for Root Health Ops
        </label>
        <textarea
          className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm min-h-[80px]"
          value={form.goals.join("\n")}
          onChange={(e) =>
            setForm((f) => ({ ...f, goals: e.target.value.split("\n") }))
          }
          placeholder={`Examples:\n- Fill my diary with ideal clients\n- Stay visible without burning out\n- Nurture my existing community`}
        />
        <p className="mt-1 text-[11px] text-slate-400">
          One thought per line is perfect — we&apos;ll use this to tune AI
          suggestions and campaign ideas.
        </p>
      </div>
    </div>
  );
}

function StepPeople({
  form,
  setForm,
}: {
  form: OrgFormState;
  setForm: React.Dispatch<React.SetStateAction<OrgFormState>>;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-slate-200 mb-1">Your name</label>
          <input
            className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm"
            value={form.ownerName}
            onChange={(e) =>
              setForm((f) => ({ ...f, ownerName: e.target.value }))
            }
            placeholder="Dr Jane Smith"
          />
        </div>
        <div>
          <label className="block text-slate-200 mb-1">Your role</label>
          <input
            className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm"
            value={form.ownerRole}
            onChange={(e) =>
              setForm((f) => ({ ...f, ownerRole: e.target.value }))
            }
            placeholder="Clinical director, lead coach…"
          />
        </div>
      </div>

      <div>
        <label className="block text-slate-200 mb-1">
          Team members to invite (optional)
        </label>
        <textarea
          className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm min-h-[60px]"
          value={form.inviteEmails}
          onChange={(e) =>
            setForm((f) => ({ ...f, inviteEmails: e.target.value }))
          }
          placeholder={`one@email.com\nanother@email.com`}
        />
        <p className="mt-1 text-[11px] text-slate-400">
          One email per line. We won&apos;t invite anyone until you confirm
          inside the app.
        </p>
      </div>

      <div>
        <label className="block text-slate-200 mb-1">
          Ideal posting rhythm
        </label>
        <select
          className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm"
          value={form.postingFrequency}
          onChange={(e) =>
            setForm((f) => ({ ...f, postingFrequency: e.target.value }))
          }
        >
          <option value="weekly">Once a week</option>
          <option value="twice-weekly">Twice a week</option>
          <option value="three-weekly">3 times a week</option>
          <option value="daily">Most days</option>
        </select>
        <p className="mt-1 text-[11px] text-slate-400">
          This doesn&apos;t lock you in; it helps Root Health suggest realistic
          next actions.
        </p>
      </div>
    </div>
  );
}

function StepChannels({
  form,
  setForm,
}: {
  form: OrgFormState;
  setForm: React.Dispatch<React.SetStateAction<OrgFormState>>;
}) {
  const toggle = (field: keyof OrgFormState) => {
    setForm((f) => ({ ...f, [field]: !f[field] as any }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setForm((f) => ({ ...f, logoFile: file }));
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setForm((f) => ({ ...f, mediaFiles: files }));
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <label className="block text-slate-200 mb-2">
          Channels you&apos;d like to use
        </label>
        <div className="grid gap-2 md:grid-cols-2">
          {[
            ["connectFacebook", "Facebook Page"],
            ["connectInstagram", "Instagram Business"],
            ["connectLinkedin", "LinkedIn Page"],
            ["connectTiktok", "TikTok"],
            ["connectGoogle", "Google Business Profile"],
            ["connectEmailNewsletter", "Email newsletter"],
            ["connectWhatsApp", "WhatsApp"],
          ].map(([field, label]) => (
            <button
              key={field}
              type="button"
              onClick={() => toggle(field as keyof OrgFormState)}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                (form as any)[field]
                  ? "border-blue-400 bg-blue-500/15 text-blue-50"
                  : "border-slate-700 bg-slate-950/60 text-slate-200"
              }`}
            >
              <span>{label}</span>
              <span
                className={`h-4 w-7 rounded-full flex items-center px-0.5 ${
                  (form as any)[field]
                    ? "bg-blue-500 justify-end"
                    : "bg-slate-600 justify-start"
                }`}
              >
                <span className="h-3 w-3 rounded-full bg-white" />
              </span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          We&apos;ll guide you to properly connect these inside the Connect page
          after setup.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-slate-200 mb-1">
            Upload your logo (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            className="w-full text-xs text-slate-300"
            onChange={handleLogoChange}
          />
          {form.logoFile && (
            <p className="mt-1 text-[11px] text-slate-400">
              Selected: {form.logoFile.name}
            </p>
          )}
        </div>
        <div>
          <label className="block text-slate-200 mb-1">
            Upload example media (optional)
          </label>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="w-full text-xs text-slate-300"
            onChange={handleMediaChange}
          />
          {form.mediaFiles.length > 0 && (
            <p className="mt-1 text-[11px] text-slate-400">
              {form.mediaFiles.length} file(s) selected.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
