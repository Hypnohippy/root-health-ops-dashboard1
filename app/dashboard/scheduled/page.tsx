// app/dashboard/scheduled/page.tsx
"use client";

import React, { useEffect, useState } from "react";

type ScheduledStatus = "scheduled" | "sent" | "failed";

type ScheduledPost = {
  id: string;
  organisation_id: string;
  message: string;
  platforms: string[];
  image_url: string | null;
  scheduled_for: string; // ISO string
  status: ScheduledStatus;
  error_info?: any;
  posted_at?: string | null;
  created_at: string;
};

type ApiResponse =
  | {
      success: true;
      items: ScheduledPost[];
    }
  | {
      success: false;
      error: string;
    };

const ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

export default function DashboardScheduledPage() {
  const [items, setItems] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        // 👇 IMPORTANT: now calling the *new* Supabase-backed endpoint
        const res = await fetch(
          `/api/social/scheduled?organisationId=${ORG_ID}`
        );
        const data: ApiResponse = await res.json();

        if (!data.success) {
          setError(data.error || "Could not load scheduled posts.");
          setItems([]);
          return;
        }

        setItems(data.items);
      } catch (err: any) {
        console.error("[DashboardScheduledPage] load error", err);
        setError("Something went wrong loading scheduled posts.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const now = new Date();

  const upcoming = items.filter((item) => {
    if (item.status !== "scheduled") return false;
    const d = new Date(item.scheduled_for);
    return !isNaN(d.getTime()) && d.getTime() >= now.getTime();
  });

  const pastSent = items
    .filter((item) => item.status === "sent")
    .sort((a, b) => {
      const ta = new Date(a.posted_at || a.scheduled_for).getTime();
      const tb = new Date(b.posted_at || b.scheduled_for).getTime();
      return tb - ta;
    });

  const pastFailed = items
    .filter((item) => item.status === "failed")
    .sort((a, b) => {
      const ta = new Date(a.scheduled_for).getTime();
      const tb = new Date(b.scheduled_for).getTime();
      return tb - ta;
    });

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  const formatPlatforms = (platforms: string[]) => {
    if (!platforms || platforms.length === 0) return "—";
    return platforms.join(", ");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Scheduled Posts
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              Everything Root Health Ops has queued, sent, or that needs your
              attention across your connected channels.
            </p>
          </div>
        </header>

        {/* Loading / error */}
        {loading && (
          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-300">
            Loading scheduled posts…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-3xl border border-red-500/60 bg-red-950/40 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">
            {/* Upcoming */}
            <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 md:p-5">
              <h2 className="text-base md:text-lg font-semibold mb-3">
                Upcoming
              </h2>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Nothing queued yet. Use{" "}
                  <span className="font-medium">Quick Blast → Schedule</span> to
                  line up your next posts.
                </p>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          Scheduled for {formatDate(item.scheduled_for)}
                        </div>
                        <div className="text-[11px] text-emerald-300">
                          {formatPlatforms(item.platforms)}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-100 whitespace-pre-wrap">
                        {item.message}
                      </p>
                      {item.image_url && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Image: {item.image_url}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Sent */}
            <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 md:p-5">
              <h2 className="text-base md:text-lg font-semibold mb-3">
                Recently sent
              </h2>
              {pastSent.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No sent posts recorded yet. As scheduled posts go out, they
                  will appear here.
                </p>
              ) : (
                <div className="space-y-3">
                  {pastSent.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          Sent at {formatDate(item.posted_at || item.scheduled_for)}
                        </div>
                        <div className="text-[11px] text-emerald-300">
                          {formatPlatforms(item.platforms)}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-100 whitespace-pre-wrap">
                        {item.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Failed */}
            <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 md:p-5">
              <h2 className="text-base md:text-lg font-semibold mb-3">
                Needs attention
              </h2>
              {pastFailed.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No failures right now. If Ayrshare or the networks reject a
                  post, it will appear here with details.
                </p>
              ) : (
                <div className="space-y-3">
                  {pastFailed.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-amber-500/60 bg-amber-950/40 p-3 text-sm"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="text-xs uppercase tracking-wide text-amber-200">
                          Failed for {formatDate(item.scheduled_for)}
                        </div>
                        <div className="text-[11px] text-amber-200">
                          {formatPlatforms(item.platforms)}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-amber-50 whitespace-pre-wrap">
                        {item.message}
                      </p>
                      {item.error_info && (
                        <pre className="mt-2 text-[10px] text-amber-200 bg-black/30 rounded-xl p-2 overflow-x-auto">
                          {JSON.stringify(item.error_info, null, 2)}
                        </pre>
                      )}
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
