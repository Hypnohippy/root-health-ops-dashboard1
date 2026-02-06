"use client";

import { useEffect, useState } from "react";

type Variant = {
  id: string;
  ab_group: string | null;
  headline: string | null;
  primary_text: string | null;
  media_url?: string | null;
  video_url?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Campaign = {
  id: string;
  name: string;
  platform?: string | null;
  objective?: string | null;
  status?: string | null;
  updated_at?: string | null;
  landing_url?: string | null;
  budget_daily?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  campaign_variants?: Variant[];
};

function niceDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function previewText(input: any, max = 220) {
  const s = String(input || "").replace(/\s+/g, " ").trim();
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || `Failed to load campaign (${res.status})`);
        }

        setCampaign(data?.campaign ?? null);
      } catch (e: any) {
        setError(e?.message || "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    }

    if (id) void load();
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{campaign?.name || "Campaign"}</h1>
            <p className="text-sm text-gray-600 mt-1">
              Platform: <span className="font-medium text-gray-900">{campaign?.platform || "—"}</span>{" "}
              · Objective: <span className="font-medium text-gray-900">{campaign?.objective || "—"}</span>{" "}
              · Status: <span className="font-medium text-gray-900">{campaign?.status || "—"}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Updated: {niceDate(campaign?.updated_at)}</p>
          </div>

          <a href="/dashboard/campaigns" className="rounded-md border bg-white px-3 py-1.5 text-xs">
            ← Back to campaigns
          </a>
        </header>

        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && campaign && (
          <>
            {/* Snapshot */}
            <section className="rounded-xl border bg-white p-4 space-y-2">
              <h2 className="text-sm font-semibold">Snapshot</h2>
              <p className="text-xs text-gray-500">
                Landing URL: <span className="text-gray-900">{campaign.landing_url || "—"}</span>
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                {(campaign.campaign_variants || []).map((v) => (
                  <div key={v.id} className="rounded-lg border bg-gray-50 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Variant {v.ab_group || "—"}</span>
                      <span className="text-gray-500">{v.status || "draft"}</span>
                    </div>
                    <p className="text-[11px] text-gray-600">{v.headline || "No headline"}</p>
                    <p className="text-gray-800 whitespace-pre-wrap">{previewText(v.primary_text, 240)}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* (Optional later) metrics/history panel can go here */}
          </>
        )}
      </div>
    </div>
  );
}
