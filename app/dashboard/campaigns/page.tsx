// app/dashboard/campaigns/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Pattern = {
  id: string;
  organisation_id: string;
  source_post_id: string | null;
  platform: string | null;
  pattern_type: string;
  format: string;
  hook_style: string | null;
  cta_style: string | null;
  notes: string | null;
  performance_score: number | null;
  suggested: boolean;
  saved_by_user: boolean;
  created_at: string;
};

type Suggestion = {
  success: boolean;
  organisationId: string;
  suggestion?: {
    platform: string;
    pattern_type: string;
    format: "text" | "image" | "video";
    hook_style: string;
    cta_style: string;
    notes: string;
    performance_score: number;
    source_post_id?: string | null;
  };
  error?: string;
};

type GrowthSeedPayload = {
  v: number;
  createdAt: string;
  source: "growth_lab";
  organisationId?: string | null;
  experimentId?: string | null;

  platform?: string | null;
  title?: string | null;
  hypothesis?: string | null;

  pattern_type?: string | null;
  format?: string | null;
  hook_style?: string | null;
  cta_style?: string | null;
  notes?: string | null;
  confidence?: number | null;

  brief: string;
};

// ✅ Growth Lab → Brainstorm seed keys
const GROWTH_SEED_KEYS = [
  "rootops_growth_seed_brainstorm_v1",
  "rh_growth_seed_brainstorm_v1",
];

function nice(s?: string | null) {
  return String(s || "").trim() || "—";
}

function platformLabel(p?: string | null) {
  const k = String(p || "").toLowerCase();
  if (k === "facebook") return "Facebook";
  if (k === "instagram") return "Instagram";
  if (k === "threads") return "Threads";
  if (k === "linkedin") return "LinkedIn";
  if (k === "tiktok") return "TikTok";
  return p || "—";
}

function setLocalStorageMulti(keys: string[], payload: any) {
  try {
    const raw = JSON.stringify(payload);
    for (const k of keys) {
      try {
        localStorage.setItem(k, raw);
      } catch {}
    }
  } catch {}
}

function buildBrainstormBrief(args: {
  title?: string | null;
  platform?: string | null;
  pattern_type?: string | null;
  format?: string | null;
  hook_style?: string | null;
  cta_style?: string | null;
  notes?: string | null;
  confidence?: number | null;
}) {
  const title = String(args.title || "").trim();
  const platform = String(args.platform || "").trim();
  const pattern = String(args.pattern_type || "").trim();
  const format = String(args.format || "").trim();
  const hook = String(args.hook_style || "").trim();
  const cta = String(args.cta_style || "").trim();
  const notes = String(args.notes || "").trim();
  const conf =
    typeof args.confidence === "number" && Number.isFinite(args.confidence)
      ? args.confidence
      : null;

  const lines: string[] = [];
  lines.push("Growth Lab Experiment Brief");
  lines.push("");

  if (title) lines.push(`Title: ${title}`);
  if (platform) lines.push(`Platform: ${platform}`);
  if (pattern) lines.push(`Pattern: ${pattern}`);
  if (format) lines.push(`Format: ${format}`);
  if (hook) lines.push(`Hook style: ${hook}`);
  if (cta) lines.push(`CTA style: ${cta}`);
  if (conf !== null) lines.push(`Confidence: ${conf}/100`);

  if (notes) {
    lines.push("");
    lines.push("Why this might work:");
    lines.push(notes);
  }

  lines.push("");
  lines.push("Now do this:");
  lines.push("1) Give me 10 hooks for this experiment (gentle + human).");
  lines.push("2) Draft 3 posts (short/medium/long).");
  lines.push("3) Suggest a ‘safe’ CTA that fits therapists (no salesy vibe).");
  lines.push("4) Give me a quick ‘what to measure’ checklist (likes/comments/saves/replies).");

  return lines.join("\n").trim();
}

export default function CampaignsPage() {
  // We’re repurposing the old /campaigns route as “Growth Lab”
  const [loading, setLoading] = useState(true);
  const [patternsLoading, setPatternsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [suggestion, setSuggestion] = useState<Suggestion["suggestion"] | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);

  async function loadSuggestion() {
    setLoading(true);
    setError(null);
    setSuggestion(null);

    try {
      const res = await fetch("/api/growth/patterns/suggest", { cache: "no-store" });
      const json: Suggestion = await res.json().catch(() => null as any);

      if (!res.ok || !json?.success || !json?.suggestion) {
        setSuggestion(null);
        setError(json?.error || "No suggestion available yet.");
        setLoading(false);
        return;
      }

      setSuggestion(json.suggestion);
    } catch (e: any) {
      setError(e?.message || "Failed to load suggestion.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPatterns() {
    setPatternsLoading(true);
    try {
      const res = await fetch("/api/growth/patterns/list", { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setPatterns([]);
        setPatternsLoading(false);
        return;
      }

      setPatterns(Array.isArray(json.items) ? json.items : []);
    } catch {
      setPatterns([]);
    } finally {
      setPatternsLoading(false);
    }
  }

  useEffect(() => {
    void loadSuggestion();
    void loadPatterns();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const hasSuggestion = !!suggestion;

  const savedCount = useMemo(() => patterns.length, [patterns]);

  async function saveSuggestion() {
    if (!suggestion) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/growth/patterns/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ suggestion }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setSaving(false);
        setError(json?.error || "Failed to save.");
        return;
      }

      setToast("⭐ Saved to Growth Memory");
      await loadPatterns();
      await loadSuggestion(); // refresh to generate a fresh suggestion
    } catch (e: any) {
      setError(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function sendSuggestionToBrainstorm() {
    if (!suggestion) return;

    const brief = buildBrainstormBrief({
      title: `${platformLabel(suggestion.platform)}: ${suggestion.pattern_type} (${suggestion.format})`,
      platform: suggestion.platform,
      pattern_type: suggestion.pattern_type,
      format: suggestion.format,
      hook_style: suggestion.hook_style,
      cta_style: suggestion.cta_style,
      notes: suggestion.notes,
      confidence:
        typeof suggestion.performance_score === "number"
          ? suggestion.performance_score
          : null,
    });

    const payload: GrowthSeedPayload = {
      v: 1,
      createdAt: new Date().toISOString(),
      source: "growth_lab",
      platform: suggestion.platform,
      title: `${platformLabel(suggestion.platform)}: ${suggestion.pattern_type} (${suggestion.format})`,
      pattern_type: suggestion.pattern_type,
      format: suggestion.format,
      hook_style: suggestion.hook_style,
      cta_style: suggestion.cta_style,
      notes: suggestion.notes,
      confidence:
        typeof suggestion.performance_score === "number"
          ? suggestion.performance_score
          : null,
      brief,
    };

    setToast("Sending to Brainstorm…");
    setLocalStorageMulti(GROWTH_SEED_KEYS, payload);
    window.location.href = "/dashboard/brainstorm";
  }

  function sendPatternToBrainstorm(p: Pattern) {
    const brief = buildBrainstormBrief({
      title: `${platformLabel(p.platform)}: ${p.pattern_type} (${p.format})`,
      platform: p.platform,
      pattern_type: p.pattern_type,
      format: p.format,
      hook_style: p.hook_style,
      cta_style: p.cta_style,
      notes: p.notes,
      confidence:
        typeof p.performance_score === "number" ? p.performance_score : null,
    });

    const payload: GrowthSeedPayload = {
      v: 1,
      createdAt: new Date().toISOString(),
      source: "growth_lab",
      platform: p.platform,
      title: `${platformLabel(p.platform)}: ${p.pattern_type} (${p.format})`,
      pattern_type: p.pattern_type,
      format: p.format,
      hook_style: p.hook_style,
      cta_style: p.cta_style,
      notes: p.notes,
      confidence:
        typeof p.performance_score === "number" ? p.performance_score : null,
      brief,
    };

    setToast("Sending to Brainstorm…");
    setLocalStorageMulti(GROWTH_SEED_KEYS, payload);
    window.location.href = "/dashboard/brainstorm";
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <div className="text-xs text-slate-400">Root Health Ops</div>
          <h1 className="mt-1 text-2xl md:text-3xl font-semibold">
            🧪 Growth Lab{" "}
            <span className="text-slate-400">— your gentle growth buddy</span>
          </h1>

          <p className="mt-3 text-sm text-slate-300 max-w-3xl">
            No messy admin. Growth Lab suggests what to try next, and helps you
            save what works — so you can build momentum in small, kind steps.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                void loadSuggestion();
                void loadPatterns();
              }}
              className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              Refresh
            </button>

            <div className="text-xs text-slate-400">
              Growth Memory saved:{" "}
              <span className="text-slate-200 font-semibold">{savedCount}</span>
            </div>
          </div>

          {toast ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {toast}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </div>

        {/* Suggestion */}
        <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Today’s gentle suggestion</div>
              <div className="text-xs text-slate-400 mt-1">
                You’re always in control. If it doesn’t feel right, skip it. No guilt. 🙂
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadSuggestion}
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
              >
                New suggestion
              </button>

              <button
                onClick={sendSuggestionToBrainstorm}
                disabled={!hasSuggestion}
                className="rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 hover:bg-blue-500/15 disabled:opacity-60"
                title="Send this into Brainstorm as a ready-to-develop brief"
              >
                🧠 Send to Brainstorm
              </button>

              <button
                onClick={saveSuggestion}
                disabled={!hasSuggestion || saving}
                className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "⭐ Save to Growth Memory"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
              Loading suggestion…
            </div>
          ) : !suggestion ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
              No suggestion yet. Post a few times first (Quick Blast counts), then come back here.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-400">Platform</div>
                <div className="mt-1 text-lg font-semibold">
                  {platformLabel(suggestion.platform)}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-400">Pattern</div>
                    <div className="mt-1 text-sm text-slate-100">
                      {nice(suggestion.pattern_type)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Format</div>
                    <div className="mt-1 text-sm text-slate-100">
                      {nice(suggestion.format)}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-400">Confidence</div>
                  <div className="mt-1 text-sm text-slate-100">
                    {Number.isFinite(suggestion.performance_score)
                      ? `${suggestion.performance_score}/100`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-400">Why this helps</div>
                <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">
                  {nice(suggestion.notes)}
                </div>

                <div className="mt-4 grid gap-2">
                  <div className="text-xs text-slate-400">Hook style</div>
                  <div className="text-sm text-slate-200">
                    {nice(suggestion.hook_style)}
                  </div>

                  <div className="text-xs text-slate-400 mt-2">CTA style</div>
                  <div className="text-sm text-slate-200">
                    {nice(suggestion.cta_style)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pattern Library */}
        <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">🗂 Your Growth Memory</div>
              <div className="text-xs text-slate-400 mt-1">
                Saved patterns you can revisit anytime. (This becomes your “playbook”.)
              </div>
            </div>
          </div>

          {patternsLoading ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
              Loading saved patterns…
            </div>
          ) : patterns.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
              Nothing saved yet. Save your first pattern above ⭐
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {patterns.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="text-sm text-slate-100 font-semibold">
                      {platformLabel(p.platform)} · {p.pattern_type} · {p.format}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => sendPatternToBrainstorm(p)}
                        className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-100 hover:bg-blue-500/15"
                        title="Send this saved pattern into Brainstorm as a brief"
                      >
                        🧠 Brainstorm
                      </button>

                      <div className="text-xs text-slate-400">
                        {p.performance_score != null ? `${p.performance_score}/100` : "—"} · saved{" "}
                        {new Date(p.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {p.notes ? (
                    <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">{p.notes}</div>
                  ) : null}

                  <div className="mt-3 grid md:grid-cols-2 gap-2 text-xs text-slate-300">
                    <div>
                      <span className="text-slate-400">Hook:</span> {nice(p.hook_style)}
                    </div>
                    <div>
                      <span className="text-slate-400">CTA:</span> {nice(p.cta_style)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* gentle footer */}
        <div className="text-xs text-slate-500 text-center">
          Growth Lab isn’t here to judge you. It’s here to help you keep going. One kind step at a time.
        </div>
      </div>
    </div>
  );
}
