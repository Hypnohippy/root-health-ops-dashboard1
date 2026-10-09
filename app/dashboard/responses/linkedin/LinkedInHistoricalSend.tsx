"use client";
import { useRef, useState } from "react";
import { localSendDate } from "@/lib/linkedinSendEvidence";
export default function LinkedInHistoricalSend({ message, review = false, confirmedAt, onConfirm, onCancel }: { message: string; review?: boolean; confirmedAt?: string | null; onConfirm: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
 const [choice, setChoice] = useState(review ? "today" : "historical");
 const [date, setDate] = useState(confirmedAt ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London" }).format(new Date(confirmedAt)) : "");
 const [time, setTime] = useState("");
 const [timezone, setTimezone] = useState("Europe/London");
 const [confirmed, setConfirmed] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const pending = useRef<Record<string, unknown> | null>(null);
 async function submit() {
  setError(""); setBusy(true);
  try {
   if (!confirmed || !message.trim()) throw Error("Confirm the exact historical message and send details.");
   pending.current ||= { key: crypto.randomUUID(), sendChoice: choice, sentAt: choice === "unknown" ? null : localSendDate(date, time, timezone), timezone, timeKnown: !!time, message, confirmed: true };
   await onConfirm(pending.current);
  } catch (e) { setError(`${e instanceof Error ? e.message : "Confirmation failed."} Retry with the same details; do not send another LinkedIn message.`); }
  finally { setBusy(false); }
 }
 return <section aria-label="Reconcile LinkedIn send" className="space-y-3 rounded border border-amber-300/40 p-4">
  <h3 className="font-semibold">{review ? "Classify the original send" : "Already sent previously"}</h3>
  <p>Record what happened in LinkedIn. This action does not send a message.</p>
  <fieldset disabled={busy || !!pending.current} className="space-y-3">
   <label className="block">Classification <select value={choice} onChange={e => setChoice(e.target.value)} className="bg-slate-900 p-2">
    {review && <option value="today">Sent today — on the original confirmation day</option>}
    <option value="historical">Sent previously — date known</option><option value="unknown">Sent previously — date unknown</option>
   </select></label>
   {choice !== "unknown" && <><label className="block">Actual LinkedIn send date <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="bg-slate-900 p-2" /></label>
   <label className="block">Actual send time, if known <input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-slate-900 p-2" /></label>
   <label className="block">Timezone (for example Europe/London) <input required value={timezone} onChange={e => setTimezone(e.target.value)} className="bg-slate-900 p-2" /></label>
   {!time && <p>Time unknown: the date is recorded with date-only precision. Cadence uses the start of that day in the selected timezone.</p>}</>}
   {choice === "unknown" && <p>The contact remains previously contacted. Follow-up timing is blocked until the actual send date is resolved.</p>}
   <label className="block"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I confirm this exact message was already sent in LinkedIn and these historical details are accurate.</label>
  </fieldset>
  {error && <p role="alert">{error}</p>}
  <button disabled={busy || !confirmed || !message.trim()} onClick={() => void submit()} className="rounded border px-3 py-2">{busy ? "Recording…" : pending.current ? "Retry confirmation safely" : "Confirm previously sent"}</button>
  <button disabled={busy} onClick={onCancel} className="ml-3 rounded border px-3 py-2">Close</button>
 </section>;
}
