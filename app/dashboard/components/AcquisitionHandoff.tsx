"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
type Item = { id: string; entity?: string; person?: string; company?: string; evidence?: string; source_url?: string; suggested_action?: string; status: string; metadata?: Record<string, unknown> & { handoff?: { destination?: string } } };
/** Consume the existing durable handoff; no new draft, send or lifecycle mutation. */
export default function AcquisitionHandoff() {
  const pathname = usePathname();
  const selection = useSearchParams().toString();
  const [item, setItem] = useState<Item | null>(null), [error, setError] = useState("");
  const [sourceLink, setSourceLink] = useState("");
  const [loadedSelection, setLoadedSelection] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(selection), id = params.get("acquisitionItemId"), org = params.get("organisationId");
    const controller = new AbortController();
    if (!id || !org) return;
    const query = new URLSearchParams({ organisationId: org, itemId: id });
    fetch(`/api/growth/acquisition?${query}`, { cache: "no-store", signal: controller.signal }).then(async r => {
      const data = await r.json(); const record = data.items?.[0];
      if (!r.ok || !record || record.metadata?.handoff?.destination !== pathname || !record.acquisition_item_events?.some((event: { idempotency_key: string; action: string }) => event.idempotency_key === record.metadata.handoff.idempotency_key && event.action === record.metadata.handoff.action)) throw Error("No verified handoff for this workflow. Return to Acquisition and route it again.");
      if (controller.signal.aborted) return;
      setItem(record); setError(""); setLoadedSelection(selection); setSourceLink(`/dashboard/growth/acquisition?${query}`);
    }).catch(e => { if (!controller.signal.aborted) { setLoadedSelection(selection); setError(e.message || "Unable to load handoff."); } });
    return () => controller.abort();
  }, [pathname, selection]);
  if (loadedSelection !== selection) return null;
  if (error) return <p role="alert" className="mb-4 rounded-xl border border-amber-400/30 p-4">{error}</p>;
  if (!item) return null;
  const draft = [item.metadata?.prepared_outreach, item.metadata?.outreach_draft, item.metadata?.content_draft, item.metadata?.reply_draft].find(v => typeof v === "string") as string | undefined;
  return <section className="mb-4 space-y-2 rounded-xl border border-emerald-400/30 bg-slate-950 p-4" aria-label="Acquisition handoff">
    <p className="font-semibold">Handoff recorded: {item.person || item.entity || item.company || "Opportunity"}</p>
    <p>Current source state: {item.status}. Review the source context and complete the next step in this workflow. No delivery or conversion is claimed.</p>
    <p className="whitespace-pre-wrap">{item.evidence}</p><p>{item.suggested_action}</p>
    {draft && <><pre className="whitespace-pre-wrap font-sans">{draft}</pre><button onClick={() => void navigator.clipboard.writeText(draft).catch(() => setError("Copy unavailable; select the draft text manually."))}>Copy prepared context</button></>}
    {item.source_url && /^https?:\/\//i.test(item.source_url) && <a className="mr-4 underline" href={item.source_url} target="_blank" rel="noreferrer">Open source</a>}
    <a className="underline" href={sourceLink}>Open acquisition evidence and history</a>
  </section>;
}
