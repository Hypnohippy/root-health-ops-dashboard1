// app/dashboard/campaigns/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import ConnectedChannelsBar from "../components/ConnectedChannelsBar";

type CampaignVariant = {
  id: string;
  campaign_id: string;
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
  organisation_id: string;
  name: string | null;
  platform: string | null;
  objective: string | null;
  status: string | null;
  budget_daily?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  landing_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  campaign_variants?: CampaignVariant[];
};

type VariantMetricRow = {
  id: string;
  organisation_id: string;
  campaign_id: string;
  variant_id: string;
  ctr: number | null;
  cpl: number | null;
  spend?: number | null;
  clicks?: number | null;
  impressions?: number | null;
  leads?: number | null;
  source?: string | null;
  reported_at?: string | null;
  created_at?: string | null;

  // returned by GET endpoint
  ctr_delta?: number | null;
  cpl_delta?: number | null;
};

type GroupedCampaign = {
  key: string;
  campaign: Campaign;
  variants: CampaignVariant[];
};

function clampText(s: any, max = 180) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(2)}%`;
}

function fmtMoney(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `£${Number(n).toFixed(2)}`;
}

function deltaBadge(value: number | null | undefined, kind: "ctr" | "cpl") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;

  const v = Number(value);
  const good = kind === "ctr" ? v > 0 : v < 0; // CTR up good, CPL down good
  const sign = v > 0 ? "+" : "";
  const text = kind === "ctr" ? `${sign}${v.toFixed(2)}%` : `${sign}£${v.toFixed(2)}`;

  return (
    <span
      className={[
        "ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border",
        good ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200",
      ].join(" ")}
      title={kind === "ctr" ? "Change vs previous logged result" : "Change vs previous logged result (lower CPL is better)"}
    >
      {kind === "ctr" ? "CTR Δ " : "CPL Δ "}
      {text}
    </span>
  );
}

function abOrderKey(ab: string | null | undefined) {
  const k = String(ab || "").toUpperCase().trim();
  if (k === "A") return 1;
  if (k === "B") return 2;
  if (k === "C") return 3;
  return 99;
}

export default function CampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [grouped, setGrouped] = useState<GroupedCampaign[]>([]);

  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [objectiveFilter, setObjectiveFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  // Metrics cache keyed by variant_id
  const [metricLatestByVariant, setMetricLatestByVariant] = useState<Record<string, VariantMetricRow | null>>({});

  // Modal state for logging results
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCampaign, setModalCampaign] = useState<Campaign | null>(null);
  const [modalVariant, setModalVariant] = useState<CampaignVariant | null>(null);

  const [ctr, setCtr] = useState<string>("");
  const [cpl, setCpl] = useState<string>("");
  const [spend, setSpend] = useState<string>("");
  const [clicks, setClicks] = useState<string>("");
  const [impressions, setImpressions] = useState<string>("");
  const [leads, setLeads] = useState<string>("");
  const [reportedAt, setReportedAt] = useState<string>("");

  function resetNotices() {
    setError(null);
  }

  async function loadCampaignsAndMetrics() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/campaigns", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load campaigns");

      const rows: Campaign[] = Array.isArray(data?.records) ? data.records : Array.isArray(data) ? data : [];
      // Normalize a bit
      const normalized = rows.map((c: any) => ({
        ...c,
        campaign_variants: Array.isArray(c?.campaign_variants) ? c.campaign_variants : [],
      })) as Campaign[];

      setCampaigns(normalized);

      // Collect variant ids and fetch latest metrics for org in one go (limit high enough for deltas)
      const variantIds = normalized
        .flatMap((c) => c.campaign_variants || [])
        .map((v) => String(v.id || "").trim())
        .filter(Boolean);

      if (variantIds.length === 0) {
        setMetricLatestByVariant({});
        return;
      }

      // Pull latest results across org. Endpoint returns rows ordered by reported_at desc + includes deltas.
      // We'll keep only the first row per variant as "latest".
      const mRes = await fetch(`/api/campaigns/results?limit=500`, { cache: "no-store" });
      const mJson = await mRes.json().catch(() => null);

      if (!mRes.ok || !mJson?.ok) {
        // Not fatal; campaigns can still render.
        setMetricLatestByVariant({});
        return;
      }

      const records: VariantMetricRow[] = Array.isArray(mJson?.records) ? mJson.records : [];
      const latest: Record<string, VariantMetricRow> = {};

      for (const r of records) {
        const vid = String(r.variant_id || "").trim();
        if (!vid) continue;
        if (latest[vid]) continue; // first hit is latest because endpoint is ordered desc
        latest[vid] = r;
      }

      // Fill for variants we know (set null if no metrics)
      const out: Record<string, VariantMetricRow | null> = {};
      for (const vid of variantIds) out[vid] = latest[vid] || null;

      setMetricLatestByVariant(out);
    } catch (e: any) {
      setError(e?.message || "Error loading campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCampaignsAndMetrics();
  }, []);

  useEffect(() => {
    const term = search.trim().toLowerCase();

    const filtered = campaigns
      .filter((c) => (platformFilter === "all" ? true : String(c.platform || "").toLowerCase() === platformFilter.toLowerCase()))
      .filter((c) => (objectiveFilter === "all" ? true : String(c.objective || "").toLowerCase() === objectiveFilter.toLowerCase()))
      .filter((c) => {
        if (!term) return true;
        const hay = [
          c.name,
          c.platform,
          c.objective,
          c.status,
          c.utm_campaign,
          c.landing_url,
          ...(c.campaign_variants || []).map((v) => v.headline),
          ...(c.campaign_variants || []).map((v) => v.primary_text),
        ]
          .map((x) => String(x || "").toLowerCase())
          .join(" | ");
        return hay.includes(term);
      });

    const byGroup: Record<string, GroupedCampaign> = {};

    for (const c of filtered) {
      const key = `${c.id}`;
      const variants = (c.campaign_variants || []).slice().sort((a, b) => abOrderKey(a.ab_group) - abOrderKey(b.ab_group));
      byGroup[key] = { key, campaign: c, variants };
    }

    const groupsArr = Object.values(byGroup).sort((a, b) => {
      const aDate = a.campaign.created_at || a.campaign.updated_at || a.campaign.id;
      const bDate = b.campaign.created_at || b.campaign.updated_at || b.campaign.id;
      return String(bDate || "").localeCompare(String(aDate || ""));
    });

    setGrouped(groupsArr);
  }, [campaigns, platformFilter, objectiveFilter, search]);

  const allPlatforms = useMemo(() => {
    return Array.from(new Set(campaigns.map((c) => String(c.platform || "").trim()).filter(Boolean))).sort();
  }, [campaigns]);

  const allObjectives = useMemo(() => {
    return Array.from(new Set(campaigns.map((c) => String(c.objective || "").trim()).filter(Boolean))).sort();
  }, [campaigns]);

  function openLogModal(c: Campaign, v: CampaignVariant) {
    resetNotices();
    setModalCampaign(c);
    setModalVariant(v);
    setCtr("");
    setCpl("");
    setSpend("");
    setClicks("");
    setImpressions("");
    setLeads("");
    setReportedAt("");
    setIsModalOpen(true);
  }

  function closeLogModal() {
    setIsModalOpen(false);
    setModalCampaign(null);
    setModalVariant(null);
  }

  async function submitLog() {
    if (!modalCampaign?.id || !modalVariant?.id) {
      setError("Missing campaign/variant context.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        campaignId: modalCampaign.id,
        variantId: modalVariant.id,
        source: "manual",
      };

      if (reportedAt) payload.reported_at = new Date(reportedAt).toISOString();

      const ctrN = ctr.trim() === "" ? null : Number(ctr);
      const cplN = cpl.trim() === "" ? null : Number(cpl);

      if (ctr.trim() !== "" && !Number.isFinite(ctrN)) throw new Error("CTR must be a number (e.g. 1.25)");
      if (cpl.trim() !== "" && !Number.isFinite(cplN)) throw new Error("CPL must be a number (e.g. 6.40)");

      payload.ctr = ctr.trim() === "" ? null : ctrN;
      payload.cpl = cpl.trim() === "" ? null : cplN;

      const spendN = spend.trim() === "" ? null : Number(spend);
      if (spend.trim() !== "" && !Number.isFinite(spendN)) throw new Error("Spend must be a number");

      const clicksN = clicks.trim() === "" ? null : Number(clicks);
      const impressionsN = impressions.trim() === "" ? null : Number(impressions);
      const leadsN = leads.trim() === "" ? null : Number(leads);

      if (clicks.trim() !== "" && (!Number.isFinite(clicksN) || clicksN < 0)) throw new Error("Clicks must be a whole number");
      if (impressions.trim() !== "" && (!Number.isFinite(impressionsN) || impressionsN < 0)) throw new Error("Impressions must be a whole number");
      if (leads.trim() !== "" && (!Number.isFinite(leadsN) || leadsN < 0)) throw new Error("Leads must be a whole number");

      payload.spend = spend.trim() === "" ? null : spendN;
      payload.clicks = clicks.trim() === "" ? null : Math.round(clicksN as number);
      payload.impressions = impressions.trim() === "" ? null : Math.round(impressionsN as number);
      payload.leads = leads.trim() === "" ? null : Math.round(leadsN as number);

      const res = await fetch("/api/campaigns/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to log results");

      closeLogModal();
      await loadCampaignsAndMetrics();
    } catch (e: any) {
      setError(e?.message || "Failed to log results");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold">Campaigns</h1>
              <p className="text-sm text-gray-600">
                Planning + history tracking. Save A/B/C variants, log results, and get “what to repeat” signal.
              </p>
            </div>
            <a href="/dashboard/campaigns/new" className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white">
              + New campaign
            </a>
          </div>

          <ConnectedChannelsBar title="Social connections" />
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Filters + search */}
        <section className="rounded-xl border bg-white p-4 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="text-xs text-gray-600">
              Tip: log at least one CTR/CPL entry per variant to unlock “winner/loser” coaching.
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns, objectives, copy…"
              className="w-full md:w-[360px] rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-4 items-center text-xs">
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

            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => loadCampaignsAndMetrics()}
                className="rounded-md border bg-white px-3 py-1.5 text-xs"
              >
                Refresh
              </button>
            </div>
          </div>
        </section>

        {loading && <p className="text-sm text-gray-500">Loading campaigns…</p>}

        {!loading && grouped.length === 0 && (
          <p className="text-sm text-gray-500">
            No campaigns yet. Create one from the top-right button.
          </p>
        )}

        {/* Campaign cards */}
        <div className="space-y-4">
          {grouped.map((g) => {
            const c = g.campaign;
            const variants = g.variants;

            // Use Variant A (or first) as snapshot
            const hero = variants.find((v) => String(v.ab_group || "").toUpperCase() === "A") || variants[0] || null;

            return (
              <div key={g.key} className="rounded-xl border bg-white p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold">{c.name || "Untitled campaign"}</h2>
                    <p className="text-xs text-gray-500">
                      {c.platform || "—"} · {c.objective || "—"} · {c.status || "draft"}
                      {c.utm_campaign ? <> · <span className="font-mono">{c.utm_campaign}</span></> : null}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    {c.budget_daily != null && c.budget_daily !== "" ? (
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-gray-700">
                        £{c.budget_daily}/day
                      </span>
                    ) : null}
                    {c.start_date ? (
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-gray-700">
                        Start: {c.start_date}
                      </span>
                    ) : null}
                    {c.end_date ? (
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-gray-700">
                        End: {c.end_date}
                      </span>
                    ) : null}
                    {c.landing_url ? (
                      <a
                        href={c.landing_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-blue-700 underline"
                      >
                        Landing page
                      </a>
                    ) : null}
                  </div>
                </div>

                {/* Snapshot */}
                <div className="rounded-lg border bg-gray-50 p-3">
                  <div className="text-[11px] font-semibold text-gray-700">Snapshot</div>
                  <div className="mt-1 text-[12px] text-gray-700">
                    <span className="font-semibold">Headline:</span>{" "}
                    {hero?.headline ? clampText(hero.headline, 120) : "—"}
                  </div>
                  <div className="mt-1 text-[12px] text-gray-600">
                    <span className="font-semibold">Copy:</span>{" "}
                    {hero?.primary_text ? clampText(hero.primary_text, 220) : "—"}
                  </div>
                </div>

                {/* Variants */}
                <div className="grid gap-3 md:grid-cols-3">
                  {variants.length === 0 ? (
                    <div className="text-sm text-gray-500">No variants found.</div>
                  ) : (
                    variants.map((v) => {
                      const ab = String(v.ab_group || "—").toUpperCase();
                      const m = metricLatestByVariant[String(v.id)] || null;

                      return (
                        <div key={v.id} className="rounded-lg border bg-white p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[11px] font-semibold text-gray-800">Variant {ab}</div>
                              <div className="text-[11px] text-gray-500">{v.status || "draft"}</div>
                            </div>

                            <button
                              type="button"
                              onClick={() => openLogModal(c, v)}
                              className="rounded-md bg-black px-2.5 py-1 text-[11px] text-white"
                              title="Log CTR/CPL results for this variant"
                            >
                              Log results
                            </button>
                          </div>

                          <div className="text-xs text-gray-700">
                            <div className="font-semibold">Headline</div>
                            <div className="text-gray-600">{clampText(v.headline, 90)}</div>
                          </div>

                          <div className="text-xs text-gray-700">
                            <div className="font-semibold">Primary text</div>
                            <div className="text-gray-600">{clampText(v.primary_text, 140)}</div>
                          </div>

                          <div className="rounded-md border bg-gray-50 p-2">
                            <div className="text-[11px] text-gray-600">Latest performance</div>

                            <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px]">
                              <div>
                                <span className="font-semibold text-gray-700">CTR:</span>{" "}
                                <span className="text-gray-800">{fmtPct(m?.ctr ?? null)}</span>
                                {deltaBadge(m?.ctr_delta ?? null, "ctr")}
                              </div>

                              <div>
                                <span className="font-semibold text-gray-700">CPL:</span>{" "}
                                <span className="text-gray-800">{fmtMoney(m?.cpl ?? null)}</span>
                                {deltaBadge(m?.cpl_delta ?? null, "cpl")}
                              </div>
                            </div>

                            {m?.reported_at ? (
                              <div className="mt-1 text-[11px] text-gray-500">
                                Logged: {new Date(m.reported_at).toLocaleString()}
                              </div>
                            ) : (
                              <div className="mt-1 text-[11px] text-gray-500">
                                No results logged yet. Add one entry to unlock coaching.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal */}
        {isModalOpen && modalCampaign && modalVariant ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={closeLogModal} />
            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Log Results</div>
                  <div className="text-[12px] text-gray-600 mt-0.5">
                    {modalCampaign.name || "Untitled campaign"} · Variant {String(modalVariant.ab_group || "—").toUpperCase()}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeLogModal}
                  className="rounded-md border px-2 py-1 text-xs"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">CTR (%)</label>
                  <input
                    value={ctr}
                    onChange={(e) => setCtr(e.target.value)}
                    placeholder="e.g. 1.25"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">CPL (£)</label>
                  <input
                    value={cpl}
                    onChange={(e) => setCpl(e.target.value)}
                    placeholder="e.g. 6.40"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Spend (£) (optional)</label>
                  <input
                    value={spend}
                    onChange={(e) => setSpend(e.target.value)}
                    placeholder="e.g. 25"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Clicks (optional)</label>
                  <input
                    value={clicks}
                    onChange={(e) => setClicks(e.target.value)}
                    placeholder="e.g. 40"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Impressions (optional)</label>
                  <input
                    value={impressions}
                    onChange={(e) => setImpressions(e.target.value)}
                    placeholder="e.g. 2000"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Leads (optional)</label>
                  <input
                    value={leads}
                    onChange={(e) => setLeads(e.target.value)}
                    placeholder="e.g. 3"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-medium text-gray-700">
                    Reported at (optional)
                    <span className="ml-2 text-[11px] text-gray-500">(leave blank = now)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={reportedAt}
                    onChange={(e) => setReportedAt(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-[11px] text-gray-500">
                  This logs inside Root Health Ops. Users never touch Supabase.
                </div>

                <button
                  type="button"
                  onClick={submitLog}
                  disabled={saving}
                  className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save result"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
