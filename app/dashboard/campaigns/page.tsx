"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

type SocialAccountsResponse = {
  success?: boolean;
  organisationId?: string;
  socialAccounts?: Array<{
    platform?: string;
    page_name?: string | null;
    page_id?: string | null;
    is_active?: boolean | null;
    token_expires_at?: string | null;
  }>;
  error?: string;
};

type Tab = "today" | "roadmap" | "memory";

const ROADMAP_KEY = "rootops_growthlab_roadmap_v1";
const ASSUMPTIONS_KEY = "rootops_growthlab_assumptions_v1";
const EXPERIMENTS_KEY = "rootops_growthlab_experiments_v1";

type RoadmapItem = {
  id: string;
  label: string;
  done: boolean;
};

type Assumptions = {
  postsPerWeek: number;
  avgReachPerPost: number;
  saveRatePct: number;
  dmRatePct: number;
  bookingRatePct: number;
};

type Experiment = {
  id: string;
  createdAt: number;
  platform: string;
  goal: string;
  format: "text" | "image" | "video";
  patternType: string;
  hookStyle: string;
  ctaStyle: string;
  notes: string;
  status: "planned" | "running" | "done";
  confidence?: number | null;
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
  if (k === "google") return "Google Business Profile";
  return p || "—";
}

function clampNum(n: any, fallback: number, min: number, max: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function pillTone(score?: number | null) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "border-slate-600 text-slate-300 bg-slate-900/40";
  if (n >= 80) return "border-emerald-500/50 text-emerald-200 bg-emerald-500/10";
  if (n >= 60) return "border-blue-500/50 text-blue-200 bg-blue-500/10";
  if (n >= 40) return "border-amber-500/50 text-amber-200 bg-amber-500/10";
  return "border-red-500/50 text-red-200 bg-red-500/10";
}

export default function CampaignsPage() {
  // We’re repurposing the old /campaigns route as “Growth Lab”
  const [tab, setTab] = useState<Tab>("today");

  const [loading, setLoading] = useState(true);
  const [patternsLoading, setPatternsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [suggestion, setSuggestion] = useState<Suggestion["suggestion"] | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);

  // Connections glance
  const [connLoading, setConnLoading] = useState(false);
  const [connections, setConnections] = useState<SocialAccountsResponse["socialAccounts"]>([]);
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  // Roadmap (local)
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const roadmapDone = useMemo(() => roadmap.filter((r) => r.done).length, [roadmap]);

  // Assumptions (local) for projections
  const [assumptions, setAssumptions] = useState<Assumptions>({
    postsPerWeek: 3,
    avgReachPerPost: 350,
    saveRatePct: 2.0,
    dmRatePct: 0.6,
    bookingRatePct: 0.15,
  });

  // Experiment builder
  const [exPlatform, setExPlatform] = useState<string>("instagram");
  const [exGoal, setExGoal] = useState<string>("More enquiries (DMs)");
  const [exFormat, setExFormat] = useState<"text" | "image" | "video">("video");
  const [exPatternType, setExPatternType] = useState<string>("micro_story");
  const [exHookStyle, setExHookStyle] = useState<string>("relatable opening");
  const [exCtaStyle, setExCtaStyle] = useState<string>("gentle question");
  const [exNotes, setExNotes] = useState<string>(
    "Keep it human. One key point. One clear next step."
  );
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  // Quick helpers
  const hasSuggestion = !!suggestion;
  const savedCount = useMemo(() => patterns.length, [patterns]);

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

  async function loadConnections() {
    setConnLoading(true);
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const json: SocialAccountsResponse = await res.json().catch(() => ({} as any));
      if (res.ok) {
        setOrganisationId(json?.organisationId ? String(json.organisationId) : null);
        setConnections(Array.isArray(json?.socialAccounts) ? json.socialAccounts : []);
      } else {
        setConnections([]);
      }
    } catch {
      setConnections([]);
    } finally {
      setConnLoading(false);
    }
  }

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
      await loadSuggestion();
    } catch (e: any) {
      setError(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // Init
  useEffect(() => {
    loadSuggestion();
    loadPatterns();
    loadConnections();

    // Roadmap default (saved locally)
    const defaultRoadmap: RoadmapItem[] = [
      { id: "r1", label: "Post 3 times this week (small and steady)", done: false },
      { id: "r2", label: "Save 1 pattern that worked (Growth Memory)", done: false },
      { id: "r3", label: "Run 1 experiment with a new hook style", done: false },
      { id: "r4", label: "Reply to every comment/DM for 20 minutes", done: false },
      { id: "r5", label: "Ask one gentle question (CTA) in a post", done: false },
    ];

    const savedRoadmap = loadJson<RoadmapItem[]>(ROADMAP_KEY, defaultRoadmap);
    setRoadmap(Array.isArray(savedRoadmap) && savedRoadmap.length ? savedRoadmap : defaultRoadmap);

    const savedAssumptions = loadJson<Assumptions>(ASSUMPTIONS_KEY, assumptions);
    setAssumptions({
      postsPerWeek: clampNum(savedAssumptions.postsPerWeek, 3, 0, 50),
      avgReachPerPost: clampNum(savedAssumptions.avgReachPerPost, 350, 0, 500000),
      saveRatePct: clampNum(savedAssumptions.saveRatePct, 2.0, 0, 100),
      dmRatePct: clampNum(savedAssumptions.dmRatePct, 0.6, 0, 100),
      bookingRatePct: clampNum(savedAssumptions.bookingRatePct, 0.15, 0, 100),
    });

    const savedExperiments = loadJson<Experiment[]>(EXPERIMENTS_KEY, []);
    setExperiments(Array.isArray(savedExperiments) ? savedExperiments : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toast timer
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Persist roadmap/assumptions/experiments
  useEffect(() => {
    if (!roadmap) return;
    saveJson(ROADMAP_KEY, roadmap);
  }, [roadmap]);

  useEffect(() => {
    saveJson(ASSUMPTIONS_KEY, assumptions);
  }, [assumptions]);

  useEffect(() => {
    saveJson(EXPERIMENTS_KEY, experiments);
  }, [experiments]);

  function toggleRoadmap(id: string) {
    setRoadmap((prev) => prev.map((r) => (r.id === id ? { ...r, done: !r.done } : r)));
  }

  // Projection math (simple but useful)
  const projection = useMemo(() => {
    const posts = clampNum(assumptions.postsPerWeek, 3, 0, 50);
    const reachPer = clampNum(assumptions.avgReachPerPost, 350, 0, 500000);
    const weeklyReach = posts * reachPer;

    const saveRate = clampNum(assumptions.saveRatePct, 2.0, 0, 100) / 100;
    const dmRate = clampNum(assumptions.dmRatePct, 0.6, 0, 100) / 100;
    const bookingRate = clampNum(assumptions.bookingRatePct, 0.15, 0, 100) / 100;

    const saves = Math.round(weeklyReach * saveRate);
    const dms = Math.round(weeklyReach * dmRate);
    const bookings = Math.round(weeklyReach * bookingRate);

    return {
      posts,
      weeklyReach,
      saves,
      dms,
      bookings,
    };
  }, [assumptions]);

  function buildExperimentFromSuggestion() {
    if (!suggestion) return;

    setExPlatform(String(suggestion.platform || "instagram"));
    setExFormat((suggestion.format as any) || "text");
    setExPatternType(String(suggestion.pattern_type || "micro_story"));
    setExHookStyle(String(suggestion.hook_style || "relatable opening"));
    setExCtaStyle(String(suggestion.cta_style || "gentle question"));
    setExNotes(String(suggestion.notes || "").trim() || "Try it once. Keep it gentle. Save what works.");
    setToast("Loaded suggestion into the Experiment Builder ✅");
    setTab("roadmap");
  }

  function addExperiment() {
    const exp: Experiment = {
      id: uid(),
      createdAt: Date.now(),
      platform: String(exPlatform || "instagram"),
      goal: String(exGoal || "More enquiries (DMs)"),
      format: exFormat,
      patternType: String(exPatternType || "micro_story"),
      hookStyle: String(exHookStyle || "relatable opening"),
      ctaStyle: String(exCtaStyle || "gentle question"),
      notes: String(exNotes || "").trim(),
      status: "planned",
      confidence: suggestion?.performance_score ?? null,
    };

    setExperiments((prev) => [exp, ...prev].slice(0, 50));
    setToast("Experiment added. You’re basically a scientist now. 🧪");
  }

  function setExperimentStatus(id: string, status: Experiment["status"]) {
    setExperiments((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  }

  function deleteExperiment(id: string) {
    setExperiments((prev) => prev.filter((e) => e.id !== id));
  }

  const connectedPlatforms = useMemo(() => {
    const rows = Array.isArray(connections) ? connections : [];
    const active = rows.filter((r) => r && r.is_active !== false);
    return active.map((r) => String(r.platform || "").toLowerCase()).filter(Boolean);
  }, [connections]);

  const connectedCount = connectedPlatforms.length;

  const quickBlastPrefill = useMemo(() => {
    // Lightweight prefill text based on suggestion OR experiment builder
    const p = suggestion?.platform ? platformLabel(suggestion.platform) : platformLabel(exPlatform);
    const hook = nice(suggestion?.hook_style || exHookStyle);
    const cta = nice(suggestion?.cta_style || exCtaStyle);

    const text = [
      `Trying a gentle experiment today on ${p}.`,
      ``,
      `Hook style: ${hook}`,
      `CTA style: ${cta}`,
      ``,
      `Keep it simple: one point, one next step.`,
    ].join("\n");

    return encodeURIComponent(text);
  }, [suggestion, exHookStyle, exCtaStyle, exPlatform]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Root Health Ops</div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold">
                🧪 Growth Lab{" "}
                <span className="text-slate-400">— your gentle growth buddy</span>
              </h1>

              <p className="mt-3 text-sm text-slate-300 max-w-3xl">
                Growth Lab helps you build momentum without the admin headache. It suggests a next move, lets
                you plan experiments (you stay in control), and saves what works — so you can grow without
                feeling like a one-person circus.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    loadSuggestion();
                    loadPatterns();
                    loadConnections();
                  }}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
                >
                  Refresh
                </button>

                <Link
                  href={`/dashboard?prefill=${quickBlastPrefill}`}
                  className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                  title="Go to Quick Blast with a gentle experiment prefill"
                >
                  Send to Quick Blast
                </Link>

                <Link
                  href={`/dashboard/brainstorm?prompt=${quickBlastPrefill}`}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
                  title="Open Brainstorm with a prefilled prompt (if your Brainstorm page reads query params)"
                >
                  Send to Brainstorm
                </Link>

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

            {/* Connection glance */}
            <div className="rounded-3xl border border-slate-700 bg-slate-950/60 p-5 w-full md:w-[360px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Connection glance</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Quick check only (not a full token audit yet).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadConnections}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-200 hover:border-slate-600"
                >
                  {connLoading ? "Checking…" : "Check"}
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-slate-400">Connected</div>
                <div className="text-lg font-semibold text-slate-100">
                  {connLoading ? "…" : connectedCount}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {connLoading ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
                    Loading connections…
                  </div>
                ) : connections && connections.length > 0 ? (
                  connections
                    .slice(0, 6)
                    .map((c, idx) => {
                      const p = String(c?.platform || "—");
                      const active = c?.is_active !== false;
                      return (
                        <div
                          key={`${p}-${idx}`}
                          className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-2"
                        >
                          <div className="text-sm text-slate-200">
                            {platformLabel(p)}
                            {c?.page_name ? (
                              <span className="text-[11px] text-slate-400">
                                {" "}
                                · {c.page_name}
                              </span>
                            ) : null}
                          </div>
                          <div
                            className={[
                              "text-[11px] rounded-full border px-2 py-0.5",
                              active
                                ? "border-emerald-500/50 text-emerald-200 bg-emerald-500/10"
                                : "border-slate-700 text-slate-300 bg-slate-900/40",
                            ].join(" ")}
                          >
                            {active ? "Active" : "Inactive"}
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
                    No connections found yet. Head to <b>Connect</b> when you’re ready.
                  </div>
                )}
              </div>

              {organisationId ? (
                <div className="mt-3 text-[11px] text-slate-500 break-all">
                  Org: {organisationId}
                </div>
              ) : (
                <div className="mt-3 text-[11px] text-slate-500">
                  Org: (not loaded)
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex flex-wrap gap-2">
            {(["today", "roadmap", "memory"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={[
                  "rounded-full border px-4 py-2 text-sm transition",
                  tab === t
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600",
                ].join(" ")}
              >
                {t === "today" ? "Today" : t === "roadmap" ? "Roadmap" : "Growth Memory"}
              </button>
            ))}
          </div>
        </div>

        {/* TAB: TODAY */}
        {tab === "today" ? (
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
                  onClick={buildExperimentFromSuggestion}
                  disabled={!hasSuggestion}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                  title="Load this suggestion into the Experiment Builder"
                >
                  Use as experiment
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
                <div className="mt-2 text-[12px] text-slate-400">
                  (Yes, Growth Lab is shy at first. Like a cat. 🐈)
                </div>
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
                    <div className="mt-2 inline-flex items-center gap-2">
                      <span
                        className={[
                          "text-[11px] rounded-full border px-2 py-0.5",
                          pillTone(suggestion.performance_score),
                        ].join(" ")}
                      >
                        {Number.isFinite(suggestion.performance_score)
                          ? `${suggestion.performance_score}/100`
                          : "—"}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        (Not a verdict. Just a compass.)
                      </span>
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

            {/* Micro “next step” */}
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-sm font-semibold">A tiny next step</div>
              <div className="mt-2 text-sm text-slate-300">
                Choose one: <b>Save it</b>, <b>run it as an experiment</b>, or <b>skip it</b>.
                Growth isn’t a punishment schedule. 🙂
              </div>
            </div>
          </div>
        ) : null}

        {/* TAB: ROADMAP */}
        {tab === "roadmap" ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Roadmap checklist */}
            <div className="lg:col-span-1 rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Your calm growth roadmap</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Small steps. Repeatable. No hustle theatre.
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div className="text-slate-200 font-semibold">
                    {roadmapDone}/{roadmap.length}
                  </div>
                  <div>done</div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {roadmap.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRoadmap(r.id)}
                    className={[
                      "w-full text-left rounded-2xl border px-4 py-3 transition",
                      r.done
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm text-slate-100">{r.label}</div>
                      <div
                        className={[
                          "text-[11px] rounded-full border px-2 py-0.5",
                          r.done
                            ? "border-emerald-500/50 text-emerald-200 bg-emerald-500/10"
                            : "border-slate-700 text-slate-300 bg-slate-900/40",
                        ].join(" ")}
                      >
                        {r.done ? "Done" : "Do"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-4 text-[11px] text-slate-500">
                This checklist saves on this device. (We can sync to Supabase later.)
              </div>
            </div>

            {/* Experiment builder + projections */}
            <div className="lg:col-span-2 space-y-6">
              {/* Experiment builder */}
              <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Experiment builder</div>
                    <div className="text-xs text-slate-400 mt-1">
                      You stay in control. Growth Lab just helps you think clearly.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addExperiment}
                    className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    Add experiment
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Platform
                    </label>
                    <select
                      value={exPlatform}
                      onChange={(e) => setExPlatform(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="threads">Threads</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="tiktok">TikTok</option>
                    </select>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Connected:{" "}
                      <span className="text-slate-300">
                        {connectedPlatforms.includes(String(exPlatform).toLowerCase())
                          ? "✅ yes"
                          : "— not connected"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Goal (what do you want?)
                    </label>
                    <input
                      value={exGoal}
                      onChange={(e) => setExGoal(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      placeholder="e.g. More DMs, More comments, More profile visits"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Format
                    </label>
                    <select
                      value={exFormat}
                      onChange={(e) => setExFormat(e.target.value as any)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Pattern type
                    </label>
                    <input
                      value={exPatternType}
                      onChange={(e) => setExPatternType(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      placeholder="e.g. micro_story, myth_bust, 3_steps"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Hook style
                    </label>
                    <input
                      value={exHookStyle}
                      onChange={(e) => setExHookStyle(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      placeholder="e.g. relatable opening, contrarian truth"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      CTA style
                    </label>
                    <input
                      value={exCtaStyle}
                      onChange={(e) => setExCtaStyle(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      placeholder="e.g. gentle question, invite to DM"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-300">
                    Notes (how you’ll run it)
                  </label>
                  <textarea
                    value={exNotes}
                    onChange={(e) => setExNotes(e.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="Keep it calm. Keep it clear. What will you do?"
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Pro tip: the best experiment is the one you actually post. 🙂
                  </div>
                </div>

                {experiments.length > 0 ? (
                  <div className="mt-5">
                    <div className="text-sm font-semibold">Your experiments</div>
                    <div className="mt-3 space-y-3">
                      {experiments.map((e) => (
                        <div
                          key={e.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                        >
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div className="text-sm text-slate-100 font-semibold">
                              {platformLabel(e.platform)} · {e.format} · {e.patternType}
                            </div>
                            <div className="text-xs text-slate-400">
                              {new Date(e.createdAt).toLocaleString()}
                            </div>
                          </div>

                          <div className="mt-2 text-sm text-slate-200">
                            <span className="text-slate-400">Goal:</span> {e.goal}
                          </div>

                          <div className="mt-2 grid md:grid-cols-2 gap-2 text-xs text-slate-300">
                            <div>
                              <span className="text-slate-400">Hook:</span>{" "}
                              {nice(e.hookStyle)}
                            </div>
                            <div>
                              <span className="text-slate-400">CTA:</span>{" "}
                              {nice(e.ctaStyle)}
                            </div>
                          </div>

                          {e.notes ? (
                            <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">
                              {e.notes}
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div
                              className={[
                                "text-[11px] rounded-full border px-2 py-0.5",
                                e.status === "planned"
                                  ? "border-slate-700 text-slate-300 bg-slate-900/40"
                                  : e.status === "running"
                                  ? "border-blue-500/50 text-blue-200 bg-blue-500/10"
                                  : "border-emerald-500/50 text-emerald-200 bg-emerald-500/10",
                              ].join(" ")}
                            >
                              {e.status === "planned"
                                ? "Planned"
                                : e.status === "running"
                                ? "Running"
                                : "Done"}
                            </div>

                            <button
                              type="button"
                              onClick={() => setExperimentStatus(e.id, "planned")}
                              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-600"
                            >
                              Plan
                            </button>
                            <button
                              type="button"
                              onClick={() => setExperimentStatus(e.id, "running")}
                              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-600"
                            >
                              Run
                            </button>
                            <button
                              type="button"
                              onClick={() => setExperimentStatus(e.id, "done")}
                              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-600"
                            >
                              Done
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteExperiment(e.id)}
                              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-red-500 hover:text-red-200"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 text-[11px] text-slate-500">
                      Experiments are saved locally for now. (Later we’ll sync + attach outcomes.)
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
                    No experiments yet. Add one above and run it once. That’s it.
                  </div>
                )}
              </div>

              {/* Projections */}
              <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Gentle projections</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Not promises. Just a simple “if you do this, you might get this” map.
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                    <div className="text-xs text-slate-400">Assumptions</div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400">
                          Posts / week
                        </label>
                        <input
                          value={assumptions.postsPerWeek}
                          onChange={(e) =>
                            setAssumptions((p) => ({
                              ...p,
                              postsPerWeek: clampNum(e.target.value, 3, 0, 50),
                            }))
                          }
                          className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400">
                          Avg reach / post
                        </label>
                        <input
                          value={assumptions.avgReachPerPost}
                          onChange={(e) =>
                            setAssumptions((p) => ({
                              ...p,
                              avgReachPerPost: clampNum(e.target.value, 350, 0, 500000),
                            }))
                          }
                          className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400">
                          Save rate %
                        </label>
                        <input
                          value={assumptions.saveRatePct}
                          onChange={(e) =>
                            setAssumptions((p) => ({
                              ...p,
                              saveRatePct: clampNum(e.target.value, 2.0, 0, 100),
                            }))
                          }
                          className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400">
                          DM rate %
                        </label>
                        <input
                          value={assumptions.dmRatePct}
                          onChange={(e) =>
                            setAssumptions((p) => ({
                              ...p,
                              dmRatePct: clampNum(e.target.value, 0.6, 0, 100),
                            }))
                          }
                          className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400">
                          Booking rate %
                        </label>
                        <input
                          value={assumptions.bookingRatePct}
                          onChange={(e) =>
                            setAssumptions((p) => ({
                              ...p,
                              bookingRatePct: clampNum(e.target.value, 0.15, 0, 100),
                            }))
                          }
                          className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="mt-3 text-[11px] text-slate-500">
                      These save on this device. Adjust them until they feel realistic for your clinic.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                    <div className="text-xs text-slate-400">Weekly projection</div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-200">Reach</div>
                        <div className="text-sm font-semibold text-slate-100">
                          {projection.weeklyReach.toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-200">Saves</div>
                        <div className="text-sm font-semibold text-slate-100">
                          {projection.saves.toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-200">DMs</div>
                        <div className="text-sm font-semibold text-slate-100">
                          {projection.dms.toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-200">Bookings</div>
                        <div className="text-sm font-semibold text-slate-100">
                          {projection.bookings.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-[12px] text-slate-300">
                      If you post <b>{projection.posts}</b> times/week and average{" "}
                      <b>{assumptions.avgReachPerPost}</b> reach per post, this is a sensible “ballpark”.
                      <div className="mt-1 text-[11px] text-slate-500">
                        Growth Lab promise: no false certainty. Just direction.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* TAB: MEMORY */}
        {tab === "memory" ? (
          <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">🗂 Your Growth Memory</div>
                <div className="text-xs text-slate-400 mt-1">
                  Saved patterns you can revisit anytime. (This becomes your playbook.)
                </div>
              </div>
              <button
                onClick={loadPatterns}
                className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              >
                Refresh
              </button>
            </div>

            {patternsLoading ? (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
                Loading saved patterns…
              </div>
            ) : patterns.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300">
                Nothing saved yet. Save your first pattern from “Today” ⭐
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

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard?prefill=${encodeURIComponent(
                          `Trying a saved Growth Memory pattern:\n\nPlatform: ${platformLabel(
                            p.platform
                          )}\nPattern: ${p.pattern_type}\nFormat: ${p.format}\nHook: ${nice(
                            p.hook_style
                          )}\nCTA: ${nice(p.cta_style)}\n\nNotes:\n${nice(p.notes)}`
                        )}`}
                        className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                        title="Open Quick Blast with a prefilled template based on this saved pattern"
                      >
                        Use in Quick Blast
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setExPlatform(String(p.platform || "instagram"));
                          setExFormat((p.format as any) || "text");
                          setExPatternType(String(p.pattern_type || "micro_story"));
                          setExHookStyle(String(p.hook_style || "relatable opening"));
                          setExCtaStyle(String(p.cta_style || "gentle question"));
                          setExNotes(String(p.notes || "").trim() || "Try it once. Save the outcome.");
                          setTab("roadmap");
                          setToast("Loaded saved pattern into the Experiment Builder ✅");
                        }}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-600"
                      >
                        Load as experiment
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 text-xs text-slate-500 text-center">
              Growth Lab isn’t here to judge you. It’s here to help you keep going. One kind step at a time.
            </div>
          </div>
        ) : null}

        {/* gentle footer */}
        <div className="text-xs text-slate-500 text-center">
          If today feels hard: one small post is still a win. (Yes, even the messy one.)
        </div>
      </div>
    </div>
  );
}
