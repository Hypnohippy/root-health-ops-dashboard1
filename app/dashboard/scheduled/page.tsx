// app/dashboard/scheduled/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ScheduledPost = {
  id: string;
  organisation_id: string;
  message: string;
  platforms: string[];
  image_url: string | null;
  scheduled_for: string;
  status: string | null;
  created_at?: string;
  sequence_id?: string | null;
  series_part?: number | null;
  series_total?: number | null;
  meta?: any;
};

// ✅ MUST be organisations.id (not owner_id)
const ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<ScheduledPost[]>([]);

  const fetchList = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/social/scheduled/list?organisationId=${encodeURIComponent(
          ORG_ID
        )}&limit=300`,
        { cache: "no-store" }
      );

      const data = await res.json().catch(() => null);

      if (!data?.success) {
        throw new Error(data?.error || "Could not load scheduled posts.");
      }

      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (e: any) {
      setError(e?.message || "Could not load scheduled posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const grouped = useMemo(() => {
    const withSeq: Record<string, ScheduledPost[]> = {};
    const singles: ScheduledPost[] = [];

    for (const r of records) {
      if (r.sequence_id) {
        withSeq[r.sequence_id] ||= [];
        withSeq[r.sequence_id].push(r);
      } else {
        singles.push(r);
      }
    }

    // sort each sequence by scheduled_for ASC so episodes read 1->N
    Object.values(withSeq).forEach((arr) =>
      arr.sort(
        (a, b) =>
          new Date(a.scheduled_for).getTime() -
          new Date(b.scheduled_for).getTime()
      )
    );

    // singles already pulled DESC; keep as-is
    return { withSeq, singles };
  }, [records]);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Scheduled</h1>
            <p className="text-sm text-slate-400">
              Your queued posts from Quick Blast and Stories (Supabase
              scheduled_posts).
            </p>
          </div>

          <button
            type="button"
            onClick={fetchList}
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:border-slate-500"
          >
            Refresh
          </button>
        </header>

        {loading && (
          <div className="text-sm text-slate-400">Loading scheduled posts…</div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
            No scheduled posts found for this organisation yet.
          </div>
        )}

        {/* SERIES (sequence_id) */}
        {Object.keys(grouped.withSeq).length > 0 && (
          <section className="space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Story series
            </div>

            <div className="grid gap-4">
              {Object.entries(grouped.withSeq).map(([seqId, arr]) => {
                const first = arr[0];
                const total = first?.series_total || arr.length;

                return (
                  <div
                    key={seqId}
                    className="rounded-3xl border border-slate-700 bg-slate-900/60 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-100">
                        Series {seqId.slice(0, 8)}…{" "}
                        <span className="text-slate-400 font-normal">
                          ({arr.length}/{total})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {arr[0]?.meta?.storyType
                          ? `Type: ${arr[0].meta.storyType}`
                          : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {arr.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] text-slate-400">
                              {r.series_part ? `Episode ${r.series_part}` : ""}
                              {r.series_total
                                ? ` / ${r.series_total}`
                                : ""}
                              {" · "}
                              {fmt(r.scheduled_for)}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {r.platforms?.join(", ")}{" "}
                              {r.status ? `· ${r.status}` : ""}
                            </div>
                          </div>

                          <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap line-clamp-3">
                            {r.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SINGLES */}
        {grouped.singles.length > 0 && (
          <section className="space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Single scheduled posts
            </div>

            <div className="grid gap-3">
              {grouped.singles.map((r) => (
                <div
                  key={r.id}
                  className="rounded-3xl border border-slate-700 bg-slate-900/60 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-400">
                      {fmt(r.scheduled_for)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {r.platforms?.join(", ")} {r.status ? `· ${r.status}` : ""}
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap line-clamp-4">
                    {r.message}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
