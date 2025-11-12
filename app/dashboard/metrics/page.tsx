"use client";

import { useEffect, useMemo, useState } from "react";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields?: Record<string, any>;
  [key: string]: any;
};

function getField(row: AirtableRecord, key: string) {
  return (row.fields?.[key] ?? (row as any)[key]) as any;
}

function toDateStr(d: Date) {
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

export default function MetricsPage() {
  const [data, setData] = useState<AirtableRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/replies", { cache: "no-store" });
      const json = await res.json();
      setData(json.records || []);
      setLoading(false);
    })();
  }, []);

  // ---- DERIVED METRICS ------------------------------------------------------
  const derived = useMemo(() => {
    const rows = data;

    const statusCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};
    const byDay: Record<string, number> = {};

    let repliesSent = 0;
    let postsQueued = 0;
    let postsPosted = 0;

    // Build a 7-day window
    const today = new Date();
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(toDateStr(d));
      byDay[toDateStr(d)] = 0;
    }

    for (const row of rows) {
      const f = row.fields ?? (row as any);
      const status = (f["status"] || "").toString();
      const platform = (f["Platform"] || "").toString();

      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if (platform) platformCounts[platform] = (platformCounts[platform] || 0) + 1;

      if (status === "sent") repliesSent++;
      if (status === "to_post") postsQueued++;
      if (status === "posted") postsPosted++;

      // choose date
      const created =
        f["created at"] ||
        row.createdTime ||
        null;
      if (created) {
        const d = new Date(created);
        const key = toDateStr(d);
        if (key in byDay) byDay[key] += 1;
      }
    }

    const total = rows.length;
    const donutData = Object.entries(platformCounts).map(([label, value]) => ({ label, value }));
    const lineData = Object.entries(byDay).map(([date, value]) => ({ date, value }));

    return {
      total,
      repliesSent,
      postsQueued,
      postsPosted,
      donutData,
      lineData,
      statusCounts,
      platformCounts,
    };
  }, [data]);

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
    const colors = [
      "#a78bfa", // violet-400
      "#34d399", // emerald-400
      "#60a5fa", // blue-400
      "#f472b6", // pink-400
      "#f59e0b", // amber-500
      "#38bdf8", // sky-400
    ];

    return (
      <div className="flex items-center gap-4">
        <svg width={size} height={size} className="drop-shadow">
          <g transform={`translate(${size / 2}, ${size / 2})`}>
            {/* track */}
            <circle
              r={radius}
              fill="transparent"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={stroke}
            />
            {/* arcs */}
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
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{
                    backgroundColor: [
                      "#a78bfa",
                      "#34d399",
                      "#60a5fa",
                      "#f472b6",
                      "#f59e0b",
                      "#38bdf8",
                    ][idx % 6],
                  }}
                />
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
    width = 360,
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
      <svg width={width} height={height} className="drop-shadow">
        <polyline
          fill="none"
          stroke="rgba(99,102,241,0.9)" // indigo-500-ish
          strokeWidth="3"
          points={d}
        />
        {/* dots */}
        {points.map((p, i) => {
          const [x, y] = toXY(i, p.value).split(",").map(Number);
          return (
            <circle key={i} cx={x} cy={y} r="3" fill="white" opacity={0.9} />
          );
        })}
      </svg>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-slate-50 p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Metrics & KPIs</h1>
          <p className="text-slate-300 text-sm mt-1">
            A quick read on visibility, output, and progress. Powered by your existing data.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/dashboard"
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
          >
            ← Back to Dashboard
          </a>
          <button
            onClick={() => location.reload()}
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* KPI tiles */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Total items</p>
          <p className="text-2xl font-semibold">{derived.total}</p>
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Replies sent</p>
          <p className="text-2xl font-semibold">{derived.repliesSent}</p>
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Posts queued</p>
          <p className="text-2xl font-semibold">{derived.postsQueued}</p>
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Posts posted</p>
          <p className="text-2xl font-semibold">{derived.postsPosted}</p>
        </div>
      </section>

      {/* charts row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-semibold mb-4">Engagement by platform</h3>
          <Donut items={derived.donutData} />
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-semibold mb-4">Activity — last 7 days</h3>
          <MiniLine points={derived.lineData} />
          <div className="mt-3 flex flex-wrap gap-3">
            {derived.lineData.map((p) => (
              <div
                key={p.date}
                className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10"
              >
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
          {Object.entries(derived.statusCounts).length === 0 ? (
            <p className="text-sm text-slate-300">No records yet.</p>
          ) : (
            Object.entries(derived.statusCounts).map(([k, v]) => (
              <div
                key={k}
                className="text-xs px-3 py-1 rounded-lg bg-white/5 border border-white/10"
              >
                {k || "—"}: <span className="text-slate-100">{v}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {loading && <p className="text-slate-300">Loading…</p>}
    </div>
  );
}
