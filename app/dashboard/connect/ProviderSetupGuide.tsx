"use client";
import { buildProviderSetup } from "@/lib/providerSetup";
import type { ConnectionHealth } from "@/lib/connectionUi";
/** Support diagnostics are rendered inside the card's Advanced technical details. */
export default function ProviderSetupGuide({ platform, health }: { platform: string; health?: ConnectionHealth }) {
  const setup = health?.setup || buildProviderSetup(platform, health?.state || "not_connected", null);
  return <div className="mt-3 space-y-2 text-xs text-slate-400">
    <p><b>Setup:</b> {setup.label}</p>
    <p><b>Credential/config presence:</b> {setup.connected}; {setup.configuration}</p>
    <p>{setup.credentialOwner}</p>
    <p><b>Operator/app configuration:</b> {setup.operatorStep}</p>
    <p><b>Provider review status:</b> {setup.approval}</p>
    <p><b>Raw OAuth scopes:</b> {setup.scopes}</p>
    <p><b>Missing access:</b> {setup.missing}</p>
    <p><b>Callback route:</b> {setup.callback || "None"}</p>
    <p><b>Account requirements:</b> {setup.payment}</p>
    <p>{setup.limitation}</p><p>{setup.recheck}</p>
  </div>;
}
