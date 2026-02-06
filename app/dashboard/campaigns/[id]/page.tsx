// app/dashboard/campaigns/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tone = "good" | "warn" | "info";

function pillClasses(tone: Tone) {
  if (tone === "good") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (tone === "warn") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-slate-500/40 bg-white/5 text-slate-200";
}

function niceDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleString();
}

function clampText(s: string, max = 140) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function formatPct(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  // supports both 0.034 and 3.4 inputs
  if (n <= 1) return `${Math.round(n * 1000) / 10}%`;
  return `${Math.round(n * 10) / 10}%`;
}

function formatMoney(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `£${Math.round(n * 100) / 100}`;
}

type Variant = {
  id: string;
  ab_group: string | null;
  headline: string | null;
  primary_text: string | null;
  media_url?: string | null;
  video_url?: string | null;
  status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type Campaign = {
  id: string;
  name: string | null;
  platform: string | null;
  objective: string | null;
  status: string | null;
  updated_at: string | null;
  created_at: string | null;
  campaign_variants?: Variant[];
};

type ApiOut = {
  ok: boolean;
  error?: string;
  organisationId?: string;
  campaign?: Campaign;
  latestByVariant?: Record<string, { ctr: number | null; cpl: number | null; at: string | null }>;
};

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const campaignId = String(params?.id || "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiOut | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, { cache: "no-store" });
      const json: ApiOut = await res.json().catch(() => ({ ok: false, error: "Invalid JSON from server." } as any));

      if (!res.ok || !json.ok) {
        setError(json?.error || `Failed to load campaign (${res.status})`);
        setData(json);
        return;
      }

      setData(json);
    } catch (e: any) {
      setError(e?.message || "Failed to load campaign.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!campaignId) {
      setError("Missing campaign id in URL.");
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const campaign = data?.campaign;

  const variants = useMemo(() => {
    const arr = Array.isArray(campaign?.campaign_variants) ? [...(campaign!.campaign_variants as Variant[])] : [];
    const order: Record<string, number> = { A: 1, B: 2, C: 3 };
    arr.sort((a, b) => (order[String(a.ab_group || "").toUpperCase()] || 99) - (order[String(b.ab_group || "").toUpperCase()] || 99));
    return arr;
  }, [campaign]);

  const latestByVariant = data?.latestByVariant || {};

  // Simple coach note if no history yet
  function coachNoteFor(v: Variant): { tone: Tone; title: string; detail: string } {
    const latest = latestByVariant[v.id];
    if (!latest) {
      return {
        tone: "info",
        title: "No results logged yet",
        detail: "This variant is ready for history tracking. Add CTR/CPL results to identify what to repeat.",
      };
    }

    const ctr = latest.ctr;
    const cpl = latest.cpl;

    if ((ctr ?? 0) > 0 && (cpl ?? 9999) > 0) {
      return {
        tone: "good",
        title: "Results detected",
        detail: `CTR ${formatPct(ctr)} · CPL ${formatMoney(cpl)}. Keep testing small tweaks (headline + first line) to improve efficiency.`,
      };
    }

    return {
      tone: "info",
      title: "Partial results",
      detail: "You have some numbers logged. Add the missing metric to unlock clearer coaching.",
    };
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Campaign</h1>
            <p className="text-sm text-slate-300 mt-1">
              Platform: <span className="text-slate-100">{campaign?.platform || "—"}</span> · Objective:{" "}
              <span className="text-slate-100">{campaign?.objective || "—"}</span> · Status:{" "}
              <span className="text-slate-100">{campaign?.status || "—"}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              Updated: <span className="text-slate-200">{niceDate(campaign?.updated_at || campaign?.created_at || null)}</span>
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="/dashboard/campaigns"
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
            >
              ← Back to campaigns
            </a>
            <button
              onClick={() => load()}
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        </header>

        {loading ? <p className="text-sm text-slate-300">Loading…</p> : null}

        {!loading && error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100">
            {error}
            <div className="text-[11px] text-red-200/80 mt-2">
              If this keeps happening, it means the API route didn’t return the campaign (or Supabase columns don’t match).
            </div>
          </div>
        ) : null}

        {!loading && !error && campaign ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg">
              <div className="text-sm font-semibold text-slate-100">{campaign.name || "Untitled campaign"}</div>
              <div className="text-[11px] text-slate-400 mt-1">ID: {campaign.id}</div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {variants.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  No variants yet.
                </div>
              ) : (
                variants.map((v) => {
                  const latest = latestByVariant[v.id];
                  const note = coachNoteFor(v);

                  return (
                    <div key={v.id} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20">
                          Variant {v.ab_group || "—"}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {niceDate(latest?.at || v.updated_at || v.created_at || null)}
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-slate-100">
                          {v.headline || "No headline"}
                        </div>
                        <div className="text-xs text-slate-300 mt-1 whitespace-pre-wrap">
                          {clampText(v.primary_text || "", 220) || "(no primary text)"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-slate-200">
                          CTR: <span className="text-slate-100">{formatPct(latest?.ctr ?? null)}</span>
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-slate-200">
                          CPL: <span className="text-slate-100">{formatMoney(latest?.cpl ?? null)}</span>
                        </span>
                      </div>

                      <div className={`rounded-2xl border p-3 ${pillClasses(note.tone)}`}>
                        <div className="text-[12px] font-semibold">{note.title}</div>
                        <div className="text-[11px] mt-1 text-slate-200/90">{note.detail}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
