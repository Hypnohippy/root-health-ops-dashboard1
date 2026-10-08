"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { openAndCopyLinkedIn } from "@/lib/linkedinClipboard";
import { tenantFetch } from "@/lib/tenantFetch";
import type { LinkedInOutreachItem, OutreachView } from "@/lib/linkedinOutreach";

type Queue = { identityReviewNeeded: number; unreconciledFollowups: number; items: LinkedInOutreachItem[]; revision: string; total: number; repliesNeedingAttention: number; organisationId: string };
const button = "rounded-lg border border-white/20 px-4 py-3 hover:bg-white/10 disabled:opacity-40";
const when = (value: string | null) => value ? new Date(value).toLocaleString("en-GB") : "Not recorded";

function ContactCard({ item, queue, onNext, onReload, suspended, onWorking }: { onWorking: (working: boolean) => void; suspended: boolean; item: LinkedInOutreachItem; queue: Queue; onNext: (id: string) => Promise<void>; onReload: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const receipt = useRef<{ key: string; completedAt: string; message: string; revision: string } | null>(null);
  const currentDraft = useRef("");
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
      if (token === generation.current) { currentDraft.current = data.message; setMessage(data.message); }
    } catch (e) { if (token === generation.current) setNotice(e instanceof Error ? e.message : "Generation failed; write a message below."); }
    finally { if (token === generation.current) setBusy(""); }
  }, [post]);
  useEffect(() => { if (!suspended && !currentDraft.current && !receipt.current) void generate(); const counter = generation; return () => { counter.current++; }; }, [generate, suspended]);
  useEffect(() => { onWorking(!!busy || uncertain); return () => onWorking(false); }, [busy, uncertain, onWorking]);
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
      } else await onNext(item.contactId);
    } catch (e) { setUncertain(true); setNotice(`${e instanceof Error ? e.message : "Completion uncertain."} Retry this confirmation with the same receipt; do not send the LinkedIn message again.`); }
    finally { locked.current = false; setBusy(""); }
  }
  return <article className="rounded-2xl border border-white/15 bg-white/5 p-5 md:p-8 space-y-5" aria-label="Current LinkedIn contact" aria-busy={!!busy}>
    <div><p className="text-sm text-emerald-300">{item.mode === "catchup" ? "Catch-up" : item.mode === "fresh" ? "Fresh connection" : "Follow-up due"}</p><h2 className="text-2xl font-semibold">{item.name}</h2><p>{item.company || "Company not recorded"}</p><p className="text-slate-300">{item.role || "Role not recorded"}</p></div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-slate-400">Connection detected / accepted</dt><dd>{when(item.connectedAt)}</dd></div>
      <div><dt className="text-slate-400">Lifecycle / current action</dt><dd>{item.lifecycle.replaceAll("_", " ")} / {item.stage.replaceAll("_", " ")}</dd></div>
      <div><dt className="text-slate-400">Due</dt><dd>{item.dueAt ? when(item.dueAt) : "First message available now"}</dd></div>
      <div><dt className="text-slate-400">Last recorded action</dt><dd>{item.lastAction ? `${item.lastAction.action.replaceAll("_", " ")} — ${when(item.lastAction.at)}` : "None recorded"}</dd></div>
    </dl>
    <p className="text-emerald-200">{item.reason}</p>
    <label className="block font-medium">Message<textarea ref={textarea} value={message} disabled={busy === "complete" || uncertain} onChange={e => { generation.current++; setBusy(""); currentDraft.current = e.target.value; setMessage(e.target.value); }} className="mt-2 min-h-48 w-full rounded-lg border border-white/20 bg-slate-950 p-4 font-normal" /></label>
    <div className="flex flex-wrap gap-3">
      <button className={button} disabled={!!busy || uncertain} onClick={() => void generate()}>Generate / Refresh message</button>
      <button className={`${button} bg-sky-800`} disabled={!!busy || !message.trim() || uncertain} onClick={() => void copy(true)}>Open &amp; Copy</button>
      <button className={button} disabled={!!busy || !message.trim()} onClick={() => void copy(false)}>Copy message</button>
      <button className={`${button} bg-emerald-800`} disabled={!!busy || !message.trim()} onClick={() => void complete()}>{uncertain ? "Retry confirmation safely" : "Mark sent & next"}</button>
      <button className={button} disabled={!!busy || uncertain} onClick={() => void onNext(item.contactId)}>Skip for now</button>
    </div>
    <p className="text-sm text-slate-300">Mark sent confirms you have actually pasted and sent this message in LinkedIn. Only this confirmation advances the existing cadence.</p>
    {item.destination ? <a className="block underline text-sky-300" href={item.destination} target="_blank" rel="noreferrer">Open recorded LinkedIn destination</a> : <p>No LinkedIn destination is recorded. Copy still works.</p>}
    {notice && <p role="status" className="rounded-lg border border-amber-300/30 p-3">{notice}</p>}
    {uncertain && <button className={button} onClick={() => void onReload()}>Reload current state safely</button>}
  </article>;
}
export default function LinkedInConsole() {
  const [working, setWorking] = useState(false);
  const [view, setView] = useState<OutreachView>("all");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const skipped = useRef<string[]>([]);
  const remaining = useRef(10);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const token = ++sequence.current;
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams({ view }); skipped.current.forEach(id => q.append("skip", id));
      const res = await tenantFetch(`/api/growth/linkedin-console?${q}`), data = await res.json();
      if (!res.ok) throw Error(data.error || "Unable to load current lifecycle.");
      if (token === sequence.current) setQueue({ ...data, items: data.items.slice(0,remaining.current) });
    } catch (e) { if (token === sequence.current) setError(e instanceof Error ? e.message : "Queue unavailable."); }
    finally { if (token === sequence.current) setLoading(false); }
  }, [view]);
  useEffect(() => { remaining.current = 10; void load(); const counter = sequence; return () => { counter.current++; }; }, [load]);
  async function next(id: string) {
    skipped.current.push(id); remaining.current--;
    setQueue(current => current ? { ...current, items: current.items.filter(i => i.contactId !== id) } : null);
    await load();
  }
  const org = queue?.organisationId || "";
  const inbox = `/dashboard/responses${org ? `?organisationId=${encodeURIComponent(org)}` : ""}`;
  return <main className="mx-auto max-w-4xl space-y-6 p-4 py-8 text-slate-100">
    <a href={inbox} className="underline text-sky-300">Back to Responses inbox</a>
    <div><h1 className="text-3xl font-semibold">LinkedIn Outreach Console</h1><p className="mt-2 text-slate-300">Open &amp; Copy → paste and send in LinkedIn → Mark sent &amp; next.</p></div>
    {queue && queue.repliesNeedingAttention > 0 && <aside className="rounded-lg border border-amber-300 p-4"><a className="font-semibold underline" href={inbox}>{queue.repliesNeedingAttention} inbound replies need attention — open Responses first</a></aside>}
    {queue && (queue.identityReviewNeeded > 0 || queue.unreconciledFollowups > 0) && <aside className="rounded-lg border border-amber-300/40 p-4">{queue.identityReviewNeeded} first-message records need verified LinkedIn identity; {queue.unreconciledFollowups} legacy follow-ups need lifecycle reconciliation before this console can safely advance them. <a className="underline" href={`/dashboard/growth?organisationId=${encodeURIComponent(org)}`}>Review Growth reconciliation</a></aside>}
    <nav aria-label="Queue views" className="flex flex-wrap gap-2">{([ ["all","Work next 10"], ["fresh","Fresh connections"], ["catchup","Catch-up"], ["followups","Follow-ups due"] ] as const).map(([value,label]) => <button key={value} aria-pressed={view === value} disabled={loading || working} className={`${button} ${view === value ? "bg-emerald-900" : ""}`} onClick={() => { if (view === value) { remaining.current = 10; void load(); } else setView(value); }}>{label}</button>)}</nav>
    <p className="text-sm text-slate-400">Fresh means detected within seven days. Older or undated acceptances use catch-up wording. Only connections recorded in Ops appear; intake may miss some connections.</p>
    {error && <div role="alert"><p>{error}</p><button className={button} onClick={() => void load()}>Reload safely</button></div>}
    <div className="min-h-[560px]">{loading && <p role="status">Checking current lifecycle…</p>}{queue?.items[0] ? <><p className="mb-3 text-sm">{queue.items.length} cards left in this batch · {queue.total} eligible in this view</p><fieldset disabled={loading || !!error}><ContactCard key={`${queue.items[0].table}:${queue.items[0].id}`} item={queue.items[0]} suspended={loading || !!error} onWorking={setWorking} queue={queue} onNext={next} onReload={load} /></fieldset></> : queue ? <section className="space-y-4"><h2 className="text-xl">{remaining.current === 0 ? "Batch complete" : "No more eligible contacts in this view"}</h2><button className={button} onClick={() => { remaining.current = 10; void load(); }}>Work next 10</button><button className={button} onClick={() => { skipped.current = []; remaining.current = 10; void load(); }}>Include skipped contacts again</button></section> : null}</div>
  </main>;
}
