"use client";

import React, { useEffect, useMemo, useState } from "react";
import ConnectedChannelsBar from "../components/ConnectedChannelsBar";

type VariantRow = {
  id: string;
  campaign_id: string;
  ab_group: string | null;
  headline: string | null;
  primary_text: string | null;
  media_url: string | null;
  video_url: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CampaignRow = {
  id: string;
  organisation_id: string;
  name: string | null;
  platform?: string | null;
  objective?: string | null;
  status?: string | null;
  budget_daily?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  landing_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  meta?: any | null;
  created_at?: string | null;
  updated_at?: string | null;
  campaign_variants?: VariantRow[] | null;
};

type GroupedCampaign = {
  key: string;
  id: string;
  name: string;
  platform: string;
  objective: string;
  status: string;
  budgetDaily?: string;
  dateRange?: string;
  landingUrl?: string;
  campaigns: {
    id: string;
    ab_group: string;
    status: string;
    headline: string;
    primary_text: string;
    media_url?: string | null;
    video_url?: string | null;
    updated_at?: string | null;
  }[];
};

function safeStr(v: any, fallback = "") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function previewText(s: string, n = 140) {
  const t = (s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function pill(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("live") || s.includes("active")) return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  if (s.includes("draft")) return "bg-white/5 text-slate-200 border-white/10";
  if (s.includes("paused")) return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  if (s.includes("error") || s.includes("fail")) return "bg-red-500/15 text-red-200 border-red-500/30";
  return "bg-white/5 text-slate-200 border-white/10";
}

export default function CampaignsPage() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
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
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          throw new Error(data.error || "Failed to load campaigns");
        }

        const list: CampaignRow[] = Array.isArray(data)
          ? data
          : Array.isArray(data.records)
          ? data.records
          : [];

        setRows(list);
      } catch (e: any) {
        setError(e?.message || "Error loading campaigns");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const allPlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const c of rows) {
      const p = safeStr(c.platform || c.meta?.platform || c.meta?.platform_name || "", "");
      if (p) set.add(p);
    }
    return Array.from(set);
  }, [rows]);

  const allObjectives = useMemo(() => {
    const set = new Set<string>();
    for (const c of rows) {
      const o = safeStr(c.objective || "", "");
      if (o) set.add(o);
    }
    return Array.from(set);
  }, [rows]);

  useEffect(() => {
    const groups: Record<string, GroupedCampaign> = {};

    const filtered = rows
      .filter((c) => {
        const p = safeStr(c.platform || c.meta?.platform || "", "Unknown");
        return platformFilter === "all" ? true : p === platformFilter;
      })
      .filter((c) => {
        const o = safeStr(c.objective || "", "");
        return objectiveFilter === "all" ? true : o === objectiveFilter;
      });

    for (const c of filtered) {
      const name = safeStr(c.name, "Untitled campaign");
      const platform = safeStr(c.platform || c.meta?.platform || c.meta?.platform_name, "Unknown");
      const objective = safeStr(c.objective, "—");
      const status = safeStr(c.status || c.meta?.status, "draft");

      const key = `${c.id}|${name}|${platform}|${objective}`;

      if (!groups[key]) {
        const budget = c.budget_daily != null ? `£${c.budget_daily}/day` : "";
        const start = safeStr(c.start_date, "");
        const end = safeStr(c.end_date, "");
        const dateRange = start ? (end ? `${start} → ${end}` : `${start}`) : "";

        groups[key] = {
          key,
          id: c.id,
          name,
          platform,
          objective,
          status,
          budgetDaily: budget || undefined,
          dateRange: dateRange || undefined,
          landingUrl: safeStr(c.landing_url, "") || undefined,
          campaigns: [],
        };
      }

      const variants = Array.isArray(c.campaign_variants) ? c.campaign_variants : [];

      // If there are no variants yet, show a placeholder “Draft – No variants”
      if (variants.length === 0) {
        groups[key].campaigns.push({
          id: `${c.id}-no-variants`,
          ab_group: "—",
          status: status || "draft",
          headline: "No variants yet",
          primary_text: "Generate A/B/C variants on the New Campaign page to see snapshots here.",
          media_url: null,
          video_url: null,
          updated_at: c.updated_at || c.created_at || null,
        });
        continue;
      }

      for (const v of variants) {
        groups[key].campaigns.push({
          id: v.id,
          ab_group: safeStr(v.ab_group, "—"),
          status: safeStr(v.status, status || "draft"),
          headline: safeStr(v.headline, "No headline"),
          primary_text: safeStr(v.primary_text, ""),
          media_url: v.media_url ?? null,
          video_url: v.video_url ?? null,
          updated_at: v.updated_at || v.created_at || null,
        });
      }
    }

    const out = Object.values(groups);

    // Sort newest first (by any variant updated_at, fallback campaign key)
    out.sort((a, b) => {
      const aT = a.campaigns[0]?.updated_at || "";
      const bT = b.campaigns[0]?.updated_at || "";
      return String(bT).localeCompare(String(aT));
    });

    // Sort variants A/B/C order inside each group
    for (const g of out) {
      const order: Record<string, number> = { A: 1, B: 2, C: 3 };
      g.campaigns.sort((x, y) => (order[(x.ab_group || "").toUpperCase()] || 99) - (order[(y.ab_group || "").toUpperCase()] || 99));
    }

    setGrouped(out);
  }, [rows, platformFilter, objectiveFilter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold">Campaigns</h1>
              <p className="text-sm text-gray-600">
                Your campaign library. Each card groups A/B/C variants and shows a real snapshot of what you’re sending.
              </p>
            </div>
            <a
              href="/dashboard/campaigns/new"
              className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white"
            >
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
                className={`rounded-full px-3 py-1 border ${
                  platformFilter === "all" ? "bg-black text-white" : "bg-white text-gray-800"
                }`}
              >
                All
              </button>
              {allPlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatformFilter(p)}
                  className={`rounded-full px-3 py-1 border ${
                    platformFilter === p ? "bg-black text-white" : "bg-white text-gray-800"
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
                  objectiveFilter === "all" ? "bg-black text-white" : "bg-white text-gray-800"
                }`}
              >
                All
              </button>
              {allObjectives.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setObjectiveFilter(o)}
                  className={`rounded-full px-3 py-1 border ${
                    objectiveFilter === o ? "bg-black text-white" : "bg-white text-gray-800"
                  }`}
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
          <p className="text-sm text-gray-500">
            No campaigns yet. Create one from the top-right button.
          </p>
        )}

        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.key} className="rounded-xl border bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{group.name}</h2>
                  <p className="text-xs text-gray-500">
                    {group.platform} · {group.objective}
                    {group.budgetDaily ? <> · {group.budgetDaily}</> : null}
                    {group.dateRange ? <> · {group.dateRange}</> : null}
                  </p>
                  {group.landingUrl ? (
                    <p className="text-[11px] text-gray-500 mt-1 break-all">
                      Landing: <span className="text-gray-700">{group.landingUrl}</span>
                    </p>
                  ) : null}
                </div>

                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${pill(group.status)}`}>
                  {group.status || "draft"}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {group.campaigns.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-gray-50 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold">Variant {c.ab_group || "—"}</span>
                      <span className={`text-[11px] rounded-full border px-2 py-0.5 ${pill(c.status)}`}>
                        {c.status || "draft"}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-600 font-semibold">
                      {c.headline || "No headline"}
                    </p>

                    <p className="text-[11px] text-gray-700 whitespace-pre-wrap">
                      {c.primary_text ? previewText(c.primary_text, 170) : "No primary text"}
                    </p>

                    {(c.media_url || c.video_url) ? (
                      <div className="text-[11px] text-gray-500 break-all pt-1">
                        {c.video_url ? <>Video: <span className="text-gray-700">{c.video_url}</span></> : null}
                        {c.video_url && c.media_url ? <span className="text-gray-400"> · </span> : null}
                        {c.media_url ? <>Media: <span className="text-gray-700">{c.media_url}</span></> : null}
                      </div>
                    ) : null}
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
