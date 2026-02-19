"use client";

import React, { useEffect, useMemo, useState } from "react";

type ExperimentStatus = "planned" | "running" | "completed";

type Experiment = {
  id: string;
  organisation_id: string;
  title?: string | null;
  hypothesis?: string | null;

  platform: string | null;
  goal: string | null;
  format: string | null;
  pattern_type: string | null;
  hook_style: string | null;
  cta_style: string | null;
  notes: string | null;

  status: string | null;
  confidence: number | null;

  created_at: string;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  deleted_at?: string | null;
};

type Suggestion = {
  success: boolean;
  organisationId?: string;
  suggestion?: {
    platform: string;
    pattern_type: string;
    format: "text" | "image" | "video";
    hook_style: string;
    cta_style: string;
    notes: string;
    performance_score: number;
  };
  error?: string;
};

// ✅ Trend Radar types (new)
type TrendItem = {
  topic: string;
  hooks?: string[];
};

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

function clampStatus(s?: string | null): ExperimentStatus {
  const k = String(s || "").toLowerCase().trim();
  if (k === "running") return "running";
  if (k === "completed") return "completed";
  return "planned";
}

const PREFILL_BRAINSTORM_KEYS = ["rootops_prefill_brainstorm_v1", "rh_prefill_brainstorm_v1"];

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

export default function CampaignsPage() {
  // Suggestion (existing behaviour)
  const [loadingSuggestion, setLoadingSuggestion] = useState(true);
  const [suggestion, setSuggestion] = useState<Suggestion["suggestion"] | null>(null);

  // Experiments
  const [loadingExperiments, setLoadingExperiments] = useState(true);
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("facebook");
  const [patternType, setPatternType] = useState("practical");
  const [format, setFormat] = useState<"text" | "image" | "video">("text");
  const [hypothesis, setHypothesis] = useState("");
  const [notes, setNotes] = useState("");

  // ✅ Trend Radar state (new)
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [trends, setTrends] = useState<TrendItem[]>([]);

  // -------- load suggestion ----------
  async function loadSuggestion() {
    setLoadingSuggestion(true);
    setError(null);
    setSuggestion(null);

    try {
      const res = await fetch("/api/growth/patterns/suggest", { cache: "no-store" });
      const json: Suggestion = await res.json().catch(() => null as any);

      if (!res.ok || !json?.success || !json?.suggestion) {
        setSuggestion(null);
        setError(json?.error || "No suggestion available yet.");
        return;
      }

      setSuggestion(json.suggestion);
    } catch (e: any) {
      setError(e?.message || "Failed to load suggestion.");
    } finally {
      setLoadingSuggestion(false);
    }
  }

  // -------- load experiments ----------
  async function loadExperiments() {
    setLoadingExperiments(true);
    try {
      const res = await fetch("/api/growth/experiments/list", { cache: "no-store" });
      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setExperiments([]);
        return;
      }

      setExperiments(Array.isArray(json.items) ? json.items : []);
    } catch {
      setExperiments([]);
    } finally {
      setLoadingExperiments(false);
    }
  }

  // ✅ load trends (new)
  async function loadTrends() {
    setLoadingTrends(true);
    setTrendError(null);
    try {
      const res = await fetch("/api/trends", { cache: "no-store" });
      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setTrends([]);
        setTrendError(json?.error || "No trends available yet.");
        return;
      }

      setTrends(Array.isArray(json.trends) ? json.trends : []);
    } catch (e: any) {
      setTrends([]);
      setTrendError(e?.message || "Failed to load trends.");
    } finally {
      setLoadingTrends(false);
    }
  }

  useEffect(() => {
    loadSuggestion();
    loadExperiments();
    loadTrends(); // ✅ new
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const counts = useMemo(() => {
    const planned = experiments.filter((e) => clampStatus(e.status) === "planned").length;
    const running = experiments.filter((e) => clampStatus(e.status) === "running").length;
    const completed = experiments.filter((e) => clampStatus(e.status) === "completed").length;
    return { planned, running, completed };
  }, [experiments]);

  const planned = useMemo(() => experiments.filter((e) => clampStatus(e.status) === "planned"), [experiments]);
  const running = useMemo(() => experiments.filter((e) => clampStatus(e.status) === "running"), [experiments]);
  const completed = useMemo(() => experiments.filter((e) => clampStatus(e.status) === "completed"), [experiments]);

  function openCreateFromSuggestion() {
    setError(null);

    if (suggestion) {
      const p = String(suggestion.platform || "facebook").toLowerCase();
      const pt = String(suggestion.pattern_type || "practical").toLowerCase();
      const fmt = (suggestion.format || "text") as any;

      setPlatform(p || "facebook");
      setPatternType(pt || "practical");
      setFormat(fmt);

      const autoTitle = `${platformLabel(p)}: ${pt} (${fmt})`;
      setTitle(autoTitle);

      const autoHyp = `If I use the "${pt}" pattern, I’ll get more engagement (comments/saves) because it matches what my audience responds to.`;
      setHypothesis(autoHyp);

      setNotes(String(suggestion.notes || "").trim());
    } else {
      setTitle("");
      setPlatform("facebook");
      setPatternType("practical");
      setFormat("text");
      setHypothesis("");
      setNotes("");
    }

    setCreateOpen(true);
  }

  // ✅ new: open create modal from a Trend
  function openCreateFromTrend(t: TrendItem) {
    setError(null);

    // You can choose a default platform here (or keep your last one).
    // We'll keep it simple: default to Facebook and practical text.
    setPlatform("facebook");
    setPatternType("practical");
    setFormat("text");

    setTitle(`Trend: ${t.topic}`);
    setHypothesis(
      `If I create a practical post about "${t.topic}" while it’s trending, I’ll get more engagement because it matches what people are actively searching for.`
    );

    const hookLines =
      Array.isArray(t.hooks) && t.hooks.length > 0
        ? `\n\nSuggested hooks:\n- ${t.hooks.join("\n- ")}`
        : "";

    setNotes(`Trend Radar topic: "${t.topic}".${hookLines}`);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreating(false);
  }

  async function createExperiment() {
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/growth/experiments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          title: title.trim(),
          platform: platform.trim(),
          pattern_type: patternType.trim(),
          format,
          hypothesis: hypothesis.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setError(json?.error || `Create failed (${res.status}).`);
        setCreating(false);
        return;
      }

      setToast("✅ Experiment created (Planned)");
      setCreateOpen(false);
      setCreating(false);
      await loadExperiments();
    } catch (e: any) {
      setError(e?.message || "Create failed.");
      setCreating(false);
    }
  }

  async function setStatus(id: string, status: ExperimentStatus) {
    try {
      const res = await fetch("/api/growth/experiments/set-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id, status }),
      });
      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setToast(json?.error || "Status update failed.");
        return;
      }

      setToast(status === "running" ? "🏃 Now Running" : status === "completed" ? "🏁 Completed" : "📝 Back to Planned");
      await loadExperiments();
    } catch {
      setToast("Status update failed.");
    }
  }

  async function deleteExperiment(id: string) {
    const ok = window.confirm("Delete this experiment? (This is a safe archive delete.)");
    if (!ok) return;

    try {
      const res = await fetch("/api/growth/experiments/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id }),
      });
      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setToast(json?.error || "Delete failed.");
        return;
      }

      setToast("🧹 Deleted");
      await loadExperiments();
    } catch {
      setToast("Delete failed.");
    }
  }

  function sendExperimentToBrainstorm(exp: Experiment) {
    const payload = {
      source: "growth_lab",
      experimentId: exp.id,
      platform: String(exp.platform || "facebook").toLowerCase(),
      title: exp.title || "Growth Experiment",
      brief: [
        `We are running a Growth Experiment.`,
        ``,
        `Title: ${exp.title || "—"}`,
        `Platform: ${platformLabel(exp.platform)}`,
        `Pattern: ${nice(exp.pattern_type)}`,
        `Format: ${nice(exp.format)}`,
        exp.hypothesis ? `Hypothesis: ${exp.hypothesis}` : null,
        exp.notes ? `Notes: ${exp.notes}` : null,
        ``,
        `Task: Generate 6 post drafts that match this experiment, with gentle tone + clear CTA.`,
        `Also give 10 hooks first, then the drafts.`,
      ]
        .filter(Boolean)
        .join("\n"),
    };

    setLocalStorageMulti(PREFILL_BRAINSTORM_KEYS, payload);
    window.location.href = "/dashboard/brainstorm";
  }

  // ✅ new: send Trend to Brainstorm
  function sendTrendToBrainstorm(t: TrendItem) {
    const hooks =
      Array.isArray(t.hooks) && t.hooks.length > 0
        ? `\n\nTrend hooks:\n- ${t.hooks.join("\n- ")}`
        : "";

    const payload = {
      source: "trend_radar",
      platform: "facebook",
      title: `Trend: ${t.topic}`,
      brief: [
        `We are using Trend Radar to make a relevant post.`,
        ``,
        `Topic: ${t.topic}`,
        hooks ? hooks : null,
        ``,
        `Task: Give 10 hooks first, then generate 6 post drafts in a gentle tone with clear CTA.`,
      ]
        .filter(Boolean)
        .join("\n"),
    };

    setLocalStorageMulti(PREFILL_BRAINSTORM_KEYS, payload);
    window.location.href = "/dashboard/brainstorm";
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <div className="text-xs text-slate-400">Root Health Ops</div>
          <h1 className="mt-1 text-2xl md:text-3xl font-semibold">
            🧪 Growth Lab <span className="text-slate-400">— your gentle growth buddy</span>
          </h1>

          <p className="mt-3 text-sm text-slate-300 max-w-3xl">
            Start small experiments → develop the post in Brainstorm → post via Quick Blast → learn what works.
            No guilt. No chaos. Just momentum.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                loadSuggestion();
                loadExperiments();
                loadTrends(); // ✅ new
              }}
              className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              Refresh
            </button>

            <button
              onClick={openCreateFromSuggestion}
              className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              ➕ Start an experiment
            </button>

            <div className="text-xs text-slate-400">
              Planned <span className="text-slate-200 font-semibold">{counts.planned}</span> · Running{" "}
              <span className="text-slate-200 font-semibold">{counts.running}</span> · Completed{" "}
              <span className="text-slate-200 font-semibold">{counts.completed}</span>
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

        {/* ✅ Trend Radar (NEW block, does NOT replace anything else) */}
        <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">📡 Trend Radar</div>
              <div className="text-xs text-slate-400 mt-1">
                Lightweight starter trends (safe). Later we’ll plug real Google Trends + platform signals.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadTrends}
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
              >
                Refresh trends
              </button>
            </div>
          </div>

          {trendError ? (
            <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-100">
              {trendError}
            </div>
          ) : null}

          {loadingTrends ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
              Loading trends…
            </div>
          ) : trends.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
              No trends yet.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {trends.slice(0, 8).map((t, idx) => (
                <div key={`${t.topic}-${idx}`} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-100">{t.topic}</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => sendTrendToBrainstorm(t)}
                        className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                      >
                        Develop in Brainstorm
                      </button>
                      <button
                        type="button"
                        onClick={() => openCreateFromTrend(t)}
                        className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                      >
                        Start experiment
                      </button>
                    </div>
                  </div>

                  {Array.isArray(t.hooks) && t.hooks.length > 0 ? (
                    <div className="mt-3 text-[12px] text-slate-300">
                      <div className="text-xs text-slate-400 mb-1">Example hooks</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {t.hooks.slice(0, 4).map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 text-[11px] text-slate-500">
            Tip: We keep this “safe starter” for now (no API keys). Next step is real Google Trends and “UK region” filters.
          </div>
        </div>

        {/* Suggestion */}
        <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Today’s gentle suggestion</div>
              <div className="text-xs text-slate-400 mt-1">
                You’re always in control. Use it, edit it, or skip it. 🙂
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
                onClick={openCreateFromSuggestion}
                className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Start experiment from this
              </button>
            </div>
          </div>

          {loadingSuggestion ? (
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
                <div className="mt-1 text-lg font-semibold">{platformLabel(suggestion.platform)}</div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-400">Pattern</div>
                    <div className="mt-1 text-sm text-slate-100">{nice(suggestion.pattern_type)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Format</div>
                    <div className="mt-1 text-sm text-slate-100">{nice(suggestion.format)}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-400">Confidence</div>
                  <div className="mt-1 text-sm text-slate-100">
                    {Number.isFinite(suggestion.performance_score) ? `${suggestion.performance_score}/100` : "—"}
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
                  <div className="text-sm text-slate-200">{nice(suggestion.hook_style)}</div>

                  <div className="text-xs text-slate-400 mt-2">CTA style</div>
                  <div className="text-sm text-slate-200">{nice(suggestion.cta_style)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Experiments */}
        <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">🧷 Experiments</div>
              <div className="text-xs text-slate-400 mt-1">
                Planned → develop in Brainstorm → move to Running → complete when you’ve tried 2–3 posts.
              </div>
            </div>
          </div>

          {loadingExperiments ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
              Loading experiments…
            </div>
          ) : experiments.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
              Nothing here yet. Start your first experiment above ➕
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Planned */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Planned</div>
                  <div className="text-xs text-slate-400">{counts.planned}</div>
                </div>
                <div className="mt-2 text-[12px] text-slate-400">Saved ideas. Start one when ready.</div>

                <div className="mt-3 space-y-3">
                  {planned.length === 0 ? (
                    <div className="text-sm text-slate-400">Nothing here yet.</div>
                  ) : (
                    planned.map((e) => (
                      <div key={e.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                        <div className="text-sm font-semibold text-slate-100">{e.title || "Untitled experiment"}</div>
                        <div className="text-[12px] text-slate-300">
                          {platformLabel(e.platform)} · {nice(e.pattern_type)} · {nice(e.format)}
                        </div>

                        {e.hypothesis ? (
                          <div className="text-[12px] text-slate-300 whitespace-pre-wrap">{e.hypothesis}</div>
                        ) : null}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => sendExperimentToBrainstorm(e)}
                            className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                          >
                            Develop in Brainstorm
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatus(e.id, "running")}
                            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                          >
                            Start (Running)
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteExperiment(e.id)}
                            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-red-500 hover:text-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Running */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Running</div>
                  <div className="text-xs text-slate-400">{counts.running}</div>
                </div>
                <div className="mt-2 text-[12px] text-slate-400">Try it for 2–3 posts before judging it.</div>

                <div className="mt-3 space-y-3">
                  {running.length === 0 ? (
                    <div className="text-sm text-slate-400">Nothing here yet.</div>
                  ) : (
                    running.map((e) => (
                      <div key={e.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                        <div className="text-sm font-semibold text-slate-100">{e.title || "Untitled experiment"}</div>
                        <div className="text-[12px] text-slate-300">
                          {platformLabel(e.platform)} · {nice(e.pattern_type)} · {nice(e.format)}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => sendExperimentToBrainstorm(e)}
                            className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                          >
                            Make next post (Brainstorm)
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatus(e.id, "completed")}
                            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                          >
                            Mark completed
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteExperiment(e.id)}
                            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-red-500 hover:text-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Completed */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Completed</div>
                  <div className="text-xs text-slate-400">{counts.completed}</div>
                </div>
                <div className="mt-2 text-[12px] text-slate-400">Your playbook is forming.</div>

                <div className="mt-3 space-y-3">
                  {completed.length === 0 ? (
                    <div className="text-sm text-slate-400">Nothing here yet.</div>
                  ) : (
                    completed.map((e) => (
                      <div key={e.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                        <div className="text-sm font-semibold text-slate-100">{e.title || "Untitled experiment"}</div>
                        <div className="text-[12px] text-slate-300">
                          {platformLabel(e.platform)} · {nice(e.pattern_type)} · {nice(e.format)}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setStatus(e.id, "planned")}
                            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                          >
                            Re-run (back to Planned)
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteExperiment(e.id)}
                            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-red-500 hover:text-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create modal */}
        {createOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeCreate} />

            <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Growth Lab</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">Start an experiment</div>
                  <div className="mt-1 text-[12px] text-slate-400">
                    This creates a <b>Planned</b> experiment. You can develop the post in Brainstorm and start it when ready.
                  </div>
                </div>

                <button
                  className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                  onClick={closeCreate}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Friendly name (what are we trying?)</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder='e.g. "Facebook: practical video tips"'
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Tip: Keep it short. You can always rename later.
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">Platform</label>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                    >
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="threads">Threads</option>
                      <option value="tiktok">TikTok</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Pattern</label>
                    <input
                      value={patternType}
                      onChange={(e) => setPatternType(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                      placeholder="e.g. practical"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Format</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as any)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Why might this work? (optional)</label>
                  <textarea
                    value={hypothesis}
                    onChange={(e) => setHypothesis(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none"
                    placeholder='e.g. "Short practical tips get saved more often."'
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Tip: One sentence is enough. We’re not writing a PhD 😄
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none"
                    placeholder="Any context you want the AI to remember…"
                  />
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={createExperiment}
                    disabled={creating || !title.trim() || !platform.trim() || !patternType.trim()}
                    className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {creating ? "Creating…" : "Create experiment"}
                  </button>

                  <button
                    type="button"
                    onClick={closeCreate}
                    disabled={creating}
                    className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                  >
                    Cancel
                  </button>

                  <div className="text-[11px] text-slate-500 self-center">
                    This starts as <b>Planned</b>. Move it to <b>Running</b> when you’re ready.
                  </div>
                </div>

                {error ? (
                  <div className="mt-2 rounded-2xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="text-xs text-slate-500 text-center">
          Growth Lab isn’t here to judge you. It’s here to help you keep going. One kind step at a time.
        </div>
      </div>
    </div>
  );
}
