"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenantFetch";
import type { LinkedInInvitationItem } from "@/lib/linkedinInvitation";

type ViewItem = LinkedInInvitationItem & { rehearsal?: boolean };
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";
export function InvitationCard({ item, organisationId, readOnly, onChanged }: { item: ViewItem; organisationId: string; readOnly: boolean; onChanged: (item: ViewItem, message: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false), request = useRef<AbortController | null>(null);
  useEffect(() => { const current = request; return () => current.current?.abort(); }, []);
  async function act(action: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice("");
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await tenantFetch("/api/growth/linkedin-invitations", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId, id: item.id, version: item.version, key: crypto.randomUUID(), action, confirmed, dryRun: readOnly }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Action failed. Nothing was lost.");
      if (action === "draft_note") { setNote(data.note); setNotice("Connection note ready — edit and send manually if appropriate."); }
      else { const message = data.readOnly ? "Preview rehearsal only — nothing saved and no invitation sent. Reload restores the live state." : action === "invitation_sent" ? "Invitation recorded — awaiting verified acceptance. No message or cadence started." : action === "save" ? "Saved for later." : "Dismissed."; setNotice(message); onChanged(data.item, message); }
    } catch (error) { setNotice(error instanceof Error && error.name !== "AbortError" ? error.message : "Request could not finish. Your note is retained; retry safely."); }
    finally { clearTimeout(timeout); lock.current = false; setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(note); setNotice("Current connection note copied. No invitation was sent or recorded."); }
    catch { setNotice("Clipboard unavailable — select and copy the note below. Nothing was sent or recorded."); }
  }
  const canInvite = item.state === "to_connect";
  return <article aria-label={`Connection opportunity for ${item.name}`} className="space-y-3 rounded-xl border border-white/15 bg-slate-900/50 p-4">
    <p className="text-sm text-emerald-300">{item.state === "pending" ? item.rehearsal ? "Invitation pending — Preview rehearsal" : "Invitation sent / Awaiting acceptance" : "To connect — not connected"}{item.saved ? " · Saved for later" : ""}</p>
    <h2 className="text-xl font-semibold">{item.name}</h2>
    {item.role && <p>{item.role}</p>}{item.company && <p>{item.company}</p>}
    <p className="text-sm">{item.category}</p><p>{item.reason}</p>{item.context && item.context !== item.reason && <p className="text-sm text-slate-300">{item.context}</p>}
    <p className="text-xs text-slate-400">Source: {item.source.replaceAll("_", " ")}</p>
    <a className={`${button} inline-block`} href={item.profile} target="_blank" rel="noopener noreferrer">Open profile</a>
    <p className="break-all text-xs text-slate-400">{item.profile}</p>
    {canInvite && <div className="space-y-3">
      <button className={button} disabled={busy} onClick={() => void act("draft_note")}>{busy ? "Working…" : "Draft connection note"}</button>
      <label className="grid gap-2">Connection note (editable, maximum 200 characters)<textarea className="min-h-28 rounded-lg border border-white/20 bg-slate-950 p-3" value={note} maxLength={200} onChange={e => setNote(e.target.value)}/></label>
      <button className={button} disabled={busy || !note.trim()} onClick={() => void copy()}>Copy connection note</button>
      <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/>{readOnly ? "Rehearse invitation pending without saving" : "I sent this invitation manually on LinkedIn"}</label>
      <button className={button} disabled={busy || !confirmed} onClick={() => void act("invitation_sent")}>{readOnly ? "Rehearse Mark invitation sent" : "Mark invitation sent"}</button>
    </div>}
    {item.invitationSentAt && <p className="text-sm">{item.rehearsal ? "Proposed invitation confirmation time (not saved): " : "Invitation confirmed: "}{new Date(item.invitationSentAt).toLocaleString("en-GB")}. Acceptance has not been recorded.</p>}
    <div className="flex gap-2"><button className={button} disabled={busy} onClick={() => void act("save")}>Save for later</button><button className={button} disabled={busy} onClick={() => void act("dismiss")}>Dismiss</button></div>
    <p className="text-xs text-slate-400">No automatic invitations or messages. Copy and Open profile do not change lifecycle. First messages require verified acceptance in Responses.</p>
    {notice && <p role="status" className="rounded-lg border border-amber-300/30 p-3">{notice}</p>}
    <details><summary>Source and relationship details</summary><a className="underline" href={`/dashboard/growth/acquisition?${new URLSearchParams({ organisationId, itemId: item.id })}`}>Existing Acquisition opportunity</a><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ provenance: item.provenance, metadata: item.sourceDetails }, null, 2)}</pre></details>
  </article>;
}

export default function LinkedInToConnect({ view }: { view: "to_connect" | "pending" }) {
  const [items, setItems] = useState<ViewItem[]>([]), [org, setOrg] = useState("");
  const [notice, setNotice] = useState("");
  const [readOnly, setReadOnly] = useState(true), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await tenantFetch("/api/growth/linkedin-invitations", { signal }); const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to check connection opportunities.");
      setItems(data.items); setOrg(data.organisationId); setReadOnly(data.readOnly);
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "Queue unavailable."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const known = items.filter(i => ["accepted", "known"].includes(i.state));
  return <section aria-label="LinkedIn pre-acceptance opportunities" className="space-y-4">
    {readOnly && <p className="rounded-lg border border-amber-300/30 p-3">Read-only Preview: invitation/save/dismiss actions are rehearsals. No Production data is written.</p>}
    <button className={button} disabled={loading} onClick={() => void load()}>Reload connection opportunities</button>
    {loading && <p role="status">Checking canonical profiles and existing relationships…</p>}{error && <p role="alert">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-amber-300/30 p-3">{notice}</p>}
    <div className="grid gap-4 lg:grid-cols-2">{items.filter(i => i.state === view || readOnly && i.rehearsal && i.state === "pending" && view === "to_connect").map(item => <InvitationCard key={item.id} item={item} organisationId={org} readOnly={readOnly} onChanged={(updated, message) => { setItems(current => current.map(i => i.id === updated.id ? updated : i)); setNotice(message); }}/>)}</div>
    {!loading && !items.some(i => i.state === view) && <p>No {view === "pending" ? "pending invitations" : "eligible To connect opportunities"}.</p>}
    {known.length > 0 && <details><summary>New connections / existing relationships — no new invitation</summary>{known.map(item => <div key={item.id} className="space-y-2 border-b border-white/10 p-3"><p>{item.name} · {item.company} · {item.category}</p><p>{item.acceptedConnectionId ? "Connection accepted — continue in Responses" : "Already known — review the existing relationship"}</p><p>{item.reason}</p>{item.existingRecord?.table === "inbox_items" ? <a className="underline" href={`/dashboard/responses?${new URLSearchParams({ organisationId: org, itemId: item.existingRecord.id })}`}>Continue in Responses</a> : <a className="underline" href={`/dashboard/growth/targets?${new URLSearchParams({ organisationId: org })}`}>Review existing Growth relationship</a>}<details><summary>Original opportunities and provenance</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(item.provenance, null, 2)}</pre></details></div>)}</details>}
  </section>;
}
