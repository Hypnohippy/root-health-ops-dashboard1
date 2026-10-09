"use client";
import { useRef, useState } from "react";
import { localSendDate } from "@/lib/linkedinSendEvidence";
export default function LinkedInHistoricalSend({ message, review = false, confirmedAt, onConfirm, onCancel }: { message: string; review?: boolean; confirmedAt?: string | null; onConfirm: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
 const [choice, setChoice] = useState(review ? "today" : "historical");
 const [dateKnown, setDateKnown] = useState(false);
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
   pending.current ||= { key: crypto.randomUUID(), sendChoice: choice, sentAt: choice === "unknown" || choice === "conversation" && !dateKnown ? null : localSendDate(date, time, timezone), dateKnown, earliestOutboundConfirmed: choice === "conversation" && dateKnown && confirmed, timezone, timeKnown: !!time, message, confirmed: true };
   await onConfirm(pending.current);
  } catch (e) { setError(`${e instanceof Error ? e.message : "Confirmation failed."} Retry with the same details; do not send another LinkedIn message.`); }
  finally { setBusy(false); }
 }
 return <section aria-label="Reconcile LinkedIn send" className="space-y-3 rounded border border-amber-300/40 p-4">
  <h3 className="font-semibold">{review ? "Classify the original send" : "Already sent previously"}</h3>
  <p>Record what happened in LinkedIn. This action does not send a message.</p>
  <fieldset disabled={busy || !!pending.current} className="space-y-3">
   <label className="block">Classification <select value={choice} onChange={e => { setChoice(e.target.value); setConfirmed(false); if (e.target.value === "conversation") { setDate(""); setTime(""); } }} className="bg-slate-900 p-2">
    {review && <option value="today">Sent today — on the original confirmation day</option>}
    <option value="historical">Sent previously — date known</option><option value="unknown">Sent previously — date unknown</option>
    <option value="conversation">Conversation history pasted</option>
   </select></label>
   {choice === "conversation" && <><p>Preserve the complete pasted audit trail, including multiple outbound messages and LinkedIn UI text. No individual message dates are inferred.</p><label className="block"><input type="checkbox" checked={dateKnown} onChange={e => { setDateKnown(e.target.checked); setConfirmed(false); }} /> I can establish the earliest outbound send date from LinkedIn history.</label></>}
   {(choice !== "unknown" && (choice !== "conversation" || dateKnown)) && <><label className="block">{choice === "conversation" ? "Earliest verified outbound send date" : "Actual LinkedIn send date"} <input type="date" required value={date} onChange={e => { setDate(e.target.value); setConfirmed(false); }} className="bg-slate-900 p-2" /></label>
   <label className="block">Actual send time, if known <input type="time" value={time} onChange={e => { setTime(e.target.value); setConfirmed(false); }} className="bg-slate-900 p-2" /></label>
   <label className="block">Timezone (for example Europe/London) <input required value={timezone} onChange={e => { setTimezone(e.target.value); setConfirmed(false); }} className="bg-slate-900 p-2" /></label>
   {!time && <p>Time unknown: the date is recorded with date-only precision. Cadence uses the start of that day in the selected timezone.</p>}</>}
   {(choice === "unknown" || choice === "conversation" && !dateKnown) && <p>The contact remains previously contacted. Follow-up timing is blocked until the actual send date is resolved.</p>}
   <label className="block"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> {choice === "conversation" ? "I confirm this is an exact pasted LinkedIn conversation audit trail containing prior outbound contact, and the earliest outbound date (if provided) is verified by me." : "I confirm this exact message was already sent in LinkedIn and these historical details are accurate."}</label>
  </fieldset>
  {error && <p role="alert">{error}</p>}
  <button disabled={busy || !confirmed || !message.trim()} onClick={() => void submit()} className="rounded border px-3 py-2">{busy ? "Recording…" : pending.current ? "Retry confirmation safely" : "Confirm previously sent"}</button>
  <button disabled={busy} onClick={onCancel} className="ml-3 rounded border px-3 py-2">Close</button>
 </section>;
}
