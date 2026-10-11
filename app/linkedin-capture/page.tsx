"use client";
import { useState } from "react";

export default function LinkedInShareCapture() {
  const [profile, setProfile] = useState(() => typeof window === "undefined" ? "" : new URL(window.location.href).searchParams.get("profile_url") || "");
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [responseId, setResponseId] = useState("");
  const [organisationId, setOrganisationId] = useState("");
  const [signInUrl, setSignInUrl] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true); setStatus("Saving accepted connection…");
    try {
      const query = new URL(window.location.href).searchParams;
      const orgResponse = await fetch(`/api/org/current?${new URLSearchParams({ organisationId: query.get("organisationId") || "" })}`, { cache: "no-store" });
      const org = await orgResponse.json();
      if (!orgResponse.ok || !org.organisationId) {
        if (orgResponse.status === 401) setSignInUrl(`/signin?${new URLSearchParams({ next: window.location.pathname + window.location.search })}`);
        throw Error("Sign in and select your organisation before saving. Your profile link has been retained.");
      }
      setOrganisationId(org.organisationId);
      const res = await fetch("/api/growth/linkedin-connections/capture", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId: org.organisationId, profile_url: profile, name, source: "manual_iphone_share", acceptance_confirmed: confirmed,
          captured_at: query.get("captured_at") || new Date().toISOString() }) });
      const result = await res.json();
      if (!res.ok || !result.success) throw Error(result.error || "Capture was not saved. Please retry.");
      setStatus(result.duplicate ? "Already captured — the existing connection has been preserved." : "Accepted connection saved to Responses."); setResponseId(result.id);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Not saved. Your profile link has been retained."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl space-y-5 p-6 text-slate-100">
    <h1 className="text-2xl font-semibold">Send to Root Ops</h1>
    <p>Capture a connection LinkedIn did not email. A profile link alone does not confirm acceptance.</p>
    <label className="grid gap-2">LinkedIn profile URL<input type="url" className="rounded-xl bg-slate-900 p-3" value={profile} onChange={e => setProfile(e.target.value)} disabled={busy || !!responseId}/></label>
    <label className="grid gap-2">Name (optional)<input className="rounded-xl bg-slate-900 p-3" value={name} onChange={e => setName(e.target.value)} disabled={busy || !!responseId}/></label>
    <label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy || !!responseId}/>I confirm this person accepted my LinkedIn connection.</label>
    <button className="rounded-xl bg-emerald-700 px-4 py-3 disabled:opacity-50" disabled={!confirmed || !profile || busy || !!responseId} onClick={() => void save()}>{busy ? "Saving…" : "Save accepted connection"}</button>
    {status && <p role="status" className="rounded-xl border border-white/20 p-3">{status}</p>}
    {signInUrl && <a className="block underline" href={signInUrl}>Sign in and return to this capture</a>}
    {responseId && <a className="block underline" href={`/dashboard/responses/linkedin?${new URLSearchParams({ organisationId, itemId: responseId })}`}>Open LinkedIn Responses</a>}
    <p className="text-sm text-slate-400">No invitation or message is sent. Capture time is not an outbound send date.</p>
  </main>;
}
