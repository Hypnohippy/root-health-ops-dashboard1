"use client";

import React, { useEffect, useMemo, useState } from "react";
import ChannelCard from "./ChannelCard";
import BrandGrowthProfileEditor from "../components/BrandGrowthProfileEditor";
import {
  channelCatalog,
  channelGroups,
} from "@/lib/channelCapabilities";
import { connectionHealthByPlatform, connectionSuccessMessage, type ConnectionHealth } from "@/lib/connectionUi";

function scopedUrl(path: string, organisationId: string | null) {
  if (!organisationId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}organisationId=${encodeURIComponent(organisationId)}`;
}
export default function ConnectPage() {
  const [health, setHealth] = useState<ConnectionHealth[]>([]);
  const [message, setMessage] = useState("");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const organisationId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("organisationId");
  const healthByProvider = useMemo(() => connectionHealthByPlatform(health), [health]);
  const sections = useMemo(() => {
    const current = channelCatalog.filter((channel) => channel.statusMode !== "available_soon");
    const connected = current.filter((channel) => healthByProvider.get(channel.id)?.state === "connected");
    const needsAttention = current.filter((channel) => !connected.includes(channel));
    const future = channelCatalog.filter((channel) => channel.statusMode === "available_soon");
    return { connected, needsAttention, future };
  }, [healthByProvider]);

  async function loadHealth() {
    const response = await fetch(scopedUrl("/api/social/connection-health", organisationId), { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load connections.");
    setHealth(body.connections || []);
    setCheckedAt(body.checkedAt || null);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    fetch(scopedUrl("/api/social/connection-health", organisationId), { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load connections.");
      setHealth(body.connections || []);
      setCheckedAt(body.checkedAt || null);
      const successMessage = connectionSuccessMessage(params);
      if (successMessage) setMessage(successMessage);
      if (params.get("error")) setMessage("That connection could not be completed. Please try again.");
    }).catch(() => setMessage("Connection status is temporarily unavailable."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const returned = () => { void loadHealth().catch(() => setMessage("Recheck failed. Previous connection data may be stale.")); };
    window.addEventListener("focus", returned);
    return () => window.removeEventListener("focus", returned);
  }, [organisationId]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">See what is connected, what Ops can do and whether you need to take a next step.</p>
          {checkedAt && <p className="mt-3 text-xs text-slate-400">Last checked: {new Date(checkedAt).toLocaleString()}. Sending and publishing are not tested by this check.</p>}
          {message && <p role="status" className="mt-4 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">{message}</p>}
        </header>

        <section aria-labelledby="connected-channels">
          <h2 id="connected-channels" className="text-xl font-semibold">Connected accounts</h2>
          <p className="mt-1 text-sm text-slate-400">Each card explains what is available and what still needs checking.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">{sections.connected.map((channel) => <ChannelCard key={channel.id} channel={channel} health={healthByProvider.get(channel.id)} organisationId={organisationId} onDisconnect={disconnect} recheck={loadHealth} />)}</div>
          {sections.connected.length === 0 && <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No connected accounts are reported yet.</p>}
        </section>

        <section aria-labelledby="attention-channels">
          <h2 id="attention-channels" className="text-xl font-semibold">Needs attention</h2>
          <p className="mt-1 text-sm text-slate-400">See whether setup needs your attention or help from Root.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">{sections.needsAttention.map((channel) => <ChannelCard key={channel.id} channel={channel} health={healthByProvider.get(channel.id)} organisationId={organisationId} onDisconnect={disconnect} recheck={loadHealth} />)}</div>
        </section>

        <details className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <summary className="cursor-pointer text-lg font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Available / Coming soon <span className="ml-2 text-sm font-normal text-slate-400">{sections.future.length} planned channels</span></summary>
          <div className="mt-4 space-y-6">{channelGroups.map((group) => {
            const channels = sections.future.filter((channel) => channel.group === group);
            return channels.length ? <section key={group}><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{group}</h3><div className="grid gap-3 lg:grid-cols-2">{channels.map((channel) => <ChannelCard key={channel.id} channel={channel} health={healthByProvider.get(channel.id)} organisationId={organisationId} onDisconnect={disconnect} recheck={loadHealth} />)}</div></section> : null;
          })}</div>
        </details>

        <details className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <summary className="cursor-pointer text-lg font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Brand &amp; Growth Profile</summary>
          <div className="mt-5"><BrandGrowthProfileEditor /></div>
        </details>

        <p className="border-t border-slate-800 pt-5 text-xs leading-5 text-slate-400">Your connections belong to this organisation. Root handles the technical setup; you will never need to paste passwords or secret keys here.</p>
      </div>
    </main>
  );
}
