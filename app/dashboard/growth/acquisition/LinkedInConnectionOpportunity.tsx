"use client";
import { useState } from "react";
import { connectionNote, verifiedLinkedInProfile } from "@/lib/linkedinCaptureProfile";

type Item = { id: string; person: string | null; signal: string | null; source_url: string | null; metadata: Record<string, unknown>; status: string;
  linkedinConnectionState?: { acceptedConnectionId: string | null; alreadyKnown: boolean } };
export default function LinkedInConnectionOpportunity({ item, organisationId, onSave, onDismiss, busy = false }: { item: Item; organisationId: string; onSave: () => void; onDismiss: () => void; busy?: boolean }) {
  const [draft, setDraft] = useState(""); const [notice, setNotice] = useState("");
  const profile = verifiedLinkedInProfile(item.source_url || "");
  const state = item.linkedinConnectionState;
  const known = !!state?.alreadyKnown;
  const canConnect = !!state && !known;
  async function copy() { try { await navigator.clipboard.writeText(draft); setNotice("Current note copied. Send a connection request yourself if appropriate."); } catch { setNotice("Clipboard unavailable — select and copy the note below."); } }
  return <article className="space-y-3 rounded-2xl border border-sky-400/25 bg-slate-900 p-4">
    <p className="text-xs text-sky-200">LinkedIn Connection Opportunity</p><h2 className="font-semibold">{item.person || (state?.acceptedConnectionId ? "Name needed — review in Responses" : "Public professional profile")}</h2><p>{item.signal}</p>
    <p className="text-sm text-slate-400">{state?.acceptedConnectionId ? "Connection accepted. Use the existing relationship in Responses; no new invitation is needed." : "Recommended by LinkedIn in email. Acceptance or consent to private outreach has not been assumed."}</p>
    {state?.acceptedConnectionId ? <a className="text-emerald-300 underline" href={`/dashboard/responses?${new URLSearchParams({ organisationId, itemId: state.acceptedConnectionId })}`}>Connection accepted — continue in Responses</a> : known ? <p>Already known to Ops. Review the existing relationship before making another connection request.</p> : null}
    <div className="flex flex-wrap gap-3">{profile && <a className="text-sky-300 underline" href={profile} target="_blank" rel="noopener noreferrer">Open profile</a>}
      {canConnect && profile && !["dismissed", "lost", "converted", "actioned"].includes(item.status) && <button onClick={() => setDraft(connectionNote({ name: item.person || "", headline: String(item.metadata.headline || "") }))}>Draft connection note</button>}
      {canConnect && ["new", "reviewing"].includes(item.status) && <button disabled={busy} onClick={onSave}>Save for later</button>}
      {canConnect && ["new", "reviewing", "accepted", "nurture"].includes(item.status) && <button disabled={busy} onClick={onDismiss}>Dismiss</button>}</div>
    {!state && <p role="status">Relationship status unavailable — refresh before preparing a connection request.</p>}
    {busy && <p role="status">Saving…</p>}{item.status === "accepted" && <p>Saved for later</p>}
    {draft && canConnect && <div className="space-y-2"><label className="grid gap-2">Connection note (editable)<textarea className="min-h-28 rounded-xl bg-slate-950 p-3" value={draft} maxLength={300} onChange={e => setDraft(e.target.value)}/></label><button onClick={() => void copy()} disabled={!draft.trim()}>Copy current note</button><p className="text-xs text-slate-400">Review and send manually on LinkedIn. Copy and Open profile do not change the relationship.</p></div>}
    {notice && <p role="status">{notice}</p>}
    <details><summary>Source details</summary>{item.metadata.acceptance_source ? <p>Acceptance source: {String(item.metadata.acceptance_source)}</p> : <><p>Gmail message: {String(item.metadata.source_gmail_message_id || "")}</p><p>Discovered: {String(item.metadata.discovered_at || "")}</p></>}</details>
  </article>;
}
