"use client";

import { useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenantFetch";

type Target = { id: string; target_name: string | null; linkedin_identity: string | null; linkedin_url: string | null;
  stage: string | null; status: string | null; source_type: string | null; source_record_id: string | null };
type Result = { exists: boolean; matchType: "linkedin" | "name"; matches: Target[] };

export default function LifecycleContactLookup() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || !query.trim()) return;
    inFlight.current = true; setBusy(true); setResult(null); setError(null);
    try {
      const response = await tenantFetch(`/api/growth/lifecycle/lookup?q=${encodeURIComponent(query.trim())}`, { method: "GET", credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) setError(typeof data.error === "string" ? data.error : `Lookup failed (HTTP ${response.status}).`);
      else if (typeof data.exists === "boolean" && ["linkedin", "name"].includes(data.matchType) && Array.isArray(data.matches)) setResult(data);
      else setError("Unexpected lookup response.");
    } catch { setError("Lookup could not be completed. Try again manually."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="mt-4 border-t border-slate-700 pt-3">
    <form onSubmit={lookup}>
      <label htmlFor="lifecycle-contact-query" className="block font-semibold">Lookup lifecycle contact</label>
      <p className="my-2 text-slate-400">Read-only. Enter a LinkedIn profile URL / identity or a name.</p>
      <input id="lifecycle-contact-query" value={query} required maxLength={300} disabled={busy}
        onChange={event => { setQuery(event.target.value); setResult(null); setError(null); }}
        className="mr-2 w-full max-w-md rounded border border-slate-600 bg-slate-950 p-2 text-white" />
      <button type="submit" disabled={busy || !query.trim()} className="mt-2 rounded border border-slate-600 px-3 py-2 disabled:opacity-50">{busy ? "Looking up…" : "Lookup lifecycle contact"}</button>
    </form>
    <div role="status" aria-live="polite" aria-busy={busy} className="mt-2">
      {error && <p className="text-red-300">{error}</p>}
      {result && <>
        <p>Matching growth_target exists: {result.exists ? "Yes" : "No"}{result.matchType === "name" ? " (name search only; identity not verified)" : " (LinkedIn identity match)"}</p>
        {result.matches.length > 1 && <p>Multiple matching records; no single target selected.</p>}
        {result.matches.map(target => <dl key={target.id} className="my-3 break-words rounded border border-slate-700 p-2">
          <dt>Target name</dt><dd>{target.target_name || "—"}</dd>
          <dt>LinkedIn identity</dt><dd>{target.linkedin_identity || "—"}</dd>
          <dt>LinkedIn URL</dt><dd>{target.linkedin_url || "—"}</dd>
          <dt>Stage</dt><dd>{target.stage || "—"}</dd>
          <dt>Status</dt><dd>{target.status || "—"}</dd>
          <dt>source_type</dt><dd>{target.source_type || "—"}</dd>
          <dt>source_record_id</dt><dd>{target.source_record_id || "—"}</dd>
        </dl>)}
      </>}
    </div>
  </section>;
}
