"use client";

import React, { useEffect, useMemo, useState } from "react";
import ConnectedChannelsBar from "../components/ConnectedChannelsBar";

type CampaignVariant = {
  id: string;
  campaign_id: string;
  ab_group: string;
  headline?: string | null;
  primary_text?: string | null;
  status?: string | null;
  media_url?: string | null;
  video_url?: string | null;
  created_at?: string | null;
};

type Campaign = {
  id: string;
  organisation_id: string;
  name: string;
  platform: string;
  objective: string;
  status: string;
  budget_daily?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  created_at?: string | null;
  variants: CampaignVariant[];
};

type ApiResponse = {
  ok: boolean;
  organisationId?: string;
  error?: string;
  campaigns?: Campaign[];
};

function abOrder(ab: string) {
  const x = String(ab || "").toUpperCase();
  if (x === "A") return 1;
  if (x === "B") return 2;
  if (x === "C") return 3;
  return 99;
}

export default function CampaignsPage() {
  const [json, setJson] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [objectiveFilter, setObjectiveFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function load() {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (platformFilter !== "all") params.set("platform", platformFilter);
      if (objectiveFilter !== "all") params.set("objective", objectiveFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/campaigns?${params.toString()}`, {
        cache: "no-store",
      });
      const data: ApiResponse = await res.json().catch(() => ({} as any));
      setJson(data);
    } catch (e: any) {
      setJson({ ok: false, error: e?.message || "Failed to load campaigns" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformFilter, objectiveFilter, statusFilter]);

  const campaigns = json?.campaigns || [];

  const allPlatforms = useMemo(() => {
    return Array.from(new Set(campaigns.map((c) => c.platform).filter(Boolean))).sort();
  }, [campaigns]);

  const allObjectives = useMemo(() => {
    return Array.from(new Set(campaigns.map((c) => c.objective).filter(Boolean))).sort();
  }, [campaigns]);

  const allStatuses = useMemo(() => {
    return Array.from(new Set(campaigns.map((c) => c.status).filter(Boolean))).sort();
  }, [campaigns]);

  const grouped = useMemo(() => {
    // Each campaign is already a “group” in the new schema.
    // Sort variants A/B/C.
    return campaigns.map((c) => ({
      ...c,
      variants: [...(c.variants || [])].sort((a, b) => abOrder(a.ab_group) - abOrder(b.ab_group)),
    }));
  }, [campaigns]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold">Campaigns</h1>
              <p className="text-sm text-gray-600">
                Your campaign library (Supabase). Variants A/B/C are grouped inside each campaign.
              </p>
              {json?.organisationId ? (
                <p className="mt-1 text-[11px] text-gray-500">
                  Org: <span className="text-gray-800 font-medium">{json.organisationId}</span>
                </p>
              ) : null}
            </div>

            <a
              href="/dashboard/campaigns/new"
              className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white"
            >
              + New campaign
            </a>
          </div>

          {/* Connections bar */}
          <ConnectedChannelsBar title="Social connections" />
        </header>

        {!json?.ok && json?.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {json.error}
          </div>
        ) : null}

        {/* Filters */}
        <section className="rounded-xl border bg-white p-4 flex flex-wrap gap-4 items-center text-xs">
          <div className="space-y-1">
            <p className="font-semibold text-gray-700">Platform</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPlatformFilter("all")}
                className={`rounded-full px-3 py-1 border ${platformFilter === "all" ? "bg-black text-white" : "bg-white text-gray-800"}`}
              >
                All
              </button>
              {allPlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatformFilter(p)}
                  className={`rounded-full px-3 py-1 border ${platformFilter === p ? "bg-black text-white" : "bg-white text-gray-800"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-gray-700">Objective</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setObjectiveFilter("all")}
                className={`rounded-full px-3 py-1 border ${objectiveFilter === "all" ? "bg-black text-white" : "bg-white text-gray-800"}`}
              >
                All
              </button>
              {allObjectives.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setObjectiveFilter(o)}
                  className={`rounded-full px-3 py-1 border ${objectiveFilter === o ? "bg-black text-white" : "bg-white text-gray-800"}`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-gray-700">Status</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`rounded-full px-3 py-1 border ${statusFilter === "all" ? "bg-black text-white" : "bg-white text-gray-800"}`}
              >
                All
              </button>
              {allStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-3 py-1 border ${statusFilter === s ? "bg-black text-white" : "bg-white text-gray-800"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {loading && <p className="text-sm text-gray-500">Loading campaigns…</p>}

        {!loading && grouped.length === 0 ? (
          <p className="text-sm text-gray-500">No campaigns yet. Create one from the top-right button.</p>
        ) : null}

        <div className="space-y-4">
          {grouped.map((c) => (
            <div key={c.id} className="rounded-xl border bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{c.name || "Untitled campaign"}</h2>
                  <p className="text-xs text-gray-500">
                    {c.platform || "—"} · {c.objective || "—"} · <span className="font-medium">{c.status || "draft"}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-600">
                    {c.budget_daily != null ? (
                      <span className="rounded-full border px-2 py-0.5">£{c.budget_daily}/day</span>
                    ) : null}
                    {c.start_date ? <span className="rounded-full border px-2 py-0.5">Start: {c.start_date}</span> : null}
                    {c.end_date ? <span className="rounded-full border px-2 py-0.5">End: {c.end_date}</span> : null}
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border px-2 py-0.5 text-blue-600 underline"
                      >
                        Landing URL
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="flex gap-2">
                  <a
                    href={`/dashboard/campaigns/${c.id}`}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                    title="(Optional) We can build a campaign detail page later"
                  >
                    View
                  </a>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {(c.variants || []).map((v) => (
                  <div key={v.id} className="rounded-lg border bg-gray-50 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold">Variant {v.ab_group || "–"}</span>
                      <span className="text-[11px] text-gray-500">{v.status || "draft"}</span>
                    </div>

                    <p className="text-[11px] text-gray-500">{v.headline || "No headline"}</p>
                    <p className="line-clamp-4 whitespace-pre-wrap">{v.primary_text || "No primary text"}</p>

                    {(v.video_url || v.media_url) ? (
                      <div className="pt-1 text-[11px] text-gray-600 break-all">
                        {v.video_url ? <>Video: <span className="text-gray-800">{v.video_url}</span></> : null}
                        {v.video_url && v.media_url ? <span className="text-gray-400"> · </span> : null}
                        {v.media_url ? <>Media: <span className="text-gray-800">{v.media_url}</span></> : null}
                      </div>
                    ) : null}
                  </div>
                ))}

                {(c.variants || []).length === 0 ? (
                  <div className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-600">
                    No variants yet for this campaign.
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
