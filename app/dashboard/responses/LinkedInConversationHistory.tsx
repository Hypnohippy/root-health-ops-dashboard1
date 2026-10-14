"use client";

import { useEffect, useState } from "react";

type Entry = {
  id: string;
  direction: "inbound" | "outbound" | "snapshot";
  message: string;
  message_at: string | null;
  confirmed_at?: string | null;
  earliest_outbound_at?: string | null;
};
type History = { dated: Entry[]; undated: Entry[] };

// Presentation only. Stored dates/text and the existing lifecycle remain authoritative.
export default function LinkedInConversationHistory({ organisationId, contactId, replyDetected }: {
  organisationId: string | null;
  contactId?: string;
  replyDetected: boolean;
}) {
  const requestKey = `${organisationId}:${contactId}`;
  const [result, setResult] = useState<{ key: string; history: History; error: string | null } | null>(null);
  const ready = result?.key === requestKey;
  const history = ready ? result.history : { dated: [], undated: [] };
  const loading = Boolean(organisationId && contactId) && !ready;
  const error = !organisationId || !contactId
    ? "A canonical LinkedIn contact is required to load history safely."
    : ready ? result.error : null;

  useEffect(() => {
    if (!organisationId || !contactId) return;
    const controller = new AbortController();
    fetch(`/api/growth/linkedin-conversation?${new URLSearchParams({ organisationId, contactId })}`, {
      method: "GET", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || data.success !== true || data.contactId !== contactId) {
        throw Error(data.error || "Could not load LinkedIn conversation history.");
      }
      setResult({ key: requestKey, error: null, history: {
        dated: Array.isArray(data.messages?.dated) ? data.messages.dated : [],
        undated: Array.isArray(data.messages?.undated) ? data.messages.undated : [],
      } });
    }).catch(reason => {
      if (!controller.signal.aborted) setResult({ key: requestKey, history: { dated: [], undated: [] }, error: reason instanceof Error ? reason.message : "Could not load LinkedIn conversation history." });
    });
    return () => controller.abort();
  }, [organisationId, contactId, requestKey]);

  const entries = (rows: Entry[]) => rows.map(entry => (
    <article key={entry.id} className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-300">
        <strong>{entry.direction === "snapshot" ? "Conversation history snapshot" : entry.direction === "inbound" ? "Inbound message" : "Outbound message"}</strong>
        {entry.message_at ? <time dateTime={entry.message_at}>{entry.message_at}</time> : <span>Message date unknown</span>}
      </div>
      {!entry.message_at && entry.confirmed_at && <p className="mt-1 text-xs text-slate-400">Recorded in Ops: <time dateTime={entry.confirmed_at}>{entry.confirmed_at}</time> — not the message date.</p>}
      {entry.direction === "snapshot" && entry.earliest_outbound_at && <p className="mt-1 text-xs text-slate-400">Earliest outbound date explicitly confirmed: {entry.earliest_outbound_at}. Individual message dates are not inferred.</p>}
      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-slate-100">{entry.message}</pre>
    </article>
  ));

  return <section aria-label="LinkedIn conversation history" className="mt-4 min-w-0 space-y-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
    <h3 className="text-sm font-semibold text-white">LinkedIn conversation history</h3>
    {organisationId && contactId && <a className="inline-block text-sm text-emerald-300 underline" href={`/dashboard/responses/linkedin/conversations?${new URLSearchParams({ organisationId, contactId })}`}>Log/paste conversation</a>}
    {loading ? <p role="status" className="text-sm text-slate-400">Loading LinkedIn conversation history…</p> : error ? <p role="alert" className="text-sm text-red-200">{error}</p> : <>
      {!history.dated.length && !history.undated.length && <p className="text-sm text-slate-300">{replyDetected ? "LinkedIn reply detected — open conversation and paste/log it" : "No LinkedIn conversation text has been stored yet."}</p>}
      {history.dated.length > 0 && <div className="space-y-3"><h4 className="text-xs font-semibold text-slate-300">Dated messages — oldest first</h4>{entries(history.dated)}</div>}
      {history.undated.length > 0 && <div className="space-y-3"><h4 className="text-xs font-semibold text-slate-300">Undated messages and snapshots — recording order, not inferred chronology</h4>{entries(history.undated)}</div>}
    </>}
  </section>;
}
