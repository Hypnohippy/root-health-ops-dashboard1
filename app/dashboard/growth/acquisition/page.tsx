"use client";
import { useCallback, useEffect, useState } from "react";

type Event = { id: string; action: string; previous_status: string; new_status: string; outcome: string | null; note: string | null; created_at: string };
type Item = { id: string; record_type: string; source_engine: string; source_record_id: string; source_url: string | null; evidence: string | null; entity: string | null; person: string | null; company: string | null; reason: string | null; signal: string | null; suggested_action: string | null; status: string; current_action: string | null; actioned_at: string | null; outcome: string | null; outcome_at: string | null; metadata: Record<string, unknown>; acquisition_item_events?: Event[] };
type Action = { id: string; label: string; route?: boolean; outcome?: boolean };
const statuses = ["new", "reviewing", "accepted", "actioned", "engaged", "converted", "nurture", "lost", "dismissed"];
const typeLabels: Record<string, string> = { b2b_lead: "B2B lead", personal_opportunity: "Personal opportunity", partner_opportunity: "Partner opportunity", social_opportunity: "Social opportunity" };
const actions: Record<string, Action[]> = {
  b2b_lead: [{id:"start_review",label:"Start review"},{id:"accept",label:"Accept"},{id:"dismiss",label:"Dismiss"},{id:"prepare_outreach",label:"Prepare outreach",route:true},{id:"route_outreach",label:"Open outreach workflow",route:true},{id:"nurture",label:"Follow up / nurture"}],
  personal_opportunity: [{id:"start_review",label:"Start review"},{id:"accept",label:"Accept"},{id:"dismiss",label:"Dismiss"},{id:"create_content_draft",label:"Create content draft",route:true},{id:"route_campaign",label:"Open Campaign Studio",route:true},{id:"route_publishing",label:"Open Publishing",route:true},{id:"mark_actioned",label:"Mark actioned"}],
  partner_opportunity: [{id:"start_review",label:"Start review"},{id:"accept",label:"Accept"},{id:"dismiss",label:"Dismiss"},{id:"prepare_outreach",label:"Prepare outreach",route:true},{id:"route_outreach",label:"Open outreach workflow",route:true},{id:"nurture",label:"Follow up / nurture"}],
  social_opportunity: [{id:"start_review",label:"Start review"},{id:"accept",label:"Accept"},{id:"dismiss",label:"Dismiss"},{id:"create_content_draft",label:"Create content draft",route:true},{id:"route_publishing",label:"Open Publishing",route:true},{id:"route_responses",label:"Open Responses",route:true},{id:"mark_actioned",label:"Mark actioned"}],
};
const transitionActions: Record<string, string[]> = {
  start_review:["new"], accept:["new","reviewing","nurture"], dismiss:["new","reviewing","accepted","nurture"], prepare_outreach:["accepted","reviewing","nurture"], route_outreach:["accepted","reviewing","nurture"],
  create_content_draft:["accepted","reviewing","nurture"], route_campaign:["accepted","reviewing","nurture"], route_publishing:["accepted","reviewing","nurture"], route_responses:["accepted","reviewing","nurture"], mark_actioned:["accepted","reviewing","nurture"],
  nurture:["reviewing","accepted","actioned","engaged"], mark_engaged:["actioned","nurture"], mark_converted:["actioned","engaged","nurture"], mark_lost:["reviewing","accepted","actioned","engaged","nurture"],
};
const outcomeActions: Action[] = [{id:"mark_engaged",label:"Engaged",outcome:true},{id:"mark_converted",label:"Converted",outcome:true},{id:"mark_lost",label:"Lost",outcome:true}];
const preparedKeys = ["prepared_outreach", "outreach_draft", "prepared_draft", "content_draft", "reply_draft", "draft"];
function preparedText(metadata: Record<string, unknown>) { for (const key of preparedKeys) if (typeof metadata[key] === "string" && metadata[key].trim()) return metadata[key].trim(); return ""; }
function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()); }

export default function AcquisitionQueue() {
  const [organisationId, setOrganisationId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => { setOrganisationId(new URLSearchParams(window.location.search).get("organisationId") || ""); }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!organisationId) return;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ organisationId, page: String(page), status });
      const res = await fetch(`/api/growth/acquisition?${params}`, { signal, cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Unable to load queue.");
      setItems(data.items); setTotal(data.total);
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load queue."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [organisationId, page, status]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function act(item: Item, action: Action) {
    let outcome: string | undefined;
    if (action.outcome) {
      outcome = window.prompt(`Optional note for ${action.label.toLowerCase()}:`) || action.label.toLowerCase();
      if (!outcome) return;
    }
    setBusy(`${item.id}:${action.id}`); setError("");
    try {
      const res = await fetch(`/api/growth/acquisition/${encodeURIComponent(item.id)}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId, action: action.id, outcome, note: notes[item.id] || null, idempotencyKey: crypto.randomUUID() }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Unable to update item.");
      await load();
      if (action.route && data.destination) window.location.assign(data.destination);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update item."); }
    finally { setBusy(""); }
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <div><h1 className="text-2xl font-semibold">Acquisition queue</h1><p className="mt-2 text-slate-600">Review opportunities, choose the next action, then continue in the existing Ops workflow. Nothing here sends, publishes or replies automatically.</p></div>
    {!organisationId && <form method="get" className="flex flex-wrap items-end gap-2"><label className="grid gap-1">Organisation ID<input name="organisationId" required className="rounded border p-2" /></label><button className="rounded bg-slate-900 px-4 py-2 text-white">Open queue</button></form>}
    {organisationId && <><label className="flex items-center gap-2">Status<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} className="rounded border p-2"><option value="">All</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>
      {loading && <p role="status">Loading opportunities…</p>}{error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
      {!loading && !error && items.length === 0 && <p>No imported opportunities yet for this selection.</p>}
      <div className="grid gap-4">{items.map(item => {
        const draft = preparedText(item.metadata || {});
        const available = [...(actions[item.record_type] || []), ...outcomeActions].filter(action => transitionActions[action.id]?.includes(item.status));
        const history = [...(item.acquisition_item_events || [])].sort((a,b) => b.created_at.localeCompare(a.created_at));
        return <article key={item.id} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">{typeLabels[item.record_type] || title(item.record_type)}</span><h2 className="mt-2 text-lg font-semibold">{item.entity || item.company || item.person || typeLabels[item.record_type]}</h2><p className="text-sm text-slate-500">{item.source_engine} · {title(item.status)}</p></div>{item.current_action && <div className="text-right text-sm"><strong>Current action</strong><div>{title(item.current_action)}</div>{item.outcome && <div>Outcome: {item.outcome}</div>}</div>}</div>
          {(item.person || item.company) && <p>{[item.person, item.company].filter(Boolean).join(" · ")}</p>}
          {item.reason && <p className="whitespace-pre-wrap"><strong>Why it matters: </strong>{item.reason}</p>}{item.signal && <p className="whitespace-pre-wrap"><strong>Signal: </strong>{item.signal}</p>}{item.suggested_action && <p className="rounded bg-amber-50 p-3 whitespace-pre-wrap"><strong>Suggested next step: </strong>{item.suggested_action}</p>}
          {draft && <details open={item.record_type === "partner_opportunity" || item.record_type === "social_opportunity"}><summary className="cursor-pointer font-medium">Prepared draft</summary><div className="mt-2 rounded bg-slate-50 p-3 whitespace-pre-wrap">{draft}</div><button type="button" className="mt-2 text-sm underline" onClick={() => navigator.clipboard.writeText(draft)}>Copy draft</button></details>}
          {item.evidence && <details><summary className="cursor-pointer font-medium">Source evidence</summary><p className="mt-2 whitespace-pre-wrap">{item.evidence}</p></details>}{item.source_url && /^https?:\/\//i.test(item.source_url) && <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="inline-block underline">Open source</a>}
          {available.length > 0 ? <div className="space-y-2"><label className="grid max-w-xl gap-1 text-sm">Internal note (optional)<input value={notes[item.id] || ""} onChange={e => setNotes(n => ({...n,[item.id]:e.target.value}))} maxLength={2000} className="rounded border p-2" /></label><div className="flex flex-wrap gap-2">{available.map(action => <button type="button" key={action.id} disabled={!!busy} onClick={() => void act(item, action)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{busy === `${item.id}:${action.id}` ? "Saving…" : action.label}</button>)}</div></div> : <p className="text-sm text-slate-500">This item has reached a final state.</p>}
          <details><summary className="cursor-pointer font-medium">History and import details</summary>{history.length ? <ol className="mt-2 space-y-2">{history.map(event => <li key={event.id} className="text-sm">{new Date(event.created_at).toLocaleString()}: {title(event.action)} ({title(event.previous_status)} → {title(event.new_status)}){event.note ? ` — ${event.note}` : ""}</li>)}</ol> : <p className="mt-2 text-sm">No queue actions yet.</p>}<p className="mt-3 text-sm">Source record: {item.source_record_id}</p><pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{JSON.stringify(item.metadata, null, 2)}</pre></details>
        </article>;
      })}</div>
      {!error && <nav aria-label="Queue pages" className="flex items-center gap-4"><button disabled={loading || page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page + 1} · {total} items</span><button disabled={loading || (page + 1) * 25 >= total} onClick={() => setPage(p => p + 1)}>Next</button></nav>}
    </>}
  </main>;
}
