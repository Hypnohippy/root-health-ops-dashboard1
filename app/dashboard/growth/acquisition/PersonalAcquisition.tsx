"use client";
import { useCallback, useEffect, useState } from "react";
import type { OpportunityGroup } from "@/lib/acquisitionPresentation";
import type { PersonalPerformance } from "@/lib/personalDistribution";
import PersonalOpportunityCard from "./PersonalOpportunityCard";

export default function PersonalAcquisition({ organisationId }: { organisationId: string }) {
  const [category, setCategory] = useState(""), [state, setState] = useState(""), [page, setPage] = useState(0);
  const [groups, setGroups] = useState<(OpportunityGroup & { personalPerformance?: PersonalPerformance })[]>([]), [total, setTotal] = useState(0), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(""); try { const res = await fetch(`/api/growth/acquisition/personal?${new URLSearchParams({ organisationId, category, state, page: String(page) })}`, { cache: "no-store", signal }); const data = await res.json(); if (!res.ok) throw Error(data.error || "Unable to load opportunities."); if (!signal?.aborted) { setGroups(data.groups); setTotal(data.total); } } catch (e) { if (!signal?.aborted) { setGroups([]); setTotal(0); setError(e instanceof Error ? e.message : "Unable to load opportunities."); } } finally { if (!signal?.aborted) setLoading(false); } }, [organisationId, category, state, page]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const categories = [["", "All Personal"], ["people", "People & conversations"], ["content", "Content opportunities"], ["partners", "Partners & referrers"], ["review", "Needs source review"]];
  return <section className="space-y-4" aria-label="Personal Acquisition">
    <nav aria-label="Opportunity categories" className="flex flex-wrap gap-2">{categories.map(([value, label]) => <button key={value} aria-pressed={category === value} className={`rounded-xl border px-3 py-2 text-sm ${category === value ? "border-emerald-400 bg-emerald-400/10" : "border-white/15"}`} onClick={() => { setGroups([]); setCategory(value); setPage(0); }}>{label}</button>)}<a className="rounded-xl border border-white/15 px-3 py-2 text-sm" href={`/dashboard/growth/acquisition?${new URLSearchParams({ organisationId, record_type: "b2b_lead" })}`}>Commercial</a></nav>
    <div className="flex flex-wrap items-center gap-3"><label>Show <select className="rounded-lg bg-slate-900 p-2" value={state} onChange={e => { setGroups([]); setState(e.target.value); setPage(0); }}><option value="">All opportunities</option><option value="decide">To decide</option><option value="progress">In progress</option><option value="saved">Saved for later</option><option value="completed">Completed / closed</option></select></label><span className="text-sm text-slate-400">{total} opportunities</span></div>
    {loading && <p role="status">Loading opportunities…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && !groups.length && <p>No opportunities in this view.</p>}
    {groups.map(group => <PersonalOpportunityCard key={`${organisationId}:${group.item.id}`} group={group} organisationId={organisationId} onSaved={() => load()}/>)}
    <nav aria-label="Personal opportunity pages" className="flex gap-3"><button disabled={loading || page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>{page + 1} / {Math.max(1, Math.ceil(total / 25))}</span><button disabled={loading || (page + 1) * 25 >= total} onClick={() => setPage(page + 1)}>Next</button></nav>
  </section>;
}
