"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

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
// Actual Setup Wizard Component
// -----------------------------------------------------------
function OrgSetupInner() {
  const router = useRouter();
  const search = useSearchParams();
  const billingStatus = search?.get("billing") || null;

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<OrgFormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgSummary, setOrgSummary] = useState<{ name?: string; slug?: string } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // ---------- Root Coach State ----------
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachAutoUsed, setCoachAutoUsed] = useState(false);

  // -----------------------------------------
  // AI Coach Helper Function
  // -----------------------------------------
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
          stepId: stepIndex?.toString() ?? "unknown-step",
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
  // Success Screen
  // -----------------------------------------------------------
  if (billingStatus === "success") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-700 rounded-3xl shadow-xl p-8 md:p-10 backdrop-blur">
          <h1 className="text-2xl md:text-3xl font-semibold mb-3">
            Your Root Health workspace is ready
          </h1>
          <p className="text-sm text-slate-300 mb-4">
            Everything is set up, and billing is active. You can now start using
            Root Health Ops to manage content, campaigns and replies.
          </p>

          {/* What's Next */}
          <div className="rounded-2xl border border-emerald-600/60 bg-emerald-500/10 px-4 py-3 mb-4 text-sm text-emerald-100">
            <p className="font-medium mb-1">What’s next?</p>
            <ul className="list-disc list-inside text-xs space-y-1 text-emerald-50/90">
              <li>Head to your Ops Dashboard to see everything in one place.</li>
              <li>Or open the Connect page to plug in social platforms.</li>
            </ul>
          </div>

          {/* Root Coach */}
          <div className="rounded-2xl border border-blue-500/60 bg-blue-500/10 px-4 py-3 mb-6 text-xs text-blue-50">
            <div className="font-semibold mb-1 text-blue-100">Root Coach</div>
            <p className="mb-1">
              You've just completed a major milestone — most people never get
              this far. This system will quietly support you while you support
              others.
            </p>
            <p className="mb-1">
              For your first moment in the dashboard, choose one tiny win:
              schedule a single post, or reply to one person. Tiny steps compound.
            </p>
            <p>You’re not behind. You’re building momentum.</p>
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

      // Append fields
      Object.entries(form).forEach(([key, val]) => {
        if (key === "logoFile") {
          if (val) fd.append("logo", val as File);
        } else if (key === "mediaFiles") {
          (val as File[]).forEach((file, idx) => fd.append(`media_${idx}`, file));
        } else if (Array.isArray(val)) {
          fd.append(key, JSON.stringify(val));
        } else {
          fd.append(key, String(val));
        }
      });

      // -----------------------
      // Call backend API
      // -----------------------
      const res = await fetch("/api/org-setup2", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const raw = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(raw);
        } catch {}

        const message =
          data?.error || data?.details || raw || "Failed to save organisation";
        if (!coachAutoUsed) {
          setCoachAutoUsed(true);
          triggerCoach("submit-error", message);
        }
        throw new Error(message);
      }

      const data = await res.json();

      // Reset AI coaching state after success
      setCoachAutoUsed(false);
      setCoachMessage(null);

      setOrgSummary({
        name: data.organisation?.name,
        slug: data.organisation?.slug,
      });

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

  // ------------------------------------------------------------------
  // The actual wizard UI (unchanged from your version)
  // ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      {/* Insert your step UI here – unchanged */}
      <div className="max-w-3xl mx-auto">

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
            {coachLoading ? <p>Thinking about your next best step…</p> : <p>{coachMessage}</p>}
          </div>
        )}

        {/* BUTTON */}
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-400"
        >
          {submitting ? "Saving…" : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
