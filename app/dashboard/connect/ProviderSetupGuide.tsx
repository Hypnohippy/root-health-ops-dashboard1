"use client";
import { useState } from "react";
import { buildProviderSetup } from "@/lib/providerSetup";
import type { ConnectionHealth } from "@/lib/connectionUi";
export default function ProviderSetupGuide({ platform, health, recheck }: { platform: string; health?: ConnectionHealth; recheck: () => Promise<void> }) {
  const setup = health?.setup || buildProviderSetup(platform, health?.state || "not_connected", null);
  const [busy, setBusy] = useState(false), [result, setResult] = useState("");
  async function check() {
    setBusy(true); setResult("");
    try { await recheck(); setResult("Saved configuration and capability restrictions rechecked. Remote operation remains unverified."); }
    catch { setResult("Recheck failed. Previously displayed data may be stale; no new verification is claimed."); }
    finally { setBusy(false); }
  }
  return <details className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-emerald-200">Continue setup · {health ? setup.label : "Setup not checked"}</summary>
    <div className="mt-3 space-y-3 text-sm text-slate-300">
      <p><b>Already connected:</b> {health ? setup.connected : "Account state has not been loaded."}</p>
      <p><b>Current limits:</b> {setup.limitation}</p>
      <p><b>Your next step:</b> {setup.configuration === "incomplete" ? "Ask your workspace operator to finish the shared provider setup first. You do not need to register a developer app or paste a secret." : setup.customerStep}</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>{setup.providerUrl ? <a className="text-emerald-300 underline" href={setup.providerUrl} target="_blank" rel="noreferrer">Open provider</a> : "Use the existing native/manual workflow."}</li>
        <li>{setup.customerStep}</li>
        <li>Return to Ops. Use Connect or Reconnect when available and select the account in the provider window. No secret is collected here.</li>
        <li>Recheck below. Review the capability results before attempting any action.</li>
      </ol>
      <p>{setup.fallback}</p>
      <button type="button" disabled={busy} onClick={() => void check()} className="rounded-lg border border-emerald-400/30 px-3 py-2 font-semibold text-emerald-200 disabled:opacity-50">{busy ? "Rechecking…" : "Recheck setup"}</button>
      <p className="text-xs text-slate-400">{setup.recheck}</p>
      {result && <p role="status" className="text-xs text-amber-200">{result}</p>}
      <details className="rounded border border-slate-700 p-2"><summary className="cursor-pointer">For your workspace operator</summary>
        <p className="mt-2">{setup.operatorStep}</p><p className="mt-2">{setup.credentialOwner}</p>
        <p className="mt-2"><b>Provider approval:</b> {setup.approval}</p><p className="mt-2"><b>Payment:</b> {setup.payment}</p>
        <p className="mt-2"><b>Current requested access:</b> {setup.scopes}</p><p className="mt-2"><b>Still missing:</b> {setup.missing}</p>
        {setup.callback && <p className="mt-2"><b>Callback route:</b> {setup.callback}. The operator must match the deployed OAuth redirect exactly; this is not a credential.</p>}
      </details>
    </div>
  </details>;
}
