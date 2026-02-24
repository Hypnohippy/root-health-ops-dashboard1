// app/dashboard/campaigns/page.tsx
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

type OutcomeItem = {
  id: string;
  experiment_id: string;
  metric_name: string;
  metric_value: number | null;
  meta: any;
  created_at: string;
};

type CoachFeedbackResponse = {
  success: boolean;
  experimentId?: string;
  headline?: string;
  keep?: string[];
  change?: string[];
  next?: string[];
  snapshot?: {
    postsAttempted?: number;
    postsOk?: number;
    postsFailed?: number;
    platformsOk?: string[];
    platformsFailed?: string[];
    outcomes?: Array<{
      metric_name: string;
      metric_value: number | null;
      note: string | null;
    }>;
  };
  error?: string;
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

/**
 * ✅ Brainstorm listens for these keys (Growth Seed)
 */
const GROWTH_SEED_KEYS = ["rootops_growth_seed_brainstorm_v1", "rh_growth_seed_brainstorm_v1"];

/**
 * ✅ Active experiment keys:
 * Other pages can read this later to tag posts / events.
 */
const ACTIVE_EXPERIMENT_KEYS = [
  "rootops_active_experiment_v1",
  "rh_active_experiment_v1",
  "activeExperiment",
  "growthLabActiveExperiment",
];

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

function clearLocalStorageMulti(keys: string[]) {
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
}

function fmtMetricName(n: string) {
  const k = String(n || "").toLowerCase();
  if (k === "leads") return "Leads";
  if (k === "bookings") return "Bookings";
  if (k === "dms") return "DMs";
  if (k === "clicks") return "Clicks";
  if (k === "saves") return "Saves";
  if (k === "comments") return "Comments";
  if (k === "likes") return "Likes";
  if (k === "notes") return "Note";
  if (k === "note") return "Note";
  return n || "Metric";
}

/**
 * ✅ IMPORTANT FIX:
 * Always send Supabase access token as Authorization Bearer for Growth API calls.
 * This fixes "Not authenticated" in modals/buttons.
 */
function getSupabaseAccessTokenFromLocalStorage(): string | null {
  try {
    // Supabase typically stores session under: sb-<project-ref>-auth-token
    // We'll search any key that ends with "-auth-token"
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || "";
      if (!key) continue;

      const lower = key.toLowerCase();
      if (!lower.endsWith("-auth-token")) continue;
      if (!lower.startsWith("sb-")) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      // Common shapes:
      // { access_token: "...", ... }
      // OR an array/stringified array in some setups
      try {
        const parsed: any = JSON.parse(raw);

        // direct session object
        if (parsed?.access_token) return String(parsed.access_token);

        // sometimes stored as { currentSession: { access_token } } etc
        if (parsed?.currentSession?.access_token) return String(parsed.currentSession.access_token);

        // sometimes stored as array like [access_token, refresh_token, ...]
        if (Array.isArray(parsed) && parsed[0]) return String(parsed[0]);

        // sometimes stored as { "access_token": "...", "refresh_token": "..." } but nested
        if (parsed?.data?.session?.access_token) return String(parsed.data.session.access_token);
      } catch {
        // ignore JSON parse errors
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function authFetch(url: string, init?: RequestInit) {
  const token = getSupabaseAccessTokenFromLocalStorage();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers ? (init.headers as any) : {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
}

export default function CampaignsPage() {
  // Suggestion
  const [loadingSuggestion, setLoadingSuggestion] = useState(true);
  const [suggestion, setSuggestion] = useState<Suggestion["suggestion"] | null>(null);

  // Experiments
  const [loadingExperiments, setLoadingExperiments] = useState(true);
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  // Outcomes
  const [loadingOutcomes, setLoadingOutcomes] = useState(false);
  const [outcomesByExperiment, setOutcomesByExperiment] = useState<Record<string, OutcomeItem[]>>({});

  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("facebook");
  const [patternType, setPatternType] = useState("practical");
  const [format, setFormat] = useState<"text" | "image" | "video">("text");
  const [hypothesis, setHypothesis] = useState("");
  const [notes, setNotes] = useState("");

  // Outcome modal
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [outcomeExperiment, setOutcomeExperiment] = useState<Experiment | null>(null);
  const [metricName, setMetricName] = useState<
    "leads" | "bookings" | "dms" | "clicks" | "saves" | "comments" | "likes" | "note"
  >("leads");
  const [metricValue, setMetricValue] = useState<string>("1");
  const [personalNote, setPersonalNote] = useState<string>("");

  // ✅ Coach feedback modal (Running only)
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachExperiment, setCoachExperiment] = useState<Experiment | null>(null);
  const [coachData, setCoachData] = useState<CoachFeedbackResponse | null>(null);

  // -------- load suggestion ----------
  async function loadSuggestion() {
    setLoadingSuggestion(true);
    setError(null);
    setSuggestion(null);

    try {
      const res = await authFetch("/api/growth/patterns/suggest");
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

  async function loadOutcomesForExperimentIds(experimentIds: string[]) {
    if (!experimentIds.length) {
      setOutcomesByExperiment({});
      return;
    }

    setLoadingOutcomes(true);
    try {
      const res = await authFetch("/api/growth/experiments/outcomes/list", {
        method: "POST",
        body: JSON.stringify({ experimentIds }),
      });

      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setLoadingOutcomes(false);
        return;
      }

      const items: OutcomeItem[] = Array.isArray(json.items) ? json.items : [];
      const map: Record<string, OutcomeItem[]> = {};
      for (const it of items) {
        const key = String(it.experiment_id);
        if (!map[key]) map[key] = [];
        map[key].push(it);
      }
      setOutcomesByExperiment(map);
    } catch {
      // ignore
    } finally {
      setLoadingOutcomes(false);
    }
  }

  // -------- load experiments ----------
  async function loadExperiments() {
    setLoadingExperiments(true);
    try {
      const res = await authFetch("/api/growth/experiments/list");
      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setExperiments([]);
        return;
      }

      const items = Array.isArray(json.items) ? json.items : [];
      setExperiments(items);

      // Load outcomes for everything shown
      const ids = items.map((e: Experiment) => e.id).filter(Boolean);
      await loadOutcomesForExperimentIds(ids);
    } catch {
      setExperiments([]);
    } finally {
      setLoadingExperiments(false);
    }
  }

  useEffect(() => {
    loadSuggestion();
    loadExperiments();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const counts = useMemo(() => {
    const plannedCount = experiments.filter((e) => clampStatus(e.status) === "planned").length;
    const runningCount = experiments.filter((e) => clampStatus(e.status) === "running").length;
    const completedCount = experiments.filter((e) => clampStatus(e.status) === "completed").length;
    return { planned: plannedCount, running: runningCount, completed: completedCount };
  }, [experiments]);

  const planned = useMemo(() => experiments.filter((e) => clampStatus(e.status) === "planned"), [experiments]);
  const running = useMemo(() => experiments.filter((e) => clampStatus(e.status) === "running"), [experiments]);
  const completed = useMemo(
    () => experiments.filter((e) => clampStatus(e.status) === "completed"),
    [experiments]
  );

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

  function closeCreate() {
    setCreateOpen(false);
    setCreating(false);
  }

  async function createExperiment() {
    setCreating(true);
    setError(null);

    try {
      const res = await authFetch("/api/growth/experiments/create", {
        method: "POST",
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
      const res = await authFetch("/api/growth/experiments/status", {
        method: "POST",
        body: JSON.stringify({ id, status }),
      });
      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setToast(json?.error || "Status update failed.");
        return false;
      }

      setToast(status === "running" ? "🏃 Now Running" : status === "completed" ? "🏁 Completed" : "📝 Back to Planned");
      await loadExperiments();
      return true;
    } catch {
      setToast("Status update failed.");
      return false;
    }
  }

  async function startRunningConnected(exp: Experiment) {
    setError(null);

    const ok = await setStatus(exp.id, "running");
    if (!ok) return;

    const activePayload = {
      v: 1,
      activatedAt: new Date().toISOString(),
      source: "growth_lab",
      organisationId: exp.organisation_id || null,
      experimentId: exp.id,
      title: exp.title || "Growth Experiment",
      platform: String(exp.platform || "facebook").toLowerCase(),
      pattern_type: exp.pattern_type || null,
      format: exp.format || null,
      hook_style: exp.hook_style || null,
      cta_style: exp.cta_style || null,
      hypothesis: exp.hypothesis || null,
      notes: exp.notes || null,
    };

    setLocalStorageMulti(ACTIVE_EXPERIMENT_KEYS, activePayload);
    setToast("✅ Tracking ON: this experiment is now active");
  }

  async function stopTrackingActiveExperiment() {
    clearLocalStorageMulti(ACTIVE_EXPERIMENT_KEYS);
    setToast("🛑 Tracking OFF: cleared active experiment");
  }

  async function deleteExperiment(id: string) {
    const ok = window.confirm("Delete this experiment? (This is a safe archive delete.)");
    if (!ok) return;

    try {
      const res = await authFetch("/api/growth/experiments/delete", {
        method: "POST",
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
      v: 1,
      createdAt: new Date().toISOString(),
      source: "growth_lab",
      organisationId: exp.organisation_id || null,
      experimentId: exp.id,
      platform: String(exp.platform || "facebook").toLowerCase(),
      title: exp.title || "Growth Experiment",
      hypothesis: exp.hypothesis || null,
      pattern_type: exp.pattern_type || null,
      format: exp.format || null,
      hook_style: exp.hook_style || null,
      cta_style: exp.cta_style || null,
      notes: exp.notes || null,
      confidence: exp.confidence ?? null,
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

    setToast("Sending to Brainstorm…");
    setLocalStorageMulti(GROWTH_SEED_KEYS, payload);
    window.location.href = "/dashboard/brainstorm";
  }

  function openOutcomeModal(exp: Experiment) {
    setError(null);
    setOutcomeExperiment(exp);
    setMetricName("leads");
    setMetricValue("1");
    setPersonalNote("");
    setOutcomeOpen(true);
  }

  function closeOutcomeModal() {
    setOutcomeOpen(false);
    setOutcomeSaving(false);
    setOutcomeExperiment(null);
  }

  async function addOutcome() {
    if (!outcomeExperiment) return;

    setOutcomeSaving(true);
    setError(null);

    try {
      const name = metricName === "note" ? "note" : metricName;
      const val = metricName === "note" ? null : metricValue === "" ? null : Number(metricValue);

      const res = await authFetch("/api/growth/experiments/outcomes/add", {
        method: "POST",
        body: JSON.stringify({
          experimentId: outcomeExperiment.id,
          metric_name: name,
          metric_value: Number.isFinite(val as any) ? val : null,
          meta: personalNote ? { note: personalNote } : {},
        }),
      });

      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error || "Add outcome failed.");
        setOutcomeSaving(false);
        return;
      }

      const item: OutcomeItem = json.item;

      setOutcomesByExperiment((prev) => {
        const next = { ...prev };
        const key = String(item.experiment_id);
        next[key] = [item, ...(next[key] || [])];
        return next;
      });

      setToast("✅ Saved result/note");
      setOutcomeSaving(false);
      setOutcomeOpen(false);
      setOutcomeExperiment(null);
    } catch (e: any) {
      setError(e?.message || "Add outcome failed.");
      setOutcomeSaving(false);
    }
  }

  function renderOutcomeSummary(expId: string) {
    const items = outcomesByExperiment[expId] || [];
    if (!items.length) return null;

    const top = items.slice(0, 3);

    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {top.map((o) => {
          const label = fmtMetricName(o.metric_name);
          const val = o.metric_value === null || o.metric_value === undefined ? "" : `: ${o.metric_value}`;
          const note = o?.meta?.note ? ` — ${String(o.meta.note).slice(0, 60)}` : "";
          return (
            <div
              key={o.id}
              className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] text-slate-200"
              title={o?.meta?.note ? String(o.meta.note) : ""}
            >
              {label}
              {val}
              {note}
            </div>
          );
        })}
        {items.length > 3 ? <div className="text-[11px] text-slate-400 self-center">+{items.length - 3} more</div> : null}
      </div>
    );
  }

  // ✅ Coach modal helpers
  function openCoachModal(exp: Experiment) {
    setCoachExperiment(exp);
    setCoachOpen(true);
    setCoachLoading(true);
    setCoachError(null);
    setCoachData(null);

    void (async () => {
      try {
        const res = await authFetch("/api/growth/experiments/coach-feedback", {
          method: "POST",
          body: JSON.stringify({ experimentId: exp.id }),
        });
        const json: CoachFeedbackResponse = await res.json().catch(() => null as any);

        if (!res.ok || !json?.success) {
          setCoachError(json?.error || `Coach feedback failed (${res.status}).`);
          setCoachLoading(false);
          return;
        }

        setCoachData(json);
        setCoachLoading(false);
      } catch (e: any) {
        setCoachError(e?.message || "Coach feedback failed.");
        setCoachLoading(false);
      }
    })();
  }

  function closeCoachModal() {
    setCoachOpen(false);
    setCoachLoading(false);
    setCoachError(null);
    setCoachData(null);
    setCoachExperiment(null);
  }

  function renderBullets(items?: string[]) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (list.length === 0) return <div className="text-sm text-slate-400">—</div>;
    return (
      <ul className="mt-2 space-y-2">
        {list.map((t, idx) => (
          <li key={`${idx}-${t}`} className="text-sm text-slate-200">
            • {t}
          </li>
        ))}
      </ul>
    );
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
            Start small experiments → develop the post in Brainstorm → post via Quick Blast → learn what works. No guilt. No chaos. Just momentum.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                loadSuggestion();
                loadExperiments();
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

            <button
              onClick={stopTrackingActiveExperiment}
              className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              title="Clears the active experiment tracker"
            >
              Stop tracking
            </button>

            <div className="text-xs text-slate-400">
              Planned <span className="text-slate-200 font-semibold">{counts.planned}</span> · Running{" "}
              <span className="text-slate-200 font-semibold">{counts.running}</span> · Completed{" "}
              <span className="text-slate-200 font-semibold">{counts.completed}</span>
              {loadingOutcomes ? <span className="ml-2 text-slate-500">(loading results…)</span> : null}
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
              <div className="text-xs text-slate-400 mt-1">You’re always in control. Use it, edit it, or skip it. 🙂</div>
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
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">Loading suggestion…</div>
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
                <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">{nice(suggestion.notes)}</div>

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
              <div className="text-xs text-slate-400 mt-1">Planned → develop in Brainstorm → move to Running → complete when you’ve tried 2–3 posts.</div>
            </div>
          </div>

          {loadingExperiments ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">Loading experiments…</div>
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

                        {e.hypothesis ? <div className="text-[12px] text-slate-300 whitespace-pre-wrap">{e.hypothesis}</div> : null}

                        {renderOutcomeSummary(e.id)}

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
                            onClick={() => startRunningConnected(e)}
                            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                            title="Moves to Running and marks it as the active experiment for tracking."
                          >
                            Start running (track)
                          </button>

                          <button
                            type="button"
                            onClick={() => openOutcomeModal(e)}
                            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                          >
                            ➕ Add result/note
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

                        {renderOutcomeSummary(e.id)}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const activePayload = {
                                v: 1,
                                activatedAt: new Date().toISOString(),
                                source: "growth_lab",
                                organisationId: e.organisation_id || null,
                                experimentId: e.id,
                                title: e.title || "Growth Experiment",
                                platform: String(e.platform || "facebook").toLowerCase(),
                                pattern_type: e.pattern_type || null,
                                format: e.format || null,
                                hook_style: e.hook_style || null,
                                cta_style: e.cta_style || null,
                                hypothesis: e.hypothesis || null,
                                notes: e.notes || null,
                              };
                              setLocalStorageMulti(ACTIVE_EXPERIMENT_KEYS, activePayload);
                              sendExperimentToBrainstorm(e);
                            }}
                            className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                          >
                            Make next post (Brainstorm)
                          </button>

                          <button
                            type="button"
                            onClick={() => openOutcomeModal(e)}
                            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                          >
                            ➕ Add result/note
                          </button>

                          <button
                            type="button"
                            onClick={() => openCoachModal(e)}
                            className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/15"
                            title="A gentle reflective summary: keep / change / next"
                          >
                            🧠 Coach feedback
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

                        {renderOutcomeSummary(e.id)}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openOutcomeModal(e)}
                            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                          >
                            ➕ Add result/note
                          </button>

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
                    This creates a <b>Planned</b> experiment.
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
                  <label className="block text-xs font-medium text-slate-300">Friendly name</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder='e.g. "Facebook: practical video tips"'
                  />
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
                  <label className="block text-xs font-medium text-slate-300">Hypothesis (optional)</label>
                  <textarea
                    value={hypothesis}
                    onChange={(e) => setHypothesis(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none"
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

        {/* Outcome modal */}
        {outcomeOpen && outcomeExperiment ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeOutcomeModal} />

            <div className="relative w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Experiment feedback</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">Add result / note</div>
                  <div className="mt-1 text-[12px] text-slate-400">{outcomeExperiment.title || "Untitled experiment"}</div>
                </div>

                <button
                  className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                  onClick={closeOutcomeModal}
                  disabled={outcomeSaving}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">Metric</label>
                    <select
                      value={metricName}
                      onChange={(e) => setMetricName(e.target.value as any)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                    >
                      <option value="leads">Leads</option>
                      <option value="bookings">Bookings</option>
                      <option value="dms">DMs</option>
                      <option value="clicks">Clicks</option>
                      <option value="saves">Saves</option>
                      <option value="comments">Comments</option>
                      <option value="likes">Likes</option>
                      <option value="note">Just a note (no number)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Value</label>
                    <input
                      value={metricValue}
                      onChange={(e) => setMetricValue(e.target.value)}
                      disabled={metricName === "note"}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none disabled:opacity-60"
                      placeholder="e.g. 2"
                      inputMode="numeric"
                    />
                    <div className="mt-1 text-[11px] text-slate-500">If you choose “Just a note”, value is ignored.</div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Personal note (optional)</label>
                  <textarea
                    value={personalNote}
                    onChange={(e) => setPersonalNote(e.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none"
                    placeholder='e.g. "Generated 2 leads. People replied more when I asked a direct question."'
                  />
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={addOutcome}
                    disabled={outcomeSaving || !outcomeExperiment}
                    className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {outcomeSaving ? "Saving…" : "Save"}
                  </button>

                  <button
                    type="button"
                    onClick={closeOutcomeModal}
                    disabled={outcomeSaving}
                    className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                  >
                    Cancel
                  </button>
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

        {/* ✅ Coach feedback modal */}
        {coachOpen && coachExperiment ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeCoachModal} />

            <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Experiment coach</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">🧠 Coach feedback</div>
                  <div className="mt-1 text-[12px] text-slate-400">
                    {coachExperiment.title || "Untitled experiment"} • {platformLabel(coachExperiment.platform)} •{" "}
                    {nice(coachExperiment.pattern_type)} • {nice(coachExperiment.format)}
                  </div>
                </div>

                <button
                  className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                  onClick={closeCoachModal}
                  disabled={coachLoading}
                >
                  Close
                </button>
              </div>

              <div className="mt-4">
                {coachLoading ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
                    Thinking… pulling your events + results…
                  </div>
                ) : coachError ? (
                  <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-100">
                    {coachError}
                    <div className="mt-2 text-[12px] text-red-200/80">
                      Tip: make sure this API exists:{" "}
                      <span className="font-semibold">/api/growth/experiments/coach-feedback</span>
                    </div>
                  </div>
                ) : coachData ? (
                  <div className="space-y-4">
                    {coachData.headline ? (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                        {coachData.headline}
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <div className="text-sm font-semibold text-slate-100">Keep</div>
                        {renderBullets(coachData.keep)}
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <div className="text-sm font-semibold text-slate-100">Change</div>
                        {renderBullets(coachData.change)}
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <div className="text-sm font-semibold text-slate-100">Next</div>
                        {renderBullets(coachData.next)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
                    No coach feedback returned.
                  </div>
                )}
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
