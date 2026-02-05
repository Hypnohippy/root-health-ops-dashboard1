// app/dashboard/metrics/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type MetricsResponse = {
  ok: boolean;
  organisationId?: string;
  windowDays?: number;
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
  }[];

  recommendations?: { title: string; detail: string; tone: "good" | "warn" | "info" }[];
};

function pillClasses(tone: "good" | "warn" | "info") {
  if (tone === "good") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (tone === "warn") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-slate-500/40 bg-white/5 text-slate-200";
}

function statusPill(status: string) {
  const s = (status || "—").toLowerCase();
  if (s.includes("posted")) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (s.includes("failed") || s.includes("error")) return "border-red-500/40 bg-red-500/10 text-red-200";
  if (s.includes("to_post") || s.includes("queued") || s.includes("pending")) return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (s.includes("sent")) return "border-indigo-500/40 bg-indigo-500/10 text-indigo-200";
  return "border-slate-500/40 bg-white/5 text-slate-200";
}

function niceDate(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString();
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

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
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
  }, []);

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

    return { kpis, donutData, lineData, statusList, topContent, recs };
  }, [json]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-slate-50 p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Metrics & KPIs</h1>
          <p className="text-slate-300 text-sm mt-1">
            Clean analytics, real signal. Powered by your Supabase data.
          </p>
          {json?.organisationId ? (
            <p className="text-[11px] text-slate-400 mt-1">
              Org: <span className="text-slate-200">{json.organisationId}</span>
              {typeof json.windowDays === "number" ? (
                <> · Window: <span className="text-slate-200">{json.windowDays}d</span></>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <a
            href="/dashboard"
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
          >
            ← Back to Dashboard
          </a>
          <button
            onClick={load}
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
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
          <h3 className="text-base font-semibold">Recommendations</h3>
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
        {derived.statusList.length > 0 && (json?.breakdowns?.statusCounts?.to_post ?? 0) > 0 && (json?.breakdowns?.statusCounts?.posted ?? 0) === 0 ? (
          <p className="text-[11px] text-slate-400">
            Note: “posted/failed” becomes accurate once your posting routes write to <span className="text-slate-200 font-semibold">post_events</span>.
          </p>
        ) : null}
      </section>

      {/* Top posts */}
      <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Top content</h3>
          <span className="text-[11px] text-slate-400">Most recent scheduled items</span>
        </div>

        {derived.topContent.length === 0 ? (
          <p className="text-sm text-slate-300">No scheduled posts found yet.</p>
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

      <div className="text-[11px] text-slate-500">
        Tip: This page is already “real data”. Next upgrade is logging each publish attempt into <span className="text-slate-200 font-semibold">post_events</span>.
      </div>
    </div>
  );
}
