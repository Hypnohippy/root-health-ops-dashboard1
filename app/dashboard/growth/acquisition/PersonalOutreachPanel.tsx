"use client";
import { useEffect, useRef, useState } from "react";
type Context = { route: string | null; canStart: boolean; reason: string | null; message: string };
export default function PersonalOutreachPanel({ organisationId, itemId }: { organisationId: string; itemId: string }) {
  const [context, setContext] = useState<Context | null>(null), [message, setMessage] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const flight = useRef(false), alive = useRef(true);
  const url = `/api/growth/acquisition/personal/outreach?${new URLSearchParams({ organisationId, itemId })}`;
  useEffect(() => { const controller = new AbortController(); alive.current = true;
    fetch(url, { signal: controller.signal, cache: "no-store" }).then(async res => { const data = await res.json(); if (!res.ok) throw Error(data.error || "Contact route unavailable."); if (!controller.signal.aborted) { setContext(data); setMessage(data.message); } }).catch(e => { if (!controller.signal.aborted) setNotice(e.message); });
    return () => { alive.current = false; controller.abort(); };
  }, [url]);
  async function generate() { if (flight.current) return; flight.current = true; setBusy(true); setNotice("Preparing message…");
    try { const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(30000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId, itemId }) }); const data = await res.json(); if (!res.ok || !data.message) throw Error(data.error || "No message returned."); if (alive.current) { setMessage(data.message); setNotice("Message prepared. Review before sending manually."); } }
    catch (e) { if (alive.current) setNotice(`${e instanceof Error ? e.message : "Preparation failed"} Your text has been retained.`); }
    finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-white/10 p-4">
    <h3 className="font-semibold">Start outreach</h3>
    {!context && !notice && <p>Checking the contact route and previous conversation…</p>}
    {context?.reason && <p>{context.reason}</p>}
    {context?.canStart && <><p>Verified business route: {context.route?.replace(/^mailto:/, "")}</p><label className="grid gap-2">Message<textarea rows={7} value={message} disabled={busy} onChange={e => setMessage(e.target.value)} className="rounded-xl bg-slate-950 p-3"/></label>
      <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => void generate()}>{busy ? "Preparing…" : "Prepare message"}</button><button disabled={busy || !message.trim()} onClick={() => void navigator.clipboard.writeText(message).then(() => setNotice("Current message copied. Nothing was sent.")).catch(() => setNotice("Copy blocked. Select and copy the message manually."))}>Copy current text</button>
      {context.route && <a href={context.route} target="_blank" rel="noopener noreferrer">Open contact route ↗</a>}</div>
      <p>Next: review the message and send it manually through this business route. Preparation and copying do not record a send. Delivery confirmation remains in the existing outreach workflow.</p></>}
    {notice && <p role="status" aria-live="polite">{notice}</p>}
  </section>;
}
