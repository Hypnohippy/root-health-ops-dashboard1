"use client";
import { useEffect, useRef, useState } from "react";
import type { AdvisorAnswer, AdvisorIntent } from "@/lib/rootCoachAdvisor";
const intents: [AdvisorIntent, string][] = [["assess_reply", "Assess this reply"], ["summarise_relationship", "Summarise our history"], ["identify_commitments", "Have I promised anything?"], ["recommend_next_step", "What should I do next?"], ["draft_response", "Draft a response"]];
export function advisorLocator(pathname: string, search: string) {
  const match = pathname.match(/^\/dashboard\/growth\/relationships\/((?:inbox|target|acquisition|founder|workspace)_[a-f0-9-]{36})$/i);
  if (match) return match[1];
  const id = new URLSearchParams(search).get("itemId");
  return pathname === "/dashboard/responses" && id && /^[a-f0-9-]{36}$/i.test(id) ? `inbox_${id}` : null;
}
export default function RootCoachAdvisor({ organisationId, pathname }: { organisationId: string; pathname: string }) {
  const locator = advisorLocator(pathname, typeof window === "undefined" ? "" : window.location.search);
  const [intent, setIntent] = useState<AdvisorIntent>("assess_reply"), [question, setQuestion] = useState("What do you think of this reply?"), [live, setLive] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [answer, setAnswer] = useState<(AdvisorAnswer & { candidates?: { threadId: string; subject: string; latestAt: string }[] }) | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), [organisationId, locator]);
  async function ask(selectedThreadId?: string) {
    if (!locator || !question.trim()) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setAnswer(null);
    try {
      const response = await fetch("/api/coach/advisor", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: request.signal, body: JSON.stringify({ organisationId, relationshipLocator: locator, intent, question, checkLatestEmail: live, ...(selectedThreadId ? { selectedThreadId } : {}) }) });
      const result = await response.json(); if (!response.ok) throw Error(result.error || "Advice is unavailable. Guide and source evidence remain available.");
      if (!request.signal.aborted) setAnswer(result);
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Advice unavailable."); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  if (!locator) return <section className="root-coach-intro"><h3>Choose a relationship</h3><p>Open an existing Relationship or selected Responses item, then ask for advice here. Guide remains available for navigation.</p></section>;
  return <section className="root-advisor"><p>Read-only relationship advice. Drafts stay here and are not saved or sent.</p><form onSubmit={event => { event.preventDefault(); void ask(); }}><label>Advice type<select value={intent} onChange={event => setIntent(event.target.value as AdvisorIntent)}>{intents.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Your question<textarea maxLength={1000} rows={3} value={question} onChange={event => setQuestion(event.target.value)} /></label><label className="root-advisor-check"><input type="checkbox" checked={live} onChange={event => setLive(event.target.checked)} />Explicitly check current email for this relationship</label><button disabled={busy || !question.trim()} type="submit">{busy ? "Reading associated evidence…" : "Ask for advice"}</button></form>{error && <p role="alert">{error}</p>}{answer && <div aria-live="polite" aria-label="Relationship advice">{(["facts", "interpretations", "recommendations", "commitments"] as const).map(key => <section key={key}><h3>{{ facts: "Recorded facts", interpretations: "Interpretations", recommendations: "Recommendations", commitments: "Commitments" }[key]}</h3>{answer[key].length ? answer[key].map((claim, i) => <div key={i}><p>{claim.text}</p><small>Evidence: {claim.evidenceIds.join(", ")}</small></div>) : <p>No supported items identified in the supplied evidence.</p>}</section>)}{answer.draft && <label>Editable draft — not saved or sent<textarea rows={8} value={answer.draft} onChange={event => setAnswer({ ...answer, draft: event.target.value })} /></label>}<section><h3>Evidence limits</h3>{answer.limitations.map((text, i) => <p key={i}>{text}</p>)}</section>{answer.candidates && answer.candidates.length > 1 && <section><h3>Choose the exact email thread</h3>{answer.candidates.map(candidate => <button disabled={busy} key={candidate.threadId} onClick={() => void ask(candidate.threadId)}>{candidate.subject || "Untitled conversation"} · {candidate.latestAt}</button>)}</section>}<details><summary>Evidence used ({answer.evidence.length})</summary>{answer.evidence.map(item => <article key={item.id}><strong>{item.kind} · {item.channel}</strong><small>{item.origin === "live_gmail" ? "Live mailbox evidence — not saved or linked in Ops." : "Stored Ops evidence"} · {item.at || "Message/event date not established"}</small><p>{item.text}</p><small>{item.id} · {item.source}{item.truncated ? " · Shortened for the context limit" : ""}</small></article>)}</details></div>}</section>;
}
