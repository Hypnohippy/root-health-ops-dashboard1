// app/dashboard/metrics/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tone = "good" | "warn" | "info";

type MetricsResponse = {
  ok: boolean;
  organisationId?: string;
  windowDays?: number;
  query?: string;
  from?: string | null;
  to?: string | null;
  error?: string;

  kpis?: {
    totalItems: number;
    repliesSent: number;
    postsQueued: number;
    postsPosted: number;
    postsFailed: number;
  };

  breakdowns?: {
    statusCounts: Record<string, number>;
    platformCounts: Record<string, number>;
  };

  charts?: {
    last7Days: { date: string; value: number }[];
  };

  topContent?: {
    id: string;
    status: string;
    platforms: string[];
    message_preview: string;
    created_at: string;
    imageUrl?: string;
    videoUrl?: string;
    campaignName?: string;
    contentType?: string;
    objective?: string;
  }[];

  campaignScoreboard?: {
    campaignName: string;
    objective?: string | null;
    posted: number;
    failed: number;
    queued: number;
    total: number;
    lastActivityAt?: string | null;
  }[];

  campaignInsights?: {
    campaignId: string;
    name: string;
    platform?: string | null;
    objective?: string | null;
    status?: string | null;

    variants: {
      variantId: string;
      ab_group: string | null;
      headline: string | null;
      primary_text_preview: string;
      media_url?: string | null;
      video_url?: string | null;

      latest?: {
        ctr?: number | null;
        cpl?: number | null;
        at?: string | null;
      };

      trend?: {
        ctrDelta?: number | null;
        cplDelta?: number | null;
      };

      coachNote: {
        tone: Tone;
        title: string;
        detail: string;
      };
      isWinner?: boolean;
    }[];

    coachSummary: {
      tone: Tone;
      title: string;
      detail: string;
    };
  }[];

  recommendations?: { title: string; detail: string; tone: Tone }[];
};

function pillClasses(tone: Tone) {
  if (tone === "good") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (tone === "warn") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-slate-500/40 bg-white/5 text-slate-200";
}

function statusPill(status: string) {
  const s = (status || "—").toLowerCase();
  if (s.includes("posted")) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (s.includes("failed") || s.includes("error")) return "border-red-500/40 bg-red-500/10 text-red-200";
  if (s.includes("to_post") || s.includes("queued") || s.includes("pending") || s.includes("scheduled"))
    return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (s.includes("sent")) return "border-indigo-500/40 bg-indigo-500/10 text-indigo-200";
  return "border-slate-500/40 bg-white/5 text-slate-200";
}

function niceDate(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function formatPct(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  if (n <= 1) return `${Math.round(n * 1000) / 10}%`;
  return `${Math.round(n * 10) / 10}%`;
}

function formatMoney(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `£${Math.round(n * 100) / 100}`;
}

function deltaBadge(label: string, d: number | null | undefined) {
  if (d === null || d === undefined) {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-slate-300">
        {label}: —
      </span>
    );
  }

  const up = d > 0;
  const down = d < 0;

  // NOTE: for CTR, "up" is good. for CPL, "down" is good.
  const isCtr = label.toLowerCase().includes("ctr");
  const good = isCtr ? up : down;

  const toneClass = good
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : "border-amber-500/40 bg-amber-500/10 text-amber-200";

  const arrow = up ? "▲" : down ? "▼" : "•";
  const valAbs = Math.abs(d);

  const pretty = isCtr ? formatPct(valAbs) : formatMoney(valAbs);

  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${toneClass}`}>
      {label}: {arrow} {pretty}
    </span>
  );
}

// ---- SIMPLE DONUT (SVG) ---------------------------------------------------
function Donut({
  items,
  size = 160,
  stroke = 18,
}: {
  items: { label: string; value: number }[];
  size?: number;
  stroke?: number;
}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const colors = ["#a78bfa", "#34d399", "#60a5fa", "#f472b6", "#f59e0b", "#38bdf8"];

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="drop-shadow">
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          <circle r={radius} fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          {items.map((item, idx) => {
            const fraction = item.value / total;
            const length = circumference * fraction;
            const dasharray = `${length} ${circumference - length}`;
            const dashoffset = -offset;
            offset += length;
            return (
              <circle
                key={idx}
                r={radius}
                fill="transparent"
                stroke={colors[idx % colors.length]}
                strokeWidth={stroke}
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
                transform="rotate(-90)"
                strokeLinecap="butt"
              />
            );
          })}
        </g>
      </svg>

      <div className="space-y-1">
        {items.length === 0 ? (
          <p className="text-sm text-slate-300">No platform data yet.</p>
        ) : (
          items.map((i, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: colors[idx % colors.length] }} />
              <span className="text-slate-200">{i.label}</span>
              <span className="text-slate-400">· {i.value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---- SIMPLE LINE (SVG) ----------------------------------------------------
function MiniLine({
  points,
  width = 420,
  height = 120,
}: {
  points: { date: string; value: number }[];
  width?: number;
  height?: number;
}) {
  const vals = points.map((p) => p.value);
  const max = Math.max(1, ...vals);
  const stepX = width / Math.max(1, points.length - 1);

  const toXY = (idx: number, v: number) => {
    const x = idx * stepX;
    const y = height - (v / max) * (height - 8) - 4;
    return `${x},${y}`;
  };

  const d = points.map((p, i) => toXY(i, p.value)).join(" ");

  return (
    <svg width={width} height={height} className="drop-shadow max-w-full">
      <polyline fill="none" stroke="rgba(99,102,241,0.9)" strokeWidth="3" points={d} />
      {points.map((p, i) => {
        const [x, y] = toXY(i, p.value).split(",").map(Number);
        return <circle key={i} cx={x} cy={y} r="3" fill="white" opacity={0.9} />;
      })}
    </svg>
  );
}

export default function MetricsPage() {
  const [loading, setLoading] = useState(false);
  const [json, setJson] = useState<MetricsResponse | null>(null);

  // ✅ History controls
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(""); // YYYY-MM-DD
  const [to, setTo] = useState(""); // YYYY-MM-DD
  const [windowDays, setWindowDays] = useState<number>(30);

  // ✅ Log Results modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCampaignId, setModalCampaignId] = useState<string | null>(null);
  const [modalCampaignName, setModalCampaignName] = useState<string | null>(null);
  const [modalVariantId, setModalVariantId] = useState<string | null>(null);
  const [modalVariantLabel, setModalVariantLabel] = useState<string | null>(null);

  const [ctr, setCtr] = useState("");
  const [cpl, setCpl] = useState("");
  const [spend, setSpend] = useState("");
  const [clicks, setClicks] = useState("");
  const [impressions, setImpressions] = useState("");
  const [leads, setLeads] = useState("");
  const [reportedAt, setReportedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function buildUrl() {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (windowDays) sp.set("windowDays", String(windowDays));
    const qs = sp.toString();
    return `/api/metrics${qs ? `?${qs}` : ""}`;
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(buildUrl(), { cache: "no-store" });
      const data: MetricsResponse = await res.json().catch(() => ({} as any));
      setJson(data);
    } catch (e: any) {
      setJson({ ok: false, error: e?.message || "Failed to load metrics" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openLogModal(args: { campaignId: string; campaignName: string; variantId: string; variantLabel: string }) {
    setSaveError(null);
    setModalCampaignId(args.campaignId);
    setModalCampaignName(args.campaignName);
    setModalVariantId(args.variantId);
    setModalVariantLabel(args.variantLabel);
    setCtr("");
    setCpl("");
    setSpend("");
    setClicks("");
    setImpressions("");
    setLeads("");
    setReportedAt("");
    setModalOpen(true);
  }

  function closeLogModal() {
    setModalOpen(false);
  }

  async function submitLog() {
    if (!modalCampaignId || !modalVariantId) return;

    setSaving(true);
    setSaveError(null);

    try {
      const payload: any = {
        campaignId: modalCampaignId,
        variantId: modalVariantId,
        source: "manual",
      };

      if (reportedAt) payload.reported_at = new Date(reportedAt).toISOString();

      const ctrN = ctr.trim() === "" ? null : Number(ctr);
      const cplN = cpl.trim() === "" ? null : Number(cpl);

      if (ctr.trim() !== "" && !Number.isFinite(ctrN)) throw new Error("CTR must be a number (e.g. 1.25)");
      if (cpl.trim() !== "" && !Number.isFinite(cplN)) throw new Error("CPL must be a number (e.g. 6.40)");

      payload.ctr = ctr.trim() === "" ? null : ctrN;
      payload.cpl = cpl.trim() === "" ? null : cplN;

      const spendN = spend.trim() === "" ? null : Number(spend);
      if (spend.trim() !== "" && !Number.isFinite(spendN)) throw new Error("Spend must be a number");

      const clicksN = clicks.trim() === "" ? null : Number(clicks);
      const impressionsN = impressions.trim() === "" ? null : Number(impressions);
      const leadsN = leads.trim() === "" ? null : Number(leads);

      if (clicks.trim() !== "" && (!Number.isFinite(clicksN) || clicksN < 0)) throw new Error("Clicks must be a whole number");
      if (impressions.trim() !== "" && (!Number.isFinite(impressionsN) || impressionsN < 0)) throw new Error("Impressions must be a whole number");
      if (leads.trim() !== "" && (!Number.isFinite(leadsN) || leadsN < 0)) throw new Error("Leads must be a whole number");

      payload.spend = spend.trim() === "" ? null : spendN;
      payload.clicks = clicks.trim() === "" ? null : Math.round(clicksN as number);
      payload.impressions = impressions.trim() === "" ? null : Math.round(impressionsN as number);
      payload.leads = leads.trim() === "" ? null : Math.round(leadsN as number);

      const res = await fetch("/api/campaigns/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const out = await res.json().catch(() => null);
      if (!res.ok || !out?.ok) throw new Error(out?.error || "Failed to log results");

      closeLogModal();
      await load();
    } catch (e: any) {
      setSaveError(e?.message || "Failed to log results");
    } finally {
      setSaving(false);
    }
  }

  const derived = useMemo(() => {
    const kpis = json?.kpis || {
      totalItems: 0,
      repliesSent: 0,
      postsQueued: 0,
      postsPosted: 0,
      postsFailed: 0,
    };

    const platformCounts = json?.breakdowns?.platformCounts || {};
    const donutData = Object.entries(platformCounts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const lineData = json?.charts?.last7Days || [];

    const statusCounts = json?.breakdowns?.statusCounts || {};
    const statusList = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

    const topContent = json?.topContent || [];
    const recs = json?.recommendations || [];
    const insights = json?.campaignInsights || [];

    return { kpis, donutData, lineData, statusList, topContent, recs, insights };
  }, [json]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-slate-50 p-6 space-y-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Metrics & KPIs</h1>
            <p className="text-slate-300 text-sm mt-1">
              Campaign coaching + performance signal. Powered by your Supabase data.
            </p>
            {json?.organisationId ? (
              <p className="text-[11px] text-slate-400 mt-1">
                Org: <span className="text-slate-200">{json.organisationId}</span>
                {typeof json.windowDays === "number" ? (
                  <> · Window: <span className="text-slate-200">{json.windowDays}d</span></>
                ) : null}
                {json?.query ? (
                  <> · Search: <span className="text-slate-200">“{json.query}”</span></>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <a href="/dashboard" className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10">
              ← Back to Dashboard
            </a>
            <button
              onClick={() => load()}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* ✅ History controls */}
        <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">History & Search</h3>
            <span className="text-[11px] text-slate-400">Filter what coaching is based on</span>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-[11px] text-slate-300">Search</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='Try: "stress", "linkedin", "Unassigned"'
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300">Window</span>
              <select
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-slate-100"
              >
                <option value={7}>7d</option>
                <option value={14}>14d</option>
                <option value={30}>30d</option>
                <option value={60}>60d</option>
                <option value={90}>90d</option>
              </select>
            </div>

            <button
              onClick={() => load()}
              className="px-3 py-1.5 rounded-lg bg-indigo-500/30 hover:bg-indigo-500/40 text-sm border border-indigo-400/30"
            >
              Apply filters
            </button>

            <button
              onClick={() => {
                setQ("");
                setFrom("");
                setTo("");
                setWindowDays(30);
                setTimeout(() => void load(), 0);
              }}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
            >
              Reset
            </button>

            <span className="text-[11px] text-slate-500">
              Tip: search works across post message + campaign_name + objective + content_type + platforms.
            </span>
          </div>
        </section>
      </header>

      {!json?.ok && json?.error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100">
          {json.error}
        </div>
      ) : null}

      {/* KPI tiles */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Total items</p>
          <p className="text-2xl font-semibold">{derived.kpis.totalItems}</p>
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Queued</p>
          <p className="text-2xl font-semibold">{derived.kpis.postsQueued}</p>
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Posted</p>
          <p className="text-2xl font-semibold">{derived.kpis.postsPosted}</p>
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Failed</p>
          <p className="text-2xl font-semibold">{derived.kpis.postsFailed}</p>
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Replies sent</p>
          <p className="text-2xl font-semibold">{derived.kpis.repliesSent}</p>
        </div>
      </section>

      {/* Recommendations */}
      <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Coach recommendations</h3>
          <span className="text-[11px] text-slate-400">Auto-generated from your data</span>
        </div>

        {derived.recs.length === 0 ? (
          <p className="text-sm text-slate-300">No recommendations yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {derived.recs.map((r, idx) => (
              <div key={idx} className={`rounded-2xl border p-4 ${pillClasses(r.tone)}`}>
                <div className="text-sm font-semibold">{r.title}</div>
                <div className="mt-1 text-[12px] text-slate-200/90">{r.detail}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ✅ Campaign Coach */}
      <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Campaign coach</h3>
            <p className="text-[11px] text-slate-400 mt-1">
              This is the “what worked, where, what to repeat” layer.
            </p>
          </div>
          <span className="text-[11px] text-slate-400">Top 10 campaigns</span>
        </div>

        {derived.insights.length === 0 ? (
          <p className="text-sm text-slate-300">
            No campaign insights yet. Create a campaign and save variants A/B/C.
          </p>
        ) : (
          <div className="space-y-4">
            {derived.insights.map((c) => (
              <div key={c.campaignId} className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{c.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                      {c.platform ? (
                        <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">{c.platform}</span>
                      ) : null}
                      {c.objective ? (
                        <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">{c.objective}</span>
                      ) : null}
                      {c.status ? (
                        <span className={`px-2 py-0.5 rounded-full border ${statusPill(c.status)}`}>{c.status}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className={`rounded-2xl border px-3 py-2 ${pillClasses(c.coachSummary.tone)} max-w-md`}>
                    <div className="text-[12px] font-semibold">{c.coachSummary.title}</div>
                    <div className="text-[11px] mt-1 text-slate-200/90">{c.coachSummary.detail}</div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {c.variants.map((v) => {
                    const variantLabel = `Variant ${v.ab_group || "—"}`;
                    return (
                      <div
                        key={v.variantId}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20">
                              {variantLabel}
                            </span>
                            {v.isWinner ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                                Winner
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openLogModal({
                                  campaignId: c.campaignId,
                                  campaignName: c.name,
                                  variantId: v.variantId,
                                  variantLabel,
                                })
                              }
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10"
                              title="Log CTR/CPL results for this variant"
                            >
                              Log results
                            </button>

                            <div className="text-[11px] text-slate-400">
                              {v.latest?.at ? niceDate(v.latest.at) : "—"}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[12px] font-semibold text-slate-100 line-clamp-2">
                            {v.headline || "No headline"}
                          </div>
                          <div className="text-[11px] text-slate-300 line-clamp-4">
                            {v.primary_text_preview || "(no text)"}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-slate-200">
                            CTR: <span className="text-slate-100">{formatPct(v.latest?.ctr ?? null)}</span>
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-slate-200">
                            CPL: <span className="text-slate-100">{formatMoney(v.latest?.cpl ?? null)}</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {deltaBadge("CTR Δ", v.trend?.ctrDelta ?? null)}
                          {deltaBadge("CPL Δ", v.trend?.cplDelta ?? null)}
                        </div>

                        <div className={`rounded-2xl border p-3 ${pillClasses(v.coachNote.tone)}`}>
                          <div className="text-[12px] font-semibold">{v.coachNote.title}</div>
                          <div className="text-[11px] mt-1 text-slate-200/90">{v.coachNote.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="text-[11px] text-slate-500">
                  Tip: log CTR/CPL once per variant and you’ll immediately get trend coaching.
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* charts row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-semibold mb-4">Items by platform</h3>
          <Donut items={derived.donutData} />
        </div>

        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-semibold mb-4">Activity — last 7 days</h3>
          <MiniLine points={derived.lineData} />
          <div className="mt-3 flex flex-wrap gap-3">
            {derived.lineData.map((p) => (
              <div key={p.date} className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10">
                {p.date}: <span className="text-slate-200">{p.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* status breakdown */}
      <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <h3 className="text-base font-semibold">Status breakdown</h3>
        <div className="flex flex-wrap gap-2">
          {derived.statusList.length === 0 ? (
            <p className="text-sm text-slate-300">No records yet.</p>
          ) : (
            derived.statusList.map(([k, v]) => (
              <div key={k} className="text-xs px-3 py-1 rounded-lg bg-white/5 border border-white/10">
                {k || "—"}: <span className="text-slate-100">{v}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Top posts */}
      <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Recent content</h3>
          <span className="text-[11px] text-slate-400">Most recent items in this view</span>
        </div>

        {derived.topContent.length === 0 ? (
          <p className="text-sm text-slate-300">No items found for these filters.</p>
        ) : (
          <div className="space-y-2">
            {derived.topContent.map((p) => (
              <div key={p.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100 line-clamp-2">
                    {p.message_preview || "(empty message)"}
                  </div>
                  <div className={`text-[11px] px-2 py-1 rounded-full border ${statusPill(p.status)}`}>
                    {p.status || "—"}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                    {p.platforms?.length ? p.platforms.join(", ") : "no platforms"}
                  </span>

                  {p.campaignName ? (
                    <>
                      <span className="text-slate-500">·</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                        Campaign: <span className="text-slate-100">{p.campaignName}</span>
                      </span>
                    </>
                  ) : null}

                  {p.objective ? (
                    <>
                      <span className="text-slate-500">·</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                        Objective: <span className="text-slate-100">{p.objective}</span>
                      </span>
                    </>
                  ) : null}

                  {p.contentType ? (
                    <>
                      <span className="text-slate-500">·</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                        Type: <span className="text-slate-100">{p.contentType}</span>
                      </span>
                    </>
                  ) : null}

                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400">{niceDate(p.created_at)}</span>
                </div>

                {(p.imageUrl || p.videoUrl) ? (
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    {p.videoUrl ? <>Video: <span className="text-slate-200">{p.videoUrl}</span></> : null}
                    {p.videoUrl && p.imageUrl ? <span className="text-slate-500"> · </span> : null}
                    {p.imageUrl ? <>Image: <span className="text-slate-200">{p.imageUrl}</span></> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ✅ Log Results Modal */}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeLogModal} />
          <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-xl p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Log Results</div>
                <div className="mt-1 text-[12px] text-slate-300">
                  {modalCampaignName || "Campaign"} · {modalVariantLabel || "Variant"}
                </div>
              </div>
              <button
                type="button"
                onClick={closeLogModal}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-100 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {saveError ? (
              <div className="mt-3 rounded-xl border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-100">
                {saveError}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">CTR (%)</label>
                <input
                  value={ctr}
                  onChange={(e) => setCtr(e.target.value)}
                  placeholder="e.g. 1.25"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">CPL (£)</label>
                <input
                  value={cpl}
                  onChange={(e) => setCpl(e.target.value)}
                  placeholder="e.g. 6.40"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Spend (£) (optional)</label>
                <input
                  value={spend}
                  onChange={(e) => setSpend(e.target.value)}
                  placeholder="e.g. 25"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Clicks (optional)</label>
                <input
                  value={clicks}
                  onChange={(e) => setClicks(e.target.value)}
                  placeholder="e.g. 40"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Impressions (optional)</label>
                <input
                  value={impressions}
                  onChange={(e) => setImpressions(e.target.value)}
                  placeholder="e.g. 2000"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Leads (optional)</label>
                <input
                  value={leads}
                  onChange={(e) => setLeads(e.target.value)}
                  placeholder="e.g. 3"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-[11px] text-slate-300">
                  Reported at (optional) <span className="text-slate-500">(leave blank = now)</span>
                </label>
                <input
                  type="datetime-local"
                  value={reportedAt}
                  onChange={(e) => setReportedAt(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-[11px] text-slate-500">Saved to your history — users never touch Supabase.</div>
              <button
                type="button"
                onClick={submitLog}
                disabled={saving}
                className="rounded-lg bg-indigo-500/30 hover:bg-indigo-500/40 border border-indigo-400/30 px-4 py-2 text-sm text-slate-50 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save result"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="text-[11px] text-slate-500">
        Next: we can auto-pull CTR/CPL from ad platforms later (Meta + LinkedIn APIs), but the UI logging path is the safe first step.
      </div>
    </div>
  );
}
