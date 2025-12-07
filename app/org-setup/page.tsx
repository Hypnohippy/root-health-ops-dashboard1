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
          stepId: stepIndex.toString(),
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

      // Minimal but valid fields the API expects
      fd.append("orgName", form.orgName);
      fd.append("orgSlug", form.orgSlug);
      fd.append("industry", form.industry);
      fd.append("orgSize", form.orgSize);
      fd.append("website", form.website);
      fd.append("ownerName", form.ownerName);
      fd.append("ownerRole", form.ownerRole);
      fd.append("inviteEmails", form.inviteEmails);
      fd.append("postingFrequency", form.postingFrequency);

      fd.append("primaryColor", form.primaryColor);
      fd.append("secondaryColor", form.secondaryColor);
      fd.append("accentColor", form.accentColor);
      fd.append("brandTone", form.brandTone);

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

      const data = await res.json();

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
  // Simple 2-step UI (keeps things usable without being crazy)
  // -----------------------------------------------------------
  const goNext = () => setStepIndex((s) => Math.min(s + 1, 1));
  const goBack = () => setStepIndex((s) => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="max-w-3xl mx-auto bg-slate-900/80 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold">
            Root Health workspace setup
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            We’ll grab a few details about your organisation and how you like to
            work. This only needs to be done once.
          </p>
        </header>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6 text-xs text-slate-300">
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
              stepIndex === 0
                ? "bg-blue-500 text-white border-blue-400"
                : "bg-slate-800 text-slate-200 border-slate-600"
            }`}
          >
            1
          </span>
          <span>Organisation</span>
          <span className="text-slate-500">/</span>
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
              stepIndex === 1
                ? "bg-blue-500 text-white border-blue-400"
                : "bg-slate-800 text-slate-200 border-slate-600"
            }`}
          >
            2
          </span>
          <span>Brand & goals</span>
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
        {stepIndex === 0 && (
          <div className="space-y-4 mb-6 text-sm">
            <div>
              <label className="block text-slate-200 mb-1">
                Organisation name
              </label>
              <input
                className="w-full rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm"
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
                This becomes part of your URL. If you leave it blank, we’ll
                generate one for you.
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
        )}

        {stepIndex === 1 && (
          <div className="space-y-4 mb-6 text-sm">
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
                Primary goal with Root Health Ops
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
                One thought per line is perfect — we&apos;ll use this to tune
                AI suggestions.
              </p>
            </div>
          </div>
        )}

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

          {stepIndex === 0 ? (
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
