// app/dashboard/scheduled/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ScheduledPost = {
  id: string;
  organisation_id: string;
  message: string;
  platforms: string[];
  image_url?: string | null;
  scheduled_for: string;
  status: string;
  created_at?: string;
  meta?: any;
};

const ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/schedule/list?organisationId=${encodeURIComponent(ORG_ID)}`,
          { cache: "no-store" }
        );

        const data: any = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(
            data?.error || `Failed to load scheduled posts (HTTP ${res.status}).`
          );
        }

        const items = Array.isArray(data?.items) ? data.items : [];
        if (!cancelled) setRows(items);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load scheduled posts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => new Date(r.scheduled_for).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
      );
  }, [rows]);

  const past = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => new Date(r.scheduled_for).getTime() < now)
      .sort(
        (a, b) =>
          new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime()
      );
  }, [rows]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Scheduled</h1>
            <p className="text-sm text-slate-400">
              Posts queued in Supabase (scheduled_posts).
            </p>
          </div>
          <span className="text-[11px] text-slate-400">
            Org: <span className="text-slate-200">{ORG_ID}</span>
          </span>
        </header>

        {loading && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
            Loading scheduled posts…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
              <h2 className="text-base font-semibold">Upcoming</h2>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-400">No upcoming posts.</p>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3"
                    >
                      <div className="text-[11px] text-slate-400">
                        {new Date(p.scheduled_for).toLocaleString()} ·{" "}
                        <span className="text-slate-200">
                          {p.platforms?.join(", ")}
                        </span>
                      </div>
                      <div className="mt-2 text-sm whitespace-pre-wrap">
                        {p.message}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        status: {p.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
              <h2 className="text-base font-semibold">Past</h2>
              {past.length === 0 ? (
                <p className="text-sm text-slate-400">No past posts.</p>
              ) : (
                <div className="space-y-3">
                  {past.slice(0, 25).map((p) => (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3"
                    >
                      <div className="text-[11px] text-slate-400">
                        {new Date(p.scheduled_for).toLocaleString()} ·{" "}
                        <span className="text-slate-200">
                          {p.platforms?.join(", ")}
                        </span>
                      </div>
                      <div className="mt-2 text-sm whitespace-pre-wrap">
                        {p.message}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        status: {p.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
