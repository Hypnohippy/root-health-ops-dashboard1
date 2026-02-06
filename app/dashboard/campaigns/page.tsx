"use client";

import React, { useEffect, useMemo, useState } from "react";
import ConnectedChannelsBar from "../components/ConnectedChannelsBar";

type Variant = {
  id: string;
  campaign_id: string;
  ab_group?: string;
  headline?: string;
  primary_text?: string;
  status?: string;
  media_url?: string | null;
  video_url?: string | null;
};

type Campaign = {
  id: string;
  name: string;
  platform: string;
  objective?: string | null;
  status?: string | null;
  budget_daily?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  landing_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  created_at?: string;
  campaign_variants?: Variant[];
};

type GroupedCampaign = {
  key: string;
  name: string;
  platform: string;
  objective: string;
  campaigns: Variant[];
  meta: {
    campaignId: string;
    status?: string | null;
    budget?: number | null;
    start?: string | null;
    end?: string | null;
    url?: string | null;
  };
};

export default function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [objectiveFilter, setObjectiveFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/campaigns", { method: "GET", headers: { "Content-Type": "application/json" } });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data.error || "Failed to load campaigns");

        const records: Campaign[] = Array.isArray(data.records) ? data.records : [];
        setRows(records);
      } catch (e: any) {
        setError(e?.message || "Error loading campaigns");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const grouped = useMemo(() => {
    const byGroup: Record<string, GroupedCampaign> = {};

    const filtered = rows
      .filter((c) => (platformFilter === "all" ? true : c.platform === platformFilter))
      .filter((c) => (objectiveFilter === "all" ? true : (c.objective || "") === objectiveFilter));

    for (const c of filtered) {
      const key = `${c.name}|${c.platform}|${c.objective || ""}`;

      if (!byGroup[key]) {
        byGroup[key] = {
          key,
          name: c.name || "Untitled campaign",
          platform: c.platform || "Unknown",
          objective: c.objective || "",
          campaigns: [],
          meta: {
            campaignId: c.id,
            status: c.status,
            budget: c.budget_daily ?? null,
            start: c.start_date ?? null,
            end: c.end_date ?? null,
            url: c.landing_url ?? null,
          },
        };
      }

      const variants = Array.isArray(c.campaign_variants) ? c.campaign_variants : [];
      byGroup[key].campaigns.push(...variants);
    }

    const groupsArr = Object.values(byGroup).map((g) => ({
      ...g,
      campaigns: [...g.campaigns].sort((a, b) => {
        const order: Record<string, number> = { A: 1, B: 2, C: 3 };
        const aKey = String(a.ab_group || "").toUpperCase();
        const bKey = String(b.ab_group || "").toUpperCase();
        return (order[aKey] || 99) - (order[bKey] || 99);
      }),
    }));

    groupsArr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return groupsArr;
  }, [rows, platformFilter, objectiveFilter]);

  const allPlatforms = useMemo(() => Array.from(new Set(rows.map((c) => c.platform).filter(Boolean))), [rows]);
  const allObjectives = useMemo(() => Array.from(new Set(rows.map((c) => c.objective || "").filter(Boolean))), [rows]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold">Campaigns</h1>
              <p className="text-sm text-gray-600">
                Split tests at a glance. Each card groups variants by campaign name, platform and objective.
              </p>
            </div>
            <a href="/dashboard/campaigns/new" className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white">
              + New campaign
            </a>
          </div>

          <ConnectedChannelsBar title="Social connections" />
        </header>

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
                  onClick={() => setPlatformFilter(p || "")}
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
                  onClick={() => setObjectiveFilter(o || "")}
                  className={`rounded-full px-3 py-1 border ${objectiveFilter === o ? "bg-black text-white" : "bg-white text-gray-800"}`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        </section>

        {loading && <p className="text-sm text-gray-500">Loading campaigns…</p>}
        {error && <p className="text-sm text-red-600">Error loading campaigns: {error}</p>}

        {!loading && !error && grouped.length === 0 && (
          <p className="text-sm text-gray-500">No campaigns yet. Create one from the top-right button.</p>
        )}

        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.key} className="rounded-xl border bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{group.name}</h2>
                  <p className="text-xs text-gray-500">{group.platform} · {group.objective || "—"}</p>
                  <p className="text-[11px] text-gray-400">
                    Status: {group.meta.status || "draft"}
                    {group.meta.budget ? <> · £{group.meta.budget}/day</> : null}
                    {group.meta.start ? <> · {group.meta.start}</> : null}
                    {group.meta.end ? <> → {group.meta.end}</> : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  {group.campaigns.map((v) => (
                    <span key={v.id} className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] gap-1">
                      <span className="font-semibold">{(v.ab_group || "–").toUpperCase()}</span>
                      <span className="text-gray-500">{v.status || "draft"}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {group.campaigns.map((v) => (
                  <div key={v.id} className="rounded-lg border bg-gray-50 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold">Variant {(v.ab_group || "–").toUpperCase()}</span>
                    </div>

                    <p className="text-[11px] text-gray-500">{v.headline || "No headline"}</p>
                    <p className="line-clamp-4 whitespace-pre-wrap">{v.primary_text || "No primary text"}</p>

                    <div className="flex items-center justify-between pt-1">
                      {group.meta.url ? (
                        <a href={group.meta.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 underline">
                          View landing URL
                        </a>
                      ) : (
                        <span className="text-[11px] text-gray-500">No landing URL</span>
                      )}
                      <span className="text-[11px] text-gray-400">{v.status || "draft"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
