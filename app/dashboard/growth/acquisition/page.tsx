"use client";
import { useEffect, useState } from "react";
type Item = { id: string; record_type: string; source_engine: string; source_record_id: string; source_url: string | null; evidence: string | null; entity: string | null; person: string | null; company: string | null; reason: string | null; signal: string | null; suggested_action: string | null; status: string; metadata: Record<string, unknown> };
export default function AcquisitionQueue() {
  const [organisationId, setOrganisationId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { setOrganisationId(new URLSearchParams(window.location.search).get("organisationId") || ""); }, []);
  useEffect(() => {
    if (!organisationId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(""); setItems([]);
      try {
        const params = new URLSearchParams({ organisationId, page: String(page), status });
        const res = await fetch(`/api/growth/acquisition?${params}`, { signal: controller.signal, cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw Error(data.error || "Unable to load queue.");
        setItems(data.items); setTotal(data.total);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load queue."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [organisationId, page, status]);
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <h1 className="text-2xl font-semibold">Acquisition queue</h1>
    <p>Opportunities imported from your lead engines for review. Importing does not send messages or publish content.</p>
    {!organisationId && <form method="get" className="space-x-2"><label>Organisation ID <input name="organisationId" required className="rounded border p-2" /></label><button className="rounded border p-2">Open queue</button></form>}
    {organisationId && <>
      <label>Status <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} className="rounded border p-2">
        <option value="">All</option>{["new", "reviewing", "accepted", "dismissed"].map(s => <option key={s}>{s}</option>)}
      </select></label>
      {loading && <p role="status">Loading opportunities…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && items.length === 0 && <p>No imported opportunities yet for this selection.</p>}
      {items.map(item => <article key={item.id} className="space-y-2 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">{item.entity || item.company || item.person || item.record_type.replaceAll("_", " ")}</h2>
        <p>{item.record_type.replaceAll("_", " ")} · {item.status} · {item.source_engine}</p>
        {(item.person || item.company) && <p>{[item.person, item.company].filter(Boolean).join(" · ")}</p>}
        {item.reason && <p className="whitespace-pre-wrap"><strong>Why it matters: </strong>{item.reason}</p>}
        {item.signal && <p className="whitespace-pre-wrap"><strong>Signal: </strong>{item.signal}</p>}
        {item.suggested_action && <p className="whitespace-pre-wrap"><strong>Suggested action: </strong>{item.suggested_action}</p>}
        {item.evidence && <details><summary>Source evidence</summary><p className="whitespace-pre-wrap">{item.evidence}</p></details>}
        {item.source_url && /^https?:\/\//i.test(item.source_url) && <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="underline">Open source</a>}
        <details><summary>Import details</summary><p>Source record: {item.source_record_id}</p><pre className="overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify(item.metadata, null, 2)}</pre></details>
      </article>)}
      {!error && <nav aria-label="Queue pages" className="flex items-center gap-4">
        <button disabled={loading || page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
        <span>Page {page + 1} · {total} items</span>
        <button disabled={loading || (page + 1) * 25 >= total} onClick={() => setPage(p => p + 1)}>Next</button>
      </nav>}
    </>}
  </main>;
}
