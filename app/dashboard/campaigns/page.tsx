"use client";

import React, { useEffect, useMemo, useState } from "react";

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

type CampaignRecord = {
  id: string;
  organisation_id: string;
  name: string;
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
  created_at?: string | null;
  updated_at?: string | null;
  campaign_variants?: CampaignVariant[];
};

type ApiGetOut = {
  records: CampaignRecord[];
  organisationId?: string;
  error?: string;
};

function niceDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function clampText(s: string, max = 140) {
  const clean = (s || "").replace(/\s+/g, " ").trim();
  if (!clean) return "—";
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

function sortVariants(vars: CampaignVariant[]) {
  const order: Record<string, number> = { A: 1, B: 2, C: 3 };
  return [...vars].sort((a, b) => {
    const ak = String(a.ab_group || "").toUpperCase();
    const bk = String(b.ab_group || "").toUpperCase();
    return (order[ak] || 99) - (order[bk] || 99);
  });
}

export default function CampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [records, setRecords] = useState<CampaignRecord[]>([]);

  // Search (history list)
  const [q, setQ] = useState("");

  // Modal state (Log results)
  const [open, setOpen] = useState(false);
  const [modalCampaignId, setModalCampaignId] = useState<string | null>(null);
  const [modalVariantId, setModalVariantId] = useState<string | null>(null);
  const [modalCampaignName, setModalCampaignName] = useState<string | null>(null);
  const [modalVariantLabel, setModalVariantLabel] = useState<string | null>(null);

  const [reportedAt, setReportedAt] = useState("");
  const [ctr, setCtr] = useState("");
  const [cpl, setCpl] = useState("");
  const [spend, setSpend] = useState("");
  const [clicks, setClicks] = useState("");
  const [impressions, setImpressions] = useState("");
  const [leads, setLeads] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", { method: "GET", cache: "no-store" });
      const data: ApiGetOut = await res.json().catch(() => ({ records: [] } as any));

      if (!res.ok) throw new Error(data?.error || "Failed to load campaigns");
      setRecords(Array.isArray(data.records) ? data.records : []);
      setOrgId((data.organisationId || null) as any);
    } catch (e: any) {
      setError(e?.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return records;

    return records.filter((c) => {
      const name = String(c.name || "").toLowerCase();
      const platform = String(c.platform || "").toLowerCase();
      const objective = String(c.objective || "").toLowerCase();
      const status = String(c.status || "").toLowerCase();

      const vars = Array.isArray(c.campaign_variants) ? c.campaign_variants : [];
      const blob = vars
        .map((v) => `${v.ab_group || ""} ${v.headline || ""} ${v.primary_text || ""}`)
        .join(" ")
        .toLowerCase();

      return (
        name.includes(needle) ||
        platform.includes(needle) ||
        objective.includes(needle) ||
        status.includes(needle) ||
        blob.includes(needle)
      );
    });
  }, [records, q]);

  function openLogModal(args: { campaign: CampaignRecord; variant: CampaignVariant }) {
    setSaveError(null);
    setOpen(true);

    setModalCampaignId(args.campaign.id);
    setModalVariantId(args.variant.id);
    setModalCampaignName(args.campaign.name || "Campaign");
    setModalVariantLabel(String(args.variant.ab_group || "—").toUpperCase());

    // reset fields
    setReportedAt("");
    setCtr("");
    setCpl("");
    setSpend("");
    setClicks("");
    setImpressions("");
    setLeads("");
  }

  function closeLogModal() {
    setOpen(false);
    setModalCampaignId(null);
    setModalVariantId(null);
    setModalCampaignName(null);
    setModalVariantLabel(null);
    setSaveError(null);
  }

  async function submitLog() {
    if (!modalCampaignId || !modalVariantId) return;

    setSaving(true);
    setSaveError(null);

    try {
      const payload: any = {
        campaignId: modalCampaignId,
        variantId: modalVariantId,
        source: "manual",
      };

      if (reportedAt) payload.reported_at = new Date(reportedAt).toISOString();

      const ctrN: number | null = ctr.trim() === "" ? null : Number(ctr);
      const cplN: number | null = cpl.trim() === "" ? null : Number(cpl);

      if (ctr.trim() !== "" && !Number.isFinite(ctrN as number)) throw new Error("CTR must be a number (e.g. 1.25)");
      if (cpl.trim() !== "" && !Number.isFinite(cplN as number)) throw new Error("CPL must be a number (e.g. 6.40)");

      payload.ctr = ctrN;
      payload.cpl = cplN;

      const spendN: number | null = spend.trim() === "" ? null : Number(spend);
      if (spend.trim() !== "" && !Number.isFinite(spendN as number)) throw new Error("Spend must be a number");
      payload.spend = spendN;

      const clicksN: number | null = clicks.trim() === "" ? null : Number(clicks);
      const impressionsN: number | null = impressions.trim() === "" ? null : Number(impressions);
      const leadsN: number | null = leads.trim() === "" ? null : Number(leads);

      if (clicksN !== null) {
        if (!Number.isFinite(clicksN) || clicksN < 0) throw new Error("Clicks must be a whole number");
        payload.clicks = Math.round(clicksN);
      } else payload.clicks = null;

      if (impressionsN !== null) {
        if (!Number.isFinite(impressionsN) || impressionsN < 0) throw new Error("Impressions must be a whole number");
        payload.impressions = Math.round(impressionsN);
      } else payload.impressions = null;

      if (leadsN !== null) {
        if (!Number.isFinite(leadsN) || leadsN < 0) throw new Error("Leads must be a whole number");
        payload.leads = Math.round(leadsN);
      } else payload.leads = null;

      const res = await fetch("/api/campaigns/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const out = await res.json().catch(() => null);
      if (!res.ok || !out?.ok) throw new Error(out?.error || "Failed to log results");

      closeLogModal();
      await load();
    } catch (e: any) {
      setSaveError(e?.message || "Failed to log results");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Campaigns</h1>
              <p className="text-sm text-slate-300">
                Campaign history + variants. Log CTR/CPL results (no Supabase touching).
              </p>
              {orgId ? (
                <p className="text-[11px] text-slate-400 mt-1">
                  Org: <span className="text-slate-200">{orgId}</span>
                </p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <a
                href="/dashboard/campaigns/new"
                className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
              >
                + New campaign
              </a>
              <button
                onClick={() => load()}
                className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <label className="text-[11px] text-slate-300">Search campaigns + variants</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder='Try: "stress", "meta", "Leads", "Variant A"'
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div className="text-[11px] text-slate-400">
                Tip: your “snapshot” cards are built from Variant A/B/C so they never show blank.
              </div>
            </div>
          </div>
        </header>

        {loading ? <p className="text-sm text-slate-300">Loading…</p> : null}
        {error ? <p className="text-sm text-red-300">Error: {error}</p> : null}

        {!loading && !error && filtered.length === 0 ? (
          <p className="text-sm text-slate-300">No campaigns found.</p>
        ) : null}

        <div className="space-y-4">
          {filtered.map((c) => {
            const vars = sortVariants(Array.isArray(c.campaign_variants) ? c.campaign_variants : []);
            const snap = vars[0]?.primary_text ? clampText(vars[0].primary_text || "", 160) : "No variant text yet.";
            const headline = vars[0]?.headline ? clampText(vars[0].headline || "", 80) : "No headline yet.";

            return (
              <div key={c.id} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{c.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                      {c.platform ? (
                        <span className="px-2 py-0.5 rounded-full border border-white/10 bg-black/20">{c.platform}</span>
                      ) : null}
                      {c.objective ? (
                        <span className="px-2 py-0.5 rounded-full border border-white/10 bg-black/20">{c.objective}</span>
                      ) : null}
                      {c.status ? (
                        <span className="px-2 py-0.5 rounded-full border border-white/10 bg-black/20">{c.status}</span>
                      ) : null}
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400">Updated: {niceDate(c.updated_at || c.created_at || null)}</span>
                    </div>
                  </div>

                  <a
                    href={`/dashboard/campaigns/${encodeURIComponent(c.id)}`}
                    className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
                  >
                    Open
                  </a>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[11px] text-slate-400">Snapshot (from Variant A)</div>
                  <div className="mt-1 text-sm text-slate-100 font-semibold">{headline}</div>
                  <div className="mt-1 text-[12px] text-slate-300">{snap}</div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {vars.map((v) => (
                    <div key={v.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                          Variant {String(v.ab_group || "—").toUpperCase()}
                        </span>
                        <button
                          onClick={() => openLogModal({ campaign: c, variant: v })}
                          className="text-[11px] rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200 hover:bg-emerald-500/20"
                        >
                          Log Results
                        </button>
                      </div>

                      <div>
                        <div className="text-[12px] font-semibold text-slate-100 line-clamp-2">{v.headline || "No headline"}</div>
                        <div className="mt-1 text-[11px] text-slate-300 line-clamp-4">{v.primary_text ? clampText(v.primary_text, 220) : "No primary text"}</div>
                      </div>

                      <div className="text-[11px] text-slate-500">
                        Updated: <span className="text-slate-300">{niceDate(v.updated_at || v.created_at || null)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-[11px] text-slate-500">
                  Results history feeds Metrics → Campaign Coach (CTR/CPL trends + AI recommendations).
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  Log Results — {modalCampaignName} / Variant {modalVariantLabel}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Add what the ad platform reported. No Supabase access needed.
                </div>
              </div>
              <button
                onClick={closeLogModal}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {saveError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {saveError}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Reported at (optional)</label>
                <input
                  type="datetime-local"
                  value={reportedAt}
                  onChange={(e) => setReportedAt(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Spend (£) (optional)</label>
                <input
                  value={spend}
                  onChange={(e) => setSpend(e.target.value)}
                  placeholder="e.g. 25.50"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">CTR (%) (optional)</label>
                <input
                  value={ctr}
                  onChange={(e) => setCtr(e.target.value)}
                  placeholder="e.g. 1.25"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100"
                />
                <div className="text-[11px] text-slate-500">Enter “1.25” for 1.25%.</div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">CPL (£) (optional)</label>
                <input
                  value={cpl}
                  onChange={(e) => setCpl(e.target.value)}
                  placeholder="e.g. 6.40"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Clicks (optional)</label>
                <input
                  value={clicks}
                  onChange={(e) => setClicks(e.target.value)}
                  placeholder="e.g. 120"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Impressions (optional)</label>
                <input
                  value={impressions}
                  onChange={(e) => setImpressions(e.target.value)}
                  placeholder="e.g. 8500"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-[11px] text-slate-300">Leads (optional)</label>
                <input
                  value={leads}
                  onChange={(e) => setLeads(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="text-[11px] text-slate-500">
                You can log just CTR + CPL to unlock coaching — the rest is optional.
              </div>

              <button
                onClick={() => void submitLog()}
                disabled={saving}
                className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save results"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
