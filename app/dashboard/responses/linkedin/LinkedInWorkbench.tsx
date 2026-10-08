"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { openAndCopyLinkedIn } from "@/lib/linkedinClipboard";
import { tenantFetch } from "@/lib/tenantFetch";
import { selectedBatchId, removeBatchContact } from "@/lib/linkedinWorkbench";
import type { LinkedInOutreachItem, OutreachView } from "@/lib/linkedinOutreach";

type Queue = { audit?: Record<string, unknown>[]; identityReviewNeeded: number; unreconciledFollowups: number; items: LinkedInOutreachItem[]; revision: string; total: number; repliesNeedingAttention: number; organisationId: string };
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";
const when = (value: string | null) => value ? new Date(value).toLocaleString("en-GB") : "Not recorded";

export function ContactCard({ item, queue, onNext, onReload, suspended, onWorking, initialMessage, onDraft }: { initialMessage: string; onDraft: (message: string) => void; onWorking: (working: boolean) => void; suspended: boolean; item: LinkedInOutreachItem; queue: Queue; onNext: (id: string, completed: boolean) => Promise<void>; onReload: () => Promise<void> }) {
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const receipt = useRef<{ key: string; completedAt: string; message: string; revision: string } | null>(null);
  const currentDraft = useRef(initialMessage);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await tenantFetch("/api/growth/linkedin-console", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: queue.organisationId, table: item.table, id: item.id, revision: queue.revision, ...body }) });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || "Action could not be confirmed. Reload safely.");
    return data;
  }, [item.id, item.table, queue.organisationId, queue.revision]);
  const generate = useCallback(async () => {
    const token = ++generation.current;
    setBusy("generate"); setNotice("");
    try {
      const data = await post({ action: "generate" });
      if (token === generation.current) { currentDraft.current = data.message; setMessage(data.message); onDraft(data.message); }
    } catch (e) { if (token === generation.current) setNotice(e instanceof Error ? e.message : "Generation failed; write a message below."); }
    finally { if (token === generation.current) setBusy(""); }
  }, [post, onDraft]);
  useEffect(() => { if (!suspended && !currentDraft.current && !receipt.current) void generate(); const counter = generation; return () => { counter.current++; }; }, [generate, suspended]);
  useEffect(() => { onWorking(busy === "complete" || uncertain); return () => onWorking(false); }, [busy, uncertain, onWorking]);
  async function copy(open: boolean) {
    setNotice("");
    try {
      if (open) setNotice(await openAndCopyLinkedIn(message, item.destination, {
        open: url => { window.open(url, "_blank", "noopener,noreferrer"); },
        copy: value => navigator.clipboard.writeText(value),
      }));
      else { await navigator.clipboard.writeText(message); setNotice("Message copied."); }
    } catch {
      textarea.current?.focus(); textarea.current?.select();
      setNotice("Clipboard access failed. Your draft is unchanged. Use Copy message or press Ctrl+C / Cmd+C on the selected text.");
    }
  }
  async function complete() {
    if (locked.current) return;
    locked.current = true; setBusy("complete"); setNotice("");
    receipt.current ||= { key: crypto.randomUUID(), completedAt: new Date().toISOString(), message, revision: queue.revision };
    try {
      const data = await post({ action: "complete", confirmed: true, ...receipt.current });
      if (data.reconciliationErrors?.length) {
        setNotice("Send recorded, but reconciliation needs attention. Reload safely before continuing; do not send again.");
        setUncertain(true);
      } else await onNext(item.contactId, true);
    } catch (e) { setUncertain(true); setNotice(`${e instanceof Error ? e.message : "Completion uncertain."} Retry this confirmation with the same receipt; do not send the LinkedIn message again.`); }
    finally { locked.current = false; setBusy(""); }
  }
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/15 bg-slate-900 lg:h-full" aria-label="Selected LinkedIn contact" aria-busy={!!busy}>
    <header className="sticky top-0 z-10 shrink-0 space-y-3 border-b border-white/10 bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-xl font-semibold">{item.name}</h2><p className="text-sm">{item.role || "Role not recorded"}</p><p className="text-sm text-slate-300">{item.company || "Company not recorded"}</p></div><span className="rounded bg-emerald-900 px-2 py-1 text-xs">{item.mode === "catchup" ? "Catch-up" : item.mode === "fresh" ? "Fresh" : "Follow-up"} · {item.stage.replaceAll("_", " ")}</span></div>
      <p className="text-sm text-emerald-200">{item.reason}</p>
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label={`Outreach actions for ${item.name}`}>
        <button className={`${button} bg-sky-800`} disabled={suspended || !!busy || !message.trim() || !item.destination || uncertain} onClick={() => void copy(true)}>{item.destinationKind === "profile" ? "Open profile & Copy — use Message" : "Open & Copy"}</button>
        <button className={`${button} bg-emerald-800`} disabled={suspended || !!busy || !message.trim()} onClick={() => void complete()}>{uncertain ? "Retry confirmation safely" : "Mark sent & next"}</button>
        <button className={button} disabled={suspended || busy === "complete" || uncertain} onClick={() => void onNext(item.contactId, false)}>Skip</button>
      </div>
    </header>
    <div className="min-h-0 space-y-4 overflow-y-auto p-4 lg:flex-1">
      {item.previousOutbound && <section aria-label="Confirmed previous outbound" className="rounded border border-white/15 p-3 text-sm"><h3 className="font-semibold">Previous message</h3><blockquote className="mt-2 whitespace-pre-wrap">{item.previousOutbound.message}</blockquote><p className="mt-2 text-slate-400">Sent: {when(item.previousOutbound.sentAt)} · {item.previousOutbound.source} · {item.previousOutbound.table}:{item.previousOutbound.id}</p><p>Current stage: {item.stage.replaceAll("_", " ")}</p></section>}
      <label className="block text-sm font-medium" htmlFor="linkedin-message">{item.previousOutbound ? "Next draft" : "Message"} for {item.name}</label>
      <textarea id="linkedin-message" ref={textarea} value={message} disabled={suspended || busy === "complete" || uncertain} onChange={e => { generation.current++; setBusy(""); currentDraft.current = e.target.value; setMessage(e.target.value); onDraft(e.target.value); }} className="min-h-32 w-full resize-y rounded-lg border border-white/20 bg-slate-950 p-3 text-sm leading-relaxed" />
      <div className="flex flex-wrap gap-2"><button className={button} disabled={suspended || !!busy || uncertain} onClick={() => void generate()}>{busy === "generate" ? "Preparing draft…" : "Refresh draft"}</button><button className={button} disabled={suspended || busy === "complete" || !message.trim()} onClick={() => void copy(false)}>Copy message</button></div>
      {notice && <p role="status" className="rounded-lg border border-amber-300/30 p-3 text-sm">{notice}</p>}
      {uncertain && <button className={button} onClick={() => void onReload()}>Reload current state safely</button>}
      <p className="text-xs text-slate-400">Paste and send manually in the separate LinkedIn tab. Mark sent confirms the actual send and advances the existing cadence.</p>
      {item.destination ? <a className="block text-sm underline text-sky-300" href={item.destination} target="_blank" rel="noreferrer">{item.destinationKind === "profile" ? "Open profile — use Message" : "Open recorded LinkedIn messaging destination"}</a> : <p className="text-sm">Destination missing — this contact requires reconciliation.</p>}
      <details className="text-sm"><summary className="cursor-pointer text-slate-300">Recorded dates and activity</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="text-slate-400">Connection detected / accepted</dt><dd>{when(item.connectedAt)}</dd></div><div><dt className="text-slate-400">Lifecycle / action</dt><dd>{item.lifecycle.replaceAll("_", " ")} / {item.stage.replaceAll("_", " ")}</dd></div><div><dt className="text-slate-400">Due</dt><dd>{item.dueAt ? when(item.dueAt) : "First message available now"}</dd></div><div><dt className="text-slate-400">Last action</dt><dd>{item.lastAction ? `${item.lastAction.action.replaceAll("_", " ")} — ${when(item.lastAction.at)}` : "None recorded"}</dd></div></dl></details>
    </div>
  </article>;
}export function BatchList({ items, selectedId, disabled, onSelect }: { items: LinkedInOutreachItem[]; selectedId: string | null; disabled: boolean; onSelect: (id: string) => void }) {
  return <ol className="divide-y divide-white/10">{items.map((item,index) => <li key={item.contactId}><button aria-pressed={selectedId === item.contactId} disabled={disabled} onClick={() => onSelect(item.contactId)} className={`w-full border-l-4 px-4 py-3 text-left disabled:opacity-50 ${selectedId === item.contactId ? "border-emerald-400 bg-emerald-400/10" : "border-transparent hover:bg-white/5"}`}><span className="block font-semibold">{index+1}. {item.name}</span><span className="block text-xs text-slate-300">{item.company || "Company not recorded"}</span><span className="block truncate text-xs text-slate-400" title={item.role || undefined}>{item.role || "Role not recorded"}</span><span className="mt-1 block text-xs text-emerald-300">{item.mode === "fresh" ? "Fresh" : item.mode === "catchup" ? "Catch-up" : "Follow-up due"} · {item.stage.replaceAll("_", " ")}</span><span className="block text-xs text-slate-400">{item.dueAt ? `Due ${when(item.dueAt)}` : `Accepted ${when(item.connectedAt)}`}</span></button></li>)}</ol>;
}
export default function LinkedInConsole() {
  const [working, setWorking] = useState(false);
  const [view, setView] = useState<OutreachView>("all");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const skipped = useRef<string[]>([]);
  const batchIds = useRef<Set<string> | null>(null);
  const drafts = useRef(new Map<string, string>());
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const token = ++sequence.current;
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams({ view }); skipped.current.forEach(id => q.append("skip", id));
      const res = await tenantFetch(`/api/growth/linkedin-console?${q}`), data: Queue & { error?: string } = await res.json();
      if (!res.ok) throw Error(data.error || "Unable to load current lifecycle.");
      if (token === sequence.current) {
        const items = data.items.filter(i => !batchIds.current || batchIds.current.has(i.contactId)).slice(0,10);
        batchIds.current = new Set(items.map(i => i.contactId));
        setQueue({ ...data, items });
        setSelection(current => selectedBatchId(items, current));
      }
    } catch (e) { if (token === sequence.current) setError(e instanceof Error ? e.message : "Queue unavailable."); }
    finally { if (token === sequence.current) setLoading(false); }
  }, [view]);
  useEffect(() => { batchIds.current = null; void load(); const counter = sequence; return () => { counter.current++; }; }, [load]);
  async function next(id: string, completed: boolean) {
    skipped.current.push(id);
    const remaining = removeBatchContact(queue?.items || [], id);
    batchIds.current = new Set(remaining.items.map(i => i.contactId));
    setQueue(current => current ? { ...current, items: remaining.items } : null);
    setSelection(remaining.selectedId);
    if (completed) await load();
  }
  const selected = queue?.items.find(i => i.contactId === selectedBatchId(queue.items, selection));
  const draftKey = selected ? `${selected.contactId}:${selected.stage}` : "";
  const saveDraft = useCallback((message: string) => { drafts.current.set(draftKey, message); }, [draftKey]);
  const org = queue?.organisationId || "";
  const inbox = `/dashboard/responses${org ? `?organisationId=${encodeURIComponent(org)}` : ""}`;
  function newBatch(includeSkipped = false) { if (includeSkipped) skipped.current = []; batchIds.current = null; void load(); }
  return <main className="mx-auto max-w-7xl space-y-4 p-4 py-5 text-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-semibold">LinkedIn Outreach Console</h1><a href={inbox} className="text-sm underline text-sky-300">Back to Responses inbox</a></div>
    <nav aria-label="Queue views" className="flex flex-wrap gap-2">{([ ["all","Work next 10"], ["fresh","Fresh"], ["catchup","Catch-up"], ["followups","Follow-ups due"] ] as const).map(([value,label]) => <button key={value} aria-pressed={view === value} disabled={loading || working} className={`${button} ${view === value ? "bg-emerald-900" : ""}`} onClick={() => { if (view === value) newBatch(); else setView(value); }}>{label}</button>)}</nav>
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
      <span>{queue?.items.length || 0} in this batch · {queue?.total || 0} eligible</span>
      {queue && queue.repliesNeedingAttention > 0 && <span>{queue.repliesNeedingAttention} inbound replies need attention in Responses</span>}
      <details><summary className="cursor-pointer">Queue diagnostics{queue && queue.identityReviewNeeded > 0 ? ` · ${queue.identityReviewNeeded} identity checks` : ""}</summary><div className="mt-2 max-w-2xl space-y-2 rounded border border-white/10 p-3"><p>{queue?.identityReviewNeeded || 0} first-message records need verified LinkedIn identity; {queue?.unreconciledFollowups || 0} legacy follow-ups need reconciliation. Valid contacts remain available.</p><details><summary>Recorded evidence and exclusion audit</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap">{JSON.stringify(queue?.audit || [], null, 2)}</pre></details><a className="underline" href={`/dashboard/growth?organisationId=${encodeURIComponent(org)}`}>Review Growth reconciliation</a><p>Fresh means verified acceptance detected within seven days. Older verified acceptances use catch-up wording. Follow-ups require confirmed sent text and matching cadence time. Only records captured in Ops appear; intake may miss connections.</p></div></details>
    </div>
    {error && <div role="alert" className="text-sm"><p>{error}</p><button className={button} onClick={() => void load()}>Reload safely</button></div>}
    {loading && <p role="status" className="text-xs text-slate-400">Checking current lifecycle…</p>}
    <div className="grid gap-4 lg:h-[calc(100dvh-15rem)] lg:min-h-[420px] lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.8fr)]">
      <section aria-label="Current LinkedIn batch" className="min-h-0 overflow-y-auto rounded-xl border border-white/15 bg-slate-900/50">
        <h2 className="sticky top-0 z-10 border-b border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold">Current batch · select a contact</h2>
        <BatchList items={queue?.items || []} selectedId={selected?.contactId || null} disabled={working || loading} onSelect={setSelection} />
        {!queue?.items.length && !loading && <p className="p-4 text-sm text-slate-400">No contacts in this batch.</p>}
      </section>
      {selected && queue ? <ContactCard key={`${selected.contactId}:${selected.stage}`} item={selected} initialMessage={drafts.current.get(draftKey) || ""} onDraft={saveDraft} suspended={loading || !!error} onWorking={setWorking} queue={queue} onNext={next} onReload={load} /> : <section className="rounded-xl border border-white/15 p-6"><h2 className="text-xl">{loading ? "Loading batch…" : "Batch complete or no eligible contacts"}</h2><div className="mt-4 flex flex-wrap gap-2"><button className={button} disabled={loading} onClick={() => newBatch()}>Work next 10</button><button className={button} disabled={loading} onClick={() => newBatch(true)}>Include skipped contacts again</button></div></section>}
    </div>
  </main>;
}
