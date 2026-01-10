"use client";

import React, { useState } from "react";

type Mode = "now" | "schedule";

type QuickBlastResult = {
  channel: string;
  ok: boolean;
  error?: string;
};

export default function DashboardHomePage() {
  const organisationId = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1";

  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState("");

  const [mode, setMode] = useState<Mode>("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<QuickBlastResult[] | null>(
    null
  );

  const [sendFacebook, setSendFacebook] = useState(true);
  const [sendLinkedIn, setSendLinkedIn] = useState(false);
  const [sendInstagram, setSendInstagram] = useState(false);
  const [sendThreads, setSendThreads] = useState(false);

  const selectedChannels = () => {
    const out: string[] = [];
    if (sendFacebook) out.push("facebook");
    if (sendLinkedIn) out.push("linkedin");
    if (sendInstagram) out.push("instagram");
    if (sendThreads) out.push("threads");
    return out;
  };

  // -----------------------------
  // SEND NOW
  // -----------------------------
  const handleQuickBlast = async () => {
    setIsPosting(true);
    setError(null);
    setStatus(null);
    setCoachMessage(null);
    setLastResults(null);

    try {
      const trimmed = message.trim();
      if (!trimmed) throw new Error("Write something first.");

      const channels = selectedChannels();
      if (channels.length === 0)
        throw new Error("Select at least one channel.");

      const results: QuickBlastResult[] = [];

      for (const channel of channels) {
        const res = await fetch("/api/social/quick-blast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            channel,
            imageUrl,
            organisationId,
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || data?.success === false) {
          results.push({
            channel,
            ok: false,
            error: data?.error || "Posting failed",
          });
        } else {
          results.push({ channel, ok: true });
        }
      }

      setLastResults(results);

      const successes = results.filter((r) => r.ok);
      if (successes.length === 0) {
        throw new Error("Posting didn’t go through.");
      }

      setStatus(
        `Posted successfully to ${successes
          .map((r) => r.channel)
          .join(", ")}`
      );
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      callRootCoach("quick_blast_failed", err.message);
    } finally {
      setIsPosting(false);
    }
  };

  // -----------------------------
  // SAVE FOR LATER (PHASE 1 STEP 1)
  // -----------------------------
  const handleSaveForLater = async () => {
    setIsPosting(true);
    setError(null);
    setStatus(null);
    setCoachMessage(null);

    try {
      const trimmed = message.trim();
      if (!trimmed) throw new Error("Nothing to save yet.");

      const res = await fetch("/api/social/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          platforms: [],
          imageUrl,
          scheduledAt: null,
          organisationId,
          saveOnly: true,
        }),
      });

      if (!res.ok) throw new Error("Could not save draft.");

      setLastResults(null);
      setError(null);
      setStatus("Saved for later — your draft is safe.");

      callRootCoach(
        "save_for_later_success",
        "User saved draft after a posting issue"
      );
    } catch (err: any) {
      setError(err.message || "Could not save this draft.");
    } finally {
      setIsPosting(false);
    }
  };

  // -----------------------------
  // ROOT COACH
  // -----------------------------
  const callRootCoach = (context: string, errorMessage: string) => {
    fetch("/api/ai/root-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context,
        errorMessage,
        userAction: "Quick Blast interaction",
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.coachMessage) setCoachMessage(data.coachMessage);
      })
      .catch(() => {});
  };

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold">Root Health Ops Dashboard</h1>

        <textarea
          className="w-full min-h-[140px] rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <input
          type="url"
          placeholder="Image URL (optional)"
          className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-sm"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />

        <div className="flex flex-wrap gap-3 text-xs">
          <Toggle label="Facebook" on={sendFacebook} set={setSendFacebook} />
          <Toggle label="LinkedIn" on={sendLinkedIn} set={setSendLinkedIn} />
          <Toggle label="Instagram" on={sendInstagram} set={setSendInstagram} />
          <Toggle label="Threads" on={sendThreads} set={setSendThreads} />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleQuickBlast}
            disabled={isPosting}
            className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950"
          >
            {isPosting ? "Sending…" : "Send Quick Blast"}
          </button>

          {error && (
            <button
              onClick={handleSaveForLater}
              disabled={isPosting}
              className="rounded-full border border-slate-600 px-5 py-2 text-sm"
            >
              Save for later
            </button>
          )}
        </div>

        {status && <div className="text-emerald-400 text-sm">{status}</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}

        {coachMessage && (
          <div className="mt-4 rounded-xl border border-sky-500/40 bg-sky-950/40 p-3 text-sm">
            {coachMessage}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------
// SMALL HELPER
// -----------------------------
function Toggle({
  label,
  on,
  set,
}: {
  label: string;
  on: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => set(!on)}
      className={`rounded-full px-3 py-1 border ${
        on
          ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
          : "border-slate-600 text-slate-300"
      }`}
    >
      {label}
    </button>
  );
}
