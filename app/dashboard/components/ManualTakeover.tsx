"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
type Preview = { allowed: boolean; reason: string; revision: string; stage: string; intended: string; name: string; sourceUrl: string | null; message: string };
export default function ManualTakeover({ organisationId, table, id, onComplete }: { organisationId: string; table: "inbox_items" | "growth_targets"; id: string; onComplete?: () => void | Promise<void> }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null), [status, setStatus] = useState("");
  const [evidence, setEvidence] = useState(""), [message, setMessage] = useState(""), [at, setAt] = useState("");
  const [confirmed, setConfirmed] = useState(false), [sourceChecked, setSourceChecked] = useState(false), [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const selectedOrganisation = () => organisationId || new URLSearchParams(window.location.search).get("organisationId") || "";
  async function prepare() {
    setBusy(true);
    try {
      const r = await fetch(`/api/operations/manual-complete?${new URLSearchParams({ organisationId: selectedOrganisation(), table, id })}`, { cache: "no-store" });
      const data = await r.json(); if (!r.ok) throw Error(data.error);
      setPreview(data); setMessage(data.message || ""); setKey(crypto.randomUUID()); setConfirmed(false); setSourceChecked(false); setStatus("");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Unable to verify action."); } finally { setBusy(false); }
  }
  async function complete() {
    if (!preview || !at) return;
    setBusy(true);
    try {
      const r = await fetch("/api/operations/manual-complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: selectedOrganisation(), table, id, revision: preview.revision, key, completedAt: new Date(at).toISOString(), evidence, message, confirmed, sourceChecked }) });
      const data = await r.json(); if (!r.ok) throw Error(data.error);
      setPreview({ ...preview, allowed: false }); setStatus(data.reconciliationErrors?.length ? "Manual completion recorded. Related lifecycle reconciliation is pending; refresh or retry the receipt without repeating the action." : "Manual completion recorded. No message sent by Ops. Current state refreshed.");
      await onComplete?.(); router.refresh();
    } catch (e) { setStatus(e instanceof Error ? e.message : "Outcome uncertain. Retry this receipt; do not repeat the external action."); } finally { setBusy(false); }
  }
  return <section className="mt-3 space-y-2 rounded-xl border border-amber-400/25 p-3 text-sm" aria-label="Manual takeover and recovery">
    <button disabled={busy} onClick={() => void prepare()} className="text-amber-200 underline">Verify manual takeover / refresh current state</button>
    {preview && <><p>{preview.name} · {preview.stage.replaceAll("_", " ")}</p><p>Intended: {preview.intended || "Review current workflow"}. {preview.reason}</p>
      {preview.sourceUrl && /^https?:\/\//i.test(preview.sourceUrl) && <a className="mr-3 text-emerald-300 underline" href={preview.sourceUrl} target="_blank" rel="noreferrer">Open source</a>}
      {preview.allowed && <><p>Record only work actually completed. If an earlier attempt timed out, verify the provider outcome and cancel any outstanding source delivery first.</p>
        <label className="block">Actual message / action<textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={50000} className="block w-full rounded bg-slate-900 p-2" /></label>
        <button onClick={() => { void navigator.clipboard.writeText(message).then(() => setStatus("Copied for human review."), () => setStatus("Copy unavailable; select the text manually.")); }} className="text-emerald-300 underline">Copy</button>
        <label className="block">Actual completion time<input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className="ml-2 bg-slate-900 p-2" /></label>
        <label className="block">Evidence / provider receipt / public reply URL<input value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={2000} className="block w-full bg-slate-900 p-2" /></label>
        <label className="block"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I verified this action completed, not merely attempted.</label>
        <label className="block"><input type="checkbox" checked={sourceChecked} onChange={e => setSourceChecked(e.target.checked)} /> I verified the source outcome and no outstanding delivery can repeat it.</label>
        <button disabled={busy || !confirmed || !sourceChecked || !evidence.trim() || !at} onClick={() => void complete()} className="rounded border border-emerald-400/30 px-3 py-2 disabled:opacity-40">Mark manually complete</button>
      </>}
    </>}{status && <p role="status">{status}</p>}
  </section>;
}
