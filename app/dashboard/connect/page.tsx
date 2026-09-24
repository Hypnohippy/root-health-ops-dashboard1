"use client";

import React, { useEffect, useMemo, useState } from "react";
import BrandGrowthProfileEditor from "../components/BrandGrowthProfileEditor";
import {
  capabilityLabels,
  channelCatalog,
  channelGroups,
  type CapabilityState,
  type ChannelDefinition,
} from "@/lib/channelCapabilities";
import { connectionHealthByPlatform, connectionSuccessMessage, type ConnectionHealth } from "@/lib/connectionUi";

const statusStyle = {
  Connected: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  Connect: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "Action required": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "Awaiting provider approval": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "Available soon": "border-slate-600 bg-slate-800 text-slate-300",
} as const;

const capabilityStyle: Record<CapabilityState, string> = {
  available: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  limited: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  planned: "border-slate-600 bg-slate-800 text-slate-300",
  unavailable: "border-slate-700 bg-slate-900 text-slate-500",
};

function scopedUrl(path: string, organisationId: string | null) {
  if (!organisationId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}organisationId=${encodeURIComponent(organisationId)}`;
}

function displayStatus(channel: ChannelDefinition, health?: ConnectionHealth) {
  if (channel.statusMode === "provider_approval") return "Awaiting provider approval" as const;
  if (channel.statusMode === "available_soon") return "Available soon" as const;
  if (health?.state === "connected") return "Connected" as const;
  if (health?.state === "expired" || health?.state === "reconnect_required") return "Action required" as const;
  return channel.statusMode === "managed_setup" ? "Action required" as const : "Connect" as const;
}

function ChannelCard({ channel, health, organisationId, onDisconnect }: {
  channel: ChannelDefinition;
  health?: ConnectionHealth;
  organisationId: string | null;
  onDisconnect: (provider: string) => Promise<void>;
}) {
  const status = displayStatus(channel, health);
  const canConnect = Boolean(channel.connectPath) && (status === "Connect" || status === "Action required");

  return (
    <article className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-sm transition hover:border-slate-600">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{channel.name}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">{channel.description}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle[status]}`}>{status}</span>
      </div>

      {health?.name && <p className="mt-3 text-xs text-slate-400">Connected as {health.name}</p>}
      {channel.note && <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs leading-5 text-slate-300">{channel.note}</p>}

      <div className="mt-4 flex flex-wrap gap-2" aria-label={`${channel.name} capabilities`}>
        {capabilityLabels.map((label) => {
          const capability = channel.capabilities[label] ?? "unavailable";
          return <span key={label} className={`rounded-full border px-2 py-1 text-[11px] font-medium ${capabilityStyle[capability]}`}>{label}: {capability}</span>;
        })}
      </div>

      <div className="mt-4 flex gap-2">
        {canConnect && <a href={scopedUrl(channel.connectPath!, organisationId)} className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300">{status === "Action required" ? "Reconnect" : "Connect"}</a>}
        {status === "Connected" && channel.disconnectable && <button type="button" onClick={() => onDisconnect(channel.id)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-rose-400 hover:text-rose-200">Disconnect</button>}
      </div>
    </article>
  );
}

export default function ConnectPage() {
  const [health, setHealth] = useState<ConnectionHealth[]>([]);
  const [message, setMessage] = useState("");
  const organisationId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("organisationId");
  const healthByProvider = useMemo(() => connectionHealthByPlatform(health), [health]);

  async function loadHealth() {
    const response = await fetch(scopedUrl("/api/social/connection-health", organisationId), { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load connections.");
    setHealth(body.connections || []);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    fetch(scopedUrl("/api/social/connection-health", organisationId), { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load connections.");
      setHealth(body.connections || []);
      const successMessage = connectionSuccessMessage(params);
      if (successMessage) setMessage(successMessage);
      if (params.get("error")) setMessage("That connection could not be completed. Please try again.");
    }).catch(() => setMessage("Connection status is temporarily unavailable."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function disconnect(provider: string) {
    const response = await fetch("/api/social-accounts", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, organisationId }),
    });
    if (!response.ok) return setMessage("Could not disconnect that channel.");
    setMessage(`${provider} disconnected.`);
    await loadHealth();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Connections</p>
          <h1 className="mt-2 text-3xl font-bold">Connect the channels your growth system uses</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">See what each connection can do today, what needs attention and what is planned. Provider credentials stay on the server.</p>
          {message && <p role="status" className="mt-4 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">{message}</p>}
        </header>

        <BrandGrowthProfileEditor />

        {channelGroups.map((group) => (
          <section key={group} aria-labelledby={`group-${group.replaceAll(" ", "-")}`}>
            <div className="mb-4">
              <h2 id={`group-${group.replaceAll(" ", "-")}`} className="text-xl font-semibold text-white">{group}</h2>
              <p className="mt-1 text-sm text-slate-400">Capabilities reflect the workflows currently implemented in Ops.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {channelCatalog.filter((channel) => channel.group === group).map((channel) => <ChannelCard key={channel.id} channel={channel} health={healthByProvider.get(channel.id)} organisationId={organisationId} onDisconnect={disconnect} />)}
            </div>
          </section>
        ))}

        <p className="border-t border-slate-800 pt-5 text-xs leading-5 text-slate-400">OAuth and managed server connections are shown from their current organisation-scoped state. Customers are never asked to paste organisation IDs, webhook URLs or provider secrets into this page.</p>
      </div>
    </main>
  );
}
