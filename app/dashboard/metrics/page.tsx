"use client";

import { useEffect, useMemo, useState } from "react";

type ApiMetrics = {
  ok: boolean;
  organisationId?: string;
  windowDays?: number;

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
    failuresByPlatform: Record<string, number>;
  };

  charts?: {
    last7Days: { date: string; value: number }[];
  };

  topContent?: Array<{
    id: string;
    status: string;
    created_at?: string;
    scheduled_at?: string;
    message_preview: string;
    platforms: string[];
    imageUrl?: string;
    videoUrl?: string;
  }>;

  recommendations?: Array<{
    title: string;
    detail: string;
    tone?: "good" | "warn" | "info";
  }>;

  error?: string;
  hint?: string;
};

function niceDate(dt?: string) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function toPct(n: number) {
  if (!isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clampText(t: string, n: number) {
  const s = String(t || "");
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

/** Minimal donut (SVG) */
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
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: colors[idx % colors.length] }}
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

/** Mini line (SVG) */
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
    return { x, y };
  };

  const d = points
    .map((p, i) => {
      const { x, y } = toXY(i, p.value);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="drop-shadow">
      <polyline fill="none" stroke="rgba(99,102,241,0.9)" strokeWidth="3" points={d} />
      {points.map((p, i) => {
        const { x, y } = toXY(i, p.value);
        return <circle key={i} cx={x} cy={y} r="3" fill="white" opacity={0.9} />;
      })}
    </svg>
  );
}

export default function MetricsPage() {
  const [loading, setLoading] = useState(false);
  const [json, setJson] = useState<ApiMetrics | null>(null);

  // Filters (simple but powerful)
  const [days, setDays] = useState<number>(90);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/metrics?days=${encodeURIComponent(String(days))}`, {
        cache: "no-store",
      });
      const data: ApiMetrics = await res.json().catch(() => null as any);
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
  }, [days]);

  const kpis = json?.kpis || {
    totalItems: 0,
    repliesSent: 0,
    postsQueued: 0,
    postsPosted: 0,
    postsFailed: 0,
  };

  const breakdowns = json?.breakdowns || {
    statusCounts: {},
    platformCounts: {},
    failuresByPlatform: {},
  };

  const last7 = json?.charts?.last7Days || [];

  const donutData = useMemo(() => {
    const entries = Object.entries(breakdowns.platformCounts || {});
    // prettify labels, stable order
    const cleaned = entries
      .map(([label, value]) => ({ label, value: Number(value || 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    return cleaned;
  }, [breakdowns.platformCounts]);

  const statusPills = useMemo(() => {
    const entries = Object.entries(breakdowns.statusCounts || {}).map(([k, v]) => ({
      key: k || "—",
      value: Number(v || 0),
    }));
    return entries.sort((a, b) => b.value - a.value);
  }, [breakdowns.statusCounts]);

  const platformOptions = useMemo(() => {
    const keys = Object.keys(breakdowns.platformCounts || {});
    keys.sort();
    return keys;
  }, [breakdowns.platformCounts]);

  const statusOptions = useMemo(() => {
    const keys = Object.keys(breakdowns.statusCounts || {});
    keys.sort();
    return keys;
  }, [breakdowns.statusCounts]);

  const throughput = useMemo(() => {
    const posted = kpis.postsPosted || 0;
    const total = kpis.totalItems || 0;
    if (total === 0) return 0;
    return posted / total;
  }, [kpis.postsPosted, kpis.totalItems]);

  const filteredTop = useMemo(() => {
    const items = Array.isArray(json?.topContent) ? json!.topContent! : [];
    return items.filter((it) => {
      const pOk = platformFilter === "all" ? true : (it.platforms || []).includes(platformFilter);
      const sOk = statusFilter === "all" ? true : String(it.status || "") === statusFilter;
      return pOk && sOk;
    });
  }, [json?.topContent, platformFilter, statusFilter]);

  const reliabilityScore = useMemo(() => {
    const total = kpis.totalItems || 0;
    const failed = kpis.postsFailed || 0;
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, 1 - failed / total));
  }, [kpis.totalItems, kpis.postsFailed]);

  const reliabilityLabel = useMemo(() => {
    const r = reliabilityScore;
    if (r >= 0.95) return "Excellent";
    if (r >= 0.85) return "Strong";
    if (r >= 0.7) return "Needs attention";
    return "At risk";
  }, [reliabilityScore]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-slate-50 p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Metrics & KPIs</h1>
          <p className="text-slate-300 text-sm mt-1">
            Hardwired analytics from Supabase (starting with <span className="text-slate-100 font-semibold">scheduled_posts</span>).
          </p>
          {json?.windowDays ? (
            <p className="text-[11px] text-slate-400 mt-1">
              Window: last {json.windowDays} days · Org:{" "}
              <span className="text-slate-200">{json.organisationId || "—"}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <a
            href="/dashboard"
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
          >
            ← Back to Dashboard
          </a>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
            <span className="text-[11px] text-slate-300">Window</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-transparent text-sm outline-none"
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>

          <button
            onClick={load}
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* Error state */}
      {json && !json.ok ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
          <div className="font-semibold">Metrics failed to load</div>
          <div className="mt-1">{json.error || "Unknown error"}</div>
          {json.hint ? <div className="mt-2 text-[12px] text-red-100/80">{json.hint}</div> : null}
        </div>
      ) : null}

      {/* KPI tiles */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Total items</p>
          <p className="text-2xl font-semibold">{kpis.totalItems}</p>
          <p className="text-[11px] text-slate-400 mt-1">From scheduled_posts</p>
        </div>

        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Posts queued</p>
          <p className="text-2xl font-semibold">{kpis.postsQueued}</p>
          <p className="text-[11px] text-slate-400 mt-1">Pending/to_post/scheduled</p>
        </div>

        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Posts posted</p>
          <p className="text-2xl font-semibold">{kpis.postsPosted}</p>
          <p className="text-[11px] text-slate-400 mt-1">posted/published</p>
        </div>

        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Failures</p>
          <p className="text-2xl font-semibold">{kpis.postsFailed}</p>
          <p className="text-[11px] text-slate-400 mt-1">fail/error statuses</p>
        </div>

        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Reliability</p>
          <p className="text-2xl font-semibold">{toPct(reliabilityScore)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{reliabilityLabel}</p>
        </div>
      </section>

      {/* Recommendations */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold">Executive summary</h3>
            <div className="text-[11px] text-slate-400">
              Throughput: <span className="text-slate-200 font-semibold">{toPct(throughput)}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(json?.recommendations || []).length === 0 ? (
              <div className="text-sm text-slate-300">No recommendations yet.</div>
            ) : (
              (json?.recommendations || []).slice(0, 4).map((r, idx) => (
                <div
                  key={idx}
                  className={classNames(
                    "rounded-2xl border p-4",
                    r.tone === "good"
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : r.tone === "warn"
                      ? "border-amber-500/30 bg-amber-500/10"
                      : "border-white/10 bg-white/5"
                  )}
                >
                  <div className="text-sm font-semibold text-slate-100">{r.title}</div>
                  <div className="mt-1 text-[12px] text-slate-200/90">{r.detail}</div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 text-[11px] text-slate-400">
            Next step: we can log per-platform events (postedId, errors, engagement) to make this *true analytics*.
          </div>
        </div>

        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-semibold">Failure hotspots</h3>
          <p className="text-[11px] text-slate-400 mt-1">
            Helps support teams know where users get stuck.
          </p>

          <div className="mt-4 space-y-2">
            {Object.entries(breakdowns.failuresByPlatform || {}).length === 0 ? (
              <div className="text-sm text-slate-300">No platform failures detected.</div>
            ) : (
              Object.entries(breakdowns.failuresByPlatform)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .slice(0, 8)
                .map(([p, v]) => (
                  <div key={p} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-sm text-slate-200">{p}</div>
                    <div className="text-sm font-semibold text-slate-100">{v}</div>
                  </div>
                ))
            )}
          </div>
        </div>
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-semibold mb-4">Volume by platform</h3>
          <Donut items={donutData} />
        </div>

        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-semibold mb-3">Activity — last 7 days</h3>
          <MiniLine points={last7} />
          <div className="mt-3 flex flex-wrap gap-2">
            {last7.map((p) => (
              <div key={p.date} className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10">
                {p.date}: <span className="text-slate-200">{p.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Status breakdown */}
      <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold">Status breakdown</h3>

          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="text-[11px] text-slate-300">Platform</span>
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="all">All</option>
                {platformOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="text-[11px] text-slate-300">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="all">All</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s || "—"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {statusPills.length === 0 ? (
            <p className="text-sm text-slate-300">No records yet.</p>
          ) : (
            statusPills.map(({ key, value }) => (
              <div key={key} className="text-xs px-3 py-1 rounded-lg bg-white/5 border border-white/10">
                {key || "—"}: <span className="text-slate-100">{value}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Top content table */}
      <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold">Top content (operational view)</h3>
            <p className="text-[11px] text-slate-400 mt-1">
              This is “analytics department friendly”: what shipped, what’s queued, what’s failing — with context.
            </p>
          </div>
          <div className="text-[11px] text-slate-400">
            Showing <span className="text-slate-200 font-semibold">{filteredTop.length}</span>
          </div>
        </div>

        <div className="mt-4 overflow-auto rounded-2xl border border-white/10">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left">
                <th className="px-4 py-3 text-[11px] uppercase tracking-wide text-slate-300">Status</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-wide text-slate-300">Created</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-wide text-slate-300">Scheduled</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-wide text-slate-300">Platforms</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-wide text-slate-300">Content</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-wide text-slate-300">Media</th>
              </tr>
            </thead>

            <tbody>
              {filteredTop.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-300" colSpan={6}>
                    No items match your filters yet.
                  </td>
                </tr>
              ) : (
                filteredTop.map((it) => {
                  const s = String(it.status || "");
                  const isGood = s.toLowerCase().includes("posted") || s.toLowerCase().includes("published");
                  const isWarn = s.toLowerCase().includes("to_post") || s.toLowerCase().includes("queued") || s.toLowerCase().includes("pending");
                  const isBad = s.toLowerCase().includes("fail") || s.toLowerCase().includes("error");

                  const badge = classNames(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
                    isGood && "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
                    isWarn && "border-amber-500/40 bg-amber-500/10 text-amber-200",
                    isBad && "border-red-500/40 bg-red-500/10 text-red-200",
                    !isGood && !isWarn && !isBad && "border-white/10 bg-white/5 text-slate-200"
                  );

                  const media =
                    it.videoUrl ? "video" : it.imageUrl ? "image" : "—";

                  return (
                    <tr key={it.id} className="border-t border-white/10">
                      <td className="px-4 py-3">
                        <span className={badge}>{it.status || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-200">{niceDate(it.created_at)}</td>
                      <td className="px-4 py-3 text-slate-200">{niceDate(it.scheduled_at)}</td>
                      <td className="px-4 py-3 text-slate-200">
                        {(it.platforms || []).length ? it.platforms.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        {clampText(it.message_preview || "", 160)}
                      </td>
                      <td className="px-4 py-3 text-slate-200">{media}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-[11px] text-slate-400">
          Next upgrade: store engagement (likes/comments/views) and we’ll rank “Top posts” by real performance.
        </div>
      </section>

      {loading ? <p className="text-slate-300">Loading…</p> : null}
    </div>
  );
}
