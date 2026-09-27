"use client";
import { useState } from "react";
import { capabilityLabels, type ChannelDefinition } from "@/lib/channelCapabilities";
import { connectionPresentation } from "@/lib/connectionPresentation";
import type { ConnectionHealth } from "@/lib/connectionUi";
import ProviderSetupGuide from "./ProviderSetupGuide";
export default function ChannelCard({ channel, health, organisationId, onDisconnect, recheck }: {
  channel: ChannelDefinition; health?: ConnectionHealth; organisationId: string | null;
  onDisconnect: (provider: string) => Promise<void>; recheck: () => Promise<void>;
}) {
  const view = connectionPresentation(channel, health);
  const [guiding, setGuiding] = useState(false), [busy, setBusy] = useState(false), [result, setResult] = useState("");
  async function check() {
    setBusy(true);
    try { await recheck(); setResult("Connection information updated. This check does not test sending or publishing."); }
    catch { setResult("Could not check the connection. The information shown may be out of date."); }
    finally { setBusy(false); }
  }
  const url = channel.connectPath ? `${channel.connectPath}${channel.connectPath.includes("?") ? "&" : "?"}${new URLSearchParams(organisationId ? { organisationId } : {})}` : "";
  return <article className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-sm">
    <div className="flex flex-wrap justify-between gap-3"><h3 className="text-base font-semibold text-white">{channel.name}</h3><span className="rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-200">{view.status}</span></div>
    <p className="mt-3 text-sm font-medium text-slate-200">{view.identity}</p>
    <p className="mt-2 text-sm leading-6 text-slate-300">{view.summary}</p>
    <div className="mt-4 rounded-lg bg-slate-950/70 p-3 text-sm">
      <p className="font-semibold text-emerald-200">{view.owner === "customer" ? "You need to do this" : view.owner === "root" ? "Root needs to do this" : "Your next step"}</p>
      <p className="mt-1 leading-6 text-slate-300">{view.next}</p>
    </div>
    {guiding && view.owner === "customer" ? <section aria-label="Finish connection setup" className="mt-4 text-sm text-slate-200">
      <p className="font-semibold">Before opening {channel.id === "instagram" ? "Facebook" : channel.name}</p>
      <ol className="my-3 list-decimal space-y-2 pl-5">{view.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <a className="inline-block rounded-lg bg-emerald-400 px-3 py-2 font-semibold text-slate-950" href={url}>Continue to authorisation</a>
      <button className="ml-3 underline" onClick={() => setGuiding(false)}>Cancel</button>
    </section> : <button type="button" disabled={busy || view.action === "none"} onClick={() => view.action === "check" ? void check() : setGuiding(true)} className="mt-4 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:bg-slate-800 disabled:text-slate-400">{busy ? "Checking…" : view.label}</button>}
    <p className="mt-3 text-xs leading-5 text-slate-400">{view.fallback}</p>
    {result && <p role="status" className="mt-3 text-sm text-amber-200">{result}</p>}
    <details className="mt-4 rounded-xl border border-slate-700 p-3">
      <summary className="cursor-pointer text-sm text-slate-300">Advanced technical details</summary>
      <p className="mt-3 text-xs text-slate-400">Operational verification: {view.assessment.operationallyVerified ? "verified" : "not verified"}. {view.assessment.expiryExplanation}</p>
      <p className="mt-2 text-xs text-slate-400">Token expiry: {health?.expiresAt || "Unknown / not recorded"}. Provider approval: {view.assessment.providerApproval}</p>
      <div className="mt-3 space-y-2 text-xs text-slate-400" aria-label={`${channel.name} capabilities`}>
        {capabilityLabels.map(label => <p key={label}><b>{label}: {view.assessment.capabilities[label].state}</b> — {view.assessment.capabilities[label].reason}</p>)}
      </div>
      <ProviderSetupGuide platform={channel.id} health={health} />
      <div className="mt-4 flex gap-4 text-xs text-slate-300"><button disabled={busy} onClick={() => void check()} className="underline">Check connection</button>
        {health?.state === "connected" && channel.disconnectable && <button onClick={() => void onDisconnect(channel.id)} className="underline">Disconnect</button>}
      </div>
    </details>
  </article>;
}
