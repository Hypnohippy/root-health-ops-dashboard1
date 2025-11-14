"use client";

import React, { useEffect, useState } from "react";

type CampaignRecord = {
  id: string;
  name?: string;
  platform?: string;
  objective?: string;
  primary_text?: string;
  headline?: string;
  status?: string;
  ab_group?: string;
  start_date?: string | null;
  end_date?: string | null;
  budget_daily?: number | string | null;
  url?: string;
};

type GroupedCampaign = {
  key: string;
  name: string;
  platform: string;
  objective: string;
  campaigns: CampaignRecord[];
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [grouped, setGrouped] = useState<GroupedCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [objectiveFilter, setObjectiveFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/campaigns", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load campaigns");
        }

        const rows: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data.records)
          ? data.records
          : [];

        const mapped: CampaignRecord[] = rows.map((row: any) => {
          const fields = row.fields ?? row;
          return {
            id: String(row.id || fields.id || Math.random().toString(36)),
            name: fields.name ?? "",
            platform: fields.platform ?? "",
            objective: fields.objective ?? "",
            primary_text: fields.primary_text ?? "",
            headline: fields.headline ?? "",
            status: fields.status ?? "",
            ab_group: fields.ab_group ?? "",
            start_date: fields.start_date ?? null,
            end_date: fields.end_date ?? null,
            budget_daily: fields.budget_daily ?? null,
            url: fields.url ?? "",
          };
        });

        setCampaigns(mapped);
      } catch (e: any) {
        setError(e?.message || "Error loading campaigns");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    const byGroup: Record<string, GroupedCampaign> = {};

    campaigns
      .filter((c) =>
        platformFilter === "all" ? true : c.platform === platformFilter
      )
      .filter((c) =>
        objectiveFilter === "all" ? true : c.objective === objectiveFilter
      )
      .forEach((c) => {
        const key = `${c.name ?? "Untitled"}|${c.platform ?? ""}|${
          c.objective ?? ""
        }`;
        if (!byGroup[key]) {
          byGroup[key] = {
            key,
            name: c.name || "Untitled campaign",
            platform: c.platform || "Unknown",
            objective: c.objective || "",
            campaigns: [],
          };
        }
        byGroup[key].campaigns.push(c);
      });

    const groupsArr = Object.values(byGroup).map((g) => ({
      ...g,
      campaigns: [...g.campaigns].sort((a, b) => {
        const order: Record<string, number> = { A: 1, B: 2, C: 3 };
        const aKey = (a.ab_group || "").toUpperCase();
        const bKey = (b.ab_group || "").toUpperCase();
        return (order[aKey] || 99) - (order[bKey] || 99);
      }),
    }));

    groupsArr.sort((a, b) => {
      const aDate = a.campaigns[0]?.start_date || a.campaigns[0]?.id || "";
      const bDate = b.campaigns[0]?.start_date || b.campaigns[0]?.id || "";
      return String(bDate).localeCompare(String(aDate));
    });

    setGrouped(groupsArr);
  }, [campaigns, platformFilter, objectiveFilter]);

  const allPlatforms = Array.from(
    new Set(campaigns.map((c) => c.platform).filter(Boolean))
  );
  const allObjectives = Array.from(
    new Set(campaigns.map((c) => c.objective).filter(Boolean))
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Campaigns</h1>
            <p className="text-sm text-gray-600">
              See your split tests at a glance. Each card groups variants by
              campaign name, platform and objective.
            </p>
          </div>
          <a
            href="/dashboard/campaigns/new"
            className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white"
          >
            + New campaign
          </a>
        </header>

        <section className="rounded-xl border bg-white p-4 flex flex-wrap gap-4 items-center text-xs">
          <div className="space-y-1">
            <p className="font-semibold text-gray-700">Platform</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPlatformFilter("all")}
                className={`rounded-full px-3 py-1 border ${
                  platformFilter === "all"
                    ? "bg-black text-white"
                    : "bg-white text-gray-800"
                }`}
              >
                All
              </button>
              {allPlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatformFilter(p || "")}
                  className={`rounded-full px-3 py-1 border ${
                    platformFilter === p
                      ? "bg-black text-white"
                      : "bg-white text-gray-800"
                  }`}
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
                className={`rounded-full px-3 py-1 border ${
                  objectiveFilter === "all"
                    ? "bg-black text-white"
                    : "bg-white text-gray-800"
                }`}
              >
                All
              </button>
              {allObjectives.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setObjectiveFilter(o || "")}
                  className={`rounded-full px-3 py-1 border ${
                    objectiveFilter === o
                      ? "bg-black text-white"
                      : "bg-white text-gray-800"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        </section>

        {loading && (
          <p className="text-sm text-gray-500">Loading campaigns…</p>
        )}
        {error && (
          <p className="text-sm text-red-600">
            Error loading campaigns: {error}
          </p>
        )}

        {!loading && !error && grouped.length === 0 && (
          <p className="text-sm text-gray-500">
            No campaigns yet. Create one from the top-right button.
          </p>
        )}

        <div className="space-y-4">
          {grouped.map((group) => (
            <div
              key={group.key}
              className="rounded-xl border bg-white p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{group.name}</h2>
                  <p className="text-xs text-gray-500">
                    {group.platform} · {group.objective}
                  </p>
                </div>
                <div className="flex gap-2">
                  {group.campaigns.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] gap-1"
                    >
                      <span className="font-semibold">
                        {c.ab_group || "–"}
                      </span>
                      <span className="text-gray-500">
                        {c.status || "draft"}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {group.campaigns.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border bg-gray-50 p-3 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold">
                        Variant {c.ab_group || "–"}
                      </span>
                      {c.budget_daily && (
                        <span className="text-[11px] text-gray-500">
                          £{c.budget_daily}/day
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {c.headline || "No headline"}
                    </p>
                    <p className="line-clamp-4 whitespace-pre-wrap">
                      {c.primary_text || "No primary text"}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-gray-500">
                        {c.start_date || "No date"}
                      </span>
                      {c.url && (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-blue-600 underline"
                        >
                          View URL
                        </a>
                      )}
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
