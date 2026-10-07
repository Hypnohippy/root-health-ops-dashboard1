"use client";
import { useEffect, useState } from "react";
import { tenantFetch } from "@/lib/tenantFetch";

type Conversation = { canGenerate: boolean; reason?: string | null; responseId?: string | null; activity?: string | null; context?: { inbound: { body: string } } };
export default function PartnerConversation({ organisationId, itemId }: { organisationId: string; itemId: string }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [summary, setSummary] = useState(""), [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const url = `/api/growth/acquisition/partner-conversation?${new URLSearchParams({ organisationId, itemId })}`;
  useEffect(() => {
    const controller = new AbortController();
    tenantFetch(url, { signal: controller.signal, cache: "no-store" }).then(async res => {
      const data = await res.json(); if (!res.ok) throw Error(data.error || "Conversation unavailable.");
      if (!controller.signal.aborted) setConversation(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [url]);
  async function generate() {
    setBusy(true); setError(""); setSummary(""); setDraft("");
    try {
      const res = await tenantFetch("/api/growth/acquisition/partner-conversation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId, itemId }) });
      const data = await res.json(); if (!res.ok) throw Error(data.error || "Unable to generate response.");
      setSummary(data.summary); setDraft(data.draft);
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to generate response."); } finally { setBusy(false); }
  }
  return <section aria-label="Partner conversation" className="space-y-3 border-t border-white/10 pt-4">
    <h3 className="font-semibold">Partner conversation</h3>
    {!conversation && !error && <p>Checking imported conversation...</p>}
    {conversation?.activity && <p>{conversation.activity}</p>}
    {conversation?.reason && <p>{conversation.reason}</p>}
    {conversation?.context && <details><summary>Inbound email</summary><p className="whitespace-pre-wrap">{conversation.context.inbound.body}</p></details>}
    <div className="flex flex-wrap gap-3">
      {conversation?.canGenerate && <button type="button" disabled={busy} onClick={() => void generate()} className="rounded border border-emerald-400/30 px-3 py-2 disabled:opacity-50">{busy ? "Generating..." : "Generate response"}</button>}
      {conversation?.responseId && <a className="underline" href={`/dashboard/responses?${new URLSearchParams({ organisationId, itemId: conversation.responseId })}`}>Open response</a>}
    </div>
    {summary && <div><h4 className="font-semibold">What they actually said</h4><p className="text-xs text-slate-400">AI interpretation - verify against the email.</p><p className="whitespace-pre-wrap">{summary}</p></div>}
    {draft && <><label className="block">Review draft<textarea className="mt-2 min-h-48 w-full rounded border border-white/20 bg-slate-950 p-3" value={draft} onChange={e => setDraft(e.target.value)} /></label>
      <button type="button" className="underline" onClick={() => void navigator.clipboard.writeText(draft).catch(() => setError("Copy unavailable; select the draft text manually."))}>Copy response</button>
      <p className="text-xs text-slate-400">Unsaved draft. Nothing has been sent. Threaded Gmail draft creation is not connected; review and send manually in the existing email conversation.</p></>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
