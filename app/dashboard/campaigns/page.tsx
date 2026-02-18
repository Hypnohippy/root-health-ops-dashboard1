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

type Outcome = {
  id: string;
  metric_name: string;
  metric_value: number | null;
  created_at: string;
};

type Experiment = {
  id: string;
  organisation_id: string;
  title: string;
  hypothesis: string | null;
  platform: string;
  pattern_type: string | null;
  format: string | null;
  status: "planned" | "running" | "completed" | "abandoned";
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  growth_experiment_outcomes?: Outcome[];
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

function statusLabel(s: Experiment["status"]) {
  if (s === "planned") return "Planned";
  if (s === "running") return "Running";
  if (s === "completed") return "Completed";
  return "Archived";
}

function badgeClassesForStatus(s: Experiment["status"]) {
  if (s === "planned") return "border-slate-600 text-slate-300 bg-slate-900/40";
  if (s === "running") return "border-emerald-500/60 text-emerald-200 bg-emerald-500/10";
  if (s === "completed") return "border-blue-500/60 text-blue-200 bg-blue-500/10";
  return "border-slate-700 text-slate-400 bg-slate-900/30";
}

function formatWhen(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function CampaignsPage() {
  // Growth Lab = repurposed /dashboard/campaigns (enterprise-safe)
  const [loading, setLoading] = useState(true);
  const [patternsLoading, setPatternsLoading] = useState(true);
  const [experimentsLoading, setExperimentsLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [suggestion, setSuggestion] = useState<Suggestion["suggestion"] | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  // Therapist control at “output stage” (before creating experiment)
  const [startOpen, setStartOpen] = useState(false);
  const [startTitle, setStartTitle] = useState("");
  const [startHypothesis, setStartHypothesis] = useState("");
  const [startPlatform, setStartPlatform] = useState("");
  const [startPatternType, setStartPatternType] = useState("");
  const [startFormat, setStartFormat] = useState("");

  // Outcomes modal
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeExperiment, setOutcomeExperiment] = useState<Experiment | null>(null);
  const [metricName, setMetricName] = useState("comments");
  const [metricValue, setMetricValue] = useState<string>("");
  const [outcomeSaving, setOutcomeSaving] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
  }

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

  async function loadExperiments() {
    setExperimentsLoading(true);
    try {
      const res = await fetch("/api/growth/experiments/list", { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setExperiments([]);
        setExperimentsLoading(false);
        return;
      }

      setExperiments(Array.isArray(json.items) ? json.items : []);
    } catch {
      setExperiments([]);
    } finally {
      setExperimentsLoading(false);
    }
  }

  useEffect(() => {
    void loadSuggestion();
    void loadPatterns();
    void loadExperiments();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const hasSuggestion = !!suggestion;

  const savedCount = useMemo(() => patterns.length, [patterns]);

  const planned = useMemo(() => experiments.filter((e) => e.status === "planned"), [experiments]);
  const running = useMemo(() => experiments.filter((e) => e.status === "running"), [experiments]);
  const completed = useMemo(() => experiments.filter((e) => e.status === "completed"), [experiments]);

  const roadmap = useMemo(() => {
    if (running.length > 0) {
      return {
        title: "Today’s roadmap",
        steps: [
          "Pick ONE running experiment to focus on (keep it gentle).",
          "Post once using that pattern.",
          "Tomorrow: add one result number (even if it’s small).",
        ],
        mood: "You’re already doing it. Quiet consistency beats chaos.",
      };
    }

    if (planned.length > 0) {
      return {
        title: "Today’s roadmap",
        steps: [
          "Choose ONE planned experiment to start.",
          "Run it for 2–3 posts (don’t overthink).",
          "Add one outcome number when you’re ready.",
        ],
        mood: "Your future self will thank you for keeping it simple.",
      };
    }

    return {
      title: "Today’s roadmap",
      steps: [
        "Start your first experiment from the suggestion (it takes 30 seconds).",
        "Post once. That’s the win.",
        "Come back tomorrow for a new gentle nudge.",
      ],
      mood: "No pressure. Just momentum.",
    };
  }, [planned.length, running.length]);

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

      showToast("⭐ Saved to Growth Memory");
      await loadPatterns();
      await loadSuggestion(); // refresh to generate a fresh suggestion
    } catch (e: any) {
      setError(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function openStartExperimentFromSuggestion() {
    if (!suggestion) return;

    // Therapist control: they can edit these before we create anything
    const plat = String(suggestion.platform || "").trim();
    const pt = String(suggestion.pattern_type || "").trim();
    const fmt = String(suggestion.format || "").trim();

    setStartPlatform(plat || "instagram");
    setStartPatternType(pt);
    setStartFormat(fmt);

    // A friendly default title/hypothesis
    setStartTitle(
      pt && fmt
        ? `${platformLabel(plat)}: ${pt} (${fmt})`
        : `${platformLabel(plat)}: gentle growth experiment`
    );

    setStartHypothesis(
      pt
        ? `If I use the "${pt}" pattern, I’ll get more engagement (comments/saves) because it matches what my audience responds to.`
        : "If I keep my message simple and consistent, engagement will improve over time."
    );

    setStartOpen(true);
  }

  function closeStart() {
    setStartOpen(false);
  }

  async function createExperiment() {
    setError(null);

    const title = startTitle.trim();
    const platform = startPlatform.trim();

    if (!title || !platform) {
      setError("Please provide a title and platform.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/growth/experiments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          title,
          hypothesis: startHypothesis.trim() || null,
          platform,
          pattern_type: startPatternType.trim() || null,
          format: startFormat.trim() || null,
          status: "planned",
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setError(json?.error || `Failed to create experiment (${res.status}).`);
        setSaving(false);
        return;
      }

      showToast("🧪 Experiment created");
      setStartOpen(false);
      await loadExperiments();
    } catch (e: any) {
      setError(e?.message || "Failed to create experiment.");
    } finally {
      setSaving(false);
    }
  }

  async function setExperimentStatus(id: string, status: Experiment["status"]) {
    setError(null);
    try {
      const res = await fetch("/api/growth/experiments/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error || `Failed to update status (${res.status}).`);
        return;
      }
      showToast(`✅ Moved to ${statusLabel(status)}`);
      await loadExperiments();
    } catch (e: any) {
      setError(e?.message || "Failed to update status.");
    }
  }

  function openOutcomeModal(exp: Experiment) {
    setOutcomeExperiment(exp);
    setMetricName("comments");
    setMetricValue("");
    setOutcomeOpen(true);
  }

  function closeOutcomeModal() {
    setOutcomeOpen(false);
    setOutcomeExperiment(null);
    setOutcomeSaving(false);
  }

  async function addOutcome() {
    if (!outcomeExperiment) return;

    const mn = metricName.trim();
    if (!mn) {
      setError("Please enter a metric name.");
      return;
    }

    setOutcomeSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/growth/experiments/outcomes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          experimentId: outcomeExperiment.id,
          metric_name: mn,
          metric_value: metricValue.trim() === "" ? null : Number(metricValue),
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setError(json?.error || `Failed to add outcome (${res.status}).`);
        setOutcomeSaving(false);
        return;
      }

      showToast("📈 Result added");
      setOutcomeSaving(false);
      setOutcomeOpen(false);
      setOutcomeExperiment(null);
      await loadExperiments();
    } catch (e: any) {
      setOutcomeSaving(false);
      setError(e?.message || "Failed to add outcome.");
    }
  }

  const refreshAll = async () => {
    setError(null);
    await Promise.all([loadSuggestion(), loadPatterns(), loadExperiments()]);
  };

  function totalsForExperiment(exp: Experiment) {
    const outs = Array.isArray(exp.growth_experiment_outcomes)
      ? exp.growth_experiment_outcomes
      : [];
    const count = outs.length;
    const last = count > 0 ? outs[0] : null;
    return { count, last };
  }

  const boardCols: { key: Experiment["status"]; title: string; items: Experiment[]; hint: string }[] = [
    {
      key: "planned",
      title: "Planned",
      items: planned,
      hint: "Pick one when you’re ready. Simple beats perfect.",
    },
    {
      key: "running",
      title: "Running",
      items: running,
      hint: "Keep it gentle. Repeat a pattern 2–3 times before judging it.",
    },
    {
      key: "completed",
      title: "Completed",
      items: completed,
      hint: "Your playbook is forming. Quiet wins count.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Root Health Ops</div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold">
                🧪 Growth Lab <span className="text-slate-400">— your gentle growth buddy</span>
              </h1>

              <p className="mt-3 text-sm text-slate-300 max-w-3xl">
                Growth Lab helps you build momentum without the “campaign admin” headache.
                We turn what works into a calm, repeatable playbook — one kind step at a time.
              </p>

              <div className="mt-3 text-[11px] text-slate-500">
                Tiny reminder: if you’re tired, your only job is to do the next small thing. (Tea counts.)
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={refreshAll}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
                >
                  Refresh
                </button>

                <div className="text-xs text-slate-400">
                  Growth Memory saved:{" "}
                  <span className="text-slate-200 font-semibold">{savedCount}</span>
                </div>

                <div className="text-xs text-slate-400">
                  Experiments:{" "}
                  <span className="text-slate-200 font-semibold">{experiments.length}</span>
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

            {/* Roadmap card */}
            <div className="w-full md:w-[360px] rounded-3xl border border-slate-700 bg-slate-950 p-5">
              <div className="text-sm font-semibold">{roadmap.title}</div>
              <div className="mt-2 text-[11px] text-slate-400">
                Your growth plan, in human language.
              </div>

              <ol className="mt-3 space-y-2 text-sm text-slate-200">
                {roadmap.steps.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-400">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-3 text-[12px] text-slate-300">
                <span className="text-slate-200 font-semibold">Coach note:</span>{" "}
                {roadmap.mood}
              </div>

              <div className="mt-3 text-[11px] text-slate-500">
                Want ideas? Use <span className="text-slate-200 font-semibold">Brainstorm</span> for hooks/angles,
                then come back here to track what actually worked.
              </div>
            </div>
          </div>
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
                onClick={saveSuggestion}
                disabled={!hasSuggestion || saving}
                className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "⭐ Save to Growth Memory"}
              </button>

              <button
                onClick={openStartExperimentFromSuggestion}
                disabled={!hasSuggestion}
                className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-60"
              >
                🧪 Start experiment
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

        {/* Experiments board */}
        <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">🧭 Growth Roadmap Board</div>
              <div className="text-xs text-slate-400 mt-1">
                This replaces “campaign admin” with a calm workflow: plan → run → learn.
              </div>
            </div>

            <button
              onClick={() => {
                setStartTitle("New experiment");
                setStartHypothesis("");
                setStartPlatform("instagram");
                setStartPatternType("");
                setStartFormat("");
                setStartOpen(true);
              }}
              className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
            >
              + New experiment
            </button>
          </div>

          {experimentsLoading ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
              Loading experiments…
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {boardCols.map((col) => (
                <div key={col.key} className="rounded-3xl border border-slate-800 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{col.title}</div>
                    <div className="text-xs text-slate-400">{col.items.length}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{col.hint}</div>

                  <div className="mt-3 space-y-3">
                    {col.items.length === 0 ? (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
                        Nothing here yet.
                      </div>
                    ) : (
                      col.items.map((exp) => {
                        const totals = totalsForExperiment(exp);
                        const outs = Array.isArray(exp.growth_experiment_outcomes)
                          ? exp.growth_experiment_outcomes
                          : [];

                        const latestOutcome =
                          outs.length > 0
                            ? [...outs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0]
                            : null;

                        return (
                          <div
                            key={exp.id}
                            className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-100">
                                  {exp.title}
                                </div>
                                <div className="mt-1 text-[11px] text-slate-400">
                                  {platformLabel(exp.platform)}
                                  {exp.pattern_type ? ` · ${exp.pattern_type}` : ""}
                                  {exp.format ? ` · ${exp.format}` : ""}
                                </div>
                              </div>

                              <div
                                className={[
                                  "text-[11px] px-2 py-1 rounded-full border",
                                  badgeClassesForStatus(exp.status),
                                ].join(" ")}
                              >
                                {statusLabel(exp.status)}
                              </div>
                            </div>

                            {exp.hypothesis ? (
                              <div className="mt-3 text-[12px] text-slate-300 whitespace-pre-wrap">
                                {exp.hypothesis}
                              </div>
                            ) : null}

                            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                              <div>
                                <span className="text-slate-500">Started:</span>{" "}
                                {formatWhen(exp.started_at)}
                              </div>
                              <div>
                                <span className="text-slate-500">Completed:</span>{" "}
                                {formatWhen(exp.completed_at)}
                              </div>
                              <div>
                                <span className="text-slate-500">Results:</span>{" "}
                                <span className="text-slate-200 font-semibold">{totals.count}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Updated:</span>{" "}
                                {formatWhen(exp.updated_at)}
                              </div>
                            </div>

                            {latestOutcome ? (
                              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-[12px] text-slate-300">
                                <div className="text-slate-400 text-[11px]">Latest result</div>
                                <div className="mt-1">
                                  <span className="text-slate-200 font-semibold">{latestOutcome.metric_name}</span>
                                  {" — "}
                                  <span className="text-slate-100 font-semibold">
                                    {latestOutcome.metric_value ?? "—"}
                                  </span>
                                </div>
                              </div>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2">
                              {exp.status === "planned" ? (
                                <button
                                  onClick={() => setExperimentStatus(exp.id, "running")}
                                  className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                                >
                                  Start
                                </button>
                              ) : null}

                              {exp.status === "running" ? (
                                <>
                                  <button
                                    onClick={() => openOutcomeModal(exp)}
                                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-600"
                                  >
                                    + Add result
                                  </button>
                                  <button
                                    onClick={() => setExperimentStatus(exp.id, "completed")}
                                    className="rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-semibold text-slate-50 hover:bg-blue-400"
                                  >
                                    Complete
                                  </button>
                                </>
                              ) : null}

                              {exp.status === "completed" ? (
                                <button
                                  onClick={() => setExperimentStatus(exp.id, "running")}
                                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-600"
                                >
                                  Re-run
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
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
                    <div className="text-xs text-slate-400">
                      {p.performance_score != null ? `${p.performance_score}/100` : "—"} · saved{" "}
                      {new Date(p.created_at).toLocaleString()}
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

      {/* Start experiment modal */}
      {startOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeStart} />
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Growth Lab</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">Start an experiment</div>
                <div className="mt-1 text-[12px] text-slate-400">
                  You’re in control — edit the title/hypothesis before saving.
                </div>
              </div>

              <button
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                onClick={closeStart}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Title</label>
                <input
                  value={startTitle}
                  onChange={(e) => setStartTitle(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="e.g. Instagram: 3-step anxiety hook (video)"
                />
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Platform</label>
                  <input
                    value={startPlatform}
                    onChange={(e) => setStartPlatform(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="instagram"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Pattern</label>
                  <input
                    value={startPatternType}
                    onChange={(e) => setStartPatternType(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. hook_story_cta"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Format</label>
                  <input
                    value={startFormat}
                    onChange={(e) => setStartFormat(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="text / image / video"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Hypothesis (optional)</label>
                <textarea
                  value={startHypothesis}
                  onChange={(e) => setStartHypothesis(e.target.value)}
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="If I do X, I expect Y, because Z..."
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Tip: Keep it simple. You can always refine later.
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={createExperiment}
                  disabled={saving}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Create experiment"}
                </button>

                <button
                  type="button"
                  onClick={closeStart}
                  disabled={saving}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                This starts as <b>Planned</b>. You can move it to <b>Running</b> when you’re ready.
              </div>
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
                <div className="text-xs text-slate-400">Add result</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  {outcomeExperiment.title}
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  Add one number. Even tiny progress counts.
                </div>
              </div>

              <button
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                onClick={closeOutcomeModal}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Metric name</label>
                <input
                  value={metricName}
                  onChange={(e) => setMetricName(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="e.g. reach, comments, saves, clicks"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Metric value (number)</label>
                <input
                  value={metricValue}
                  onChange={(e) => setMetricValue(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="e.g. 12"
                  inputMode="numeric"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Don’t have it right now? Leave blank and come back later.
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={addOutcome}
                  disabled={outcomeSaving}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {outcomeSaving ? "Saving…" : "Save result"}
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

              <div className="text-[11px] text-slate-500">
                Quiet wins: one metric per day is enough to build a real playbook.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
