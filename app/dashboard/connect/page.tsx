"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ChannelCard from "./ChannelCard";
import { fetchConnectionHealth, disconnectConnection } from "@/lib/connectionActions";
import BrandGrowthProfileEditor from "../components/BrandGrowthProfileEditor";
import {
  channelCatalog,
  channelGroups,
} from "@/lib/channelCapabilities";
import { connectionHealthByPlatform, connectionSuccessMessage, type ConnectionHealth } from "@/lib/connectionUi";

export default function ConnectPage() {
  const healthRequest = useRef(0);
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
    const request = ++healthRequest.current;
    const body = await fetchConnectionHealth(organisationId);
    if (request !== healthRequest.current) return;
    setHealth(body.connections);
    setCheckedAt(body.checkedAt);
  }

  async function recheck() {
    try {
      await loadHealth();
      setMessage("Connection information updated. This checks saved connection details, not sending or publishing access.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check connections. Please try again.");
      throw error;
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    void loadHealth().then(() => {
      const successMessage = connectionSuccessMessage(params);
      if (successMessage) setMessage(successMessage);
      if (params.get("error")) setMessage("That connection could not be completed. Please try again.");
    }).catch(() => setMessage("Connection status is temporarily unavailable. Use Check connection to retry."));
    return () => { healthRequest.current++; };
  }, [organisationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const returned = () => { void loadHealth().catch(() => setMessage("Could not refresh connections. Use Check connection to retry.")); };
    window.addEventListener("focus", returned);
    return () => window.removeEventListener("focus", returned);
  }, [organisationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function disconnect(provider: string) {
    healthRequest.current++;
    await disconnectConnection(provider, organisationId);
    healthRequest.current++;
    setHealth(previous => previous.map(connection => connection.platform === provider
      ? { ...connection, state: "not_connected", name: null, expiresAt: null, setup: undefined } : connection));
    const name = channelCatalog.find(channel => channel.id === provider)?.name || provider;
    setMessage(`${name} disconnected from Ops.`);
    try { await loadHealth(); }
    catch { setMessage(`${name} disconnected from Ops. The remaining connection information could not be refreshed; check again.`); }
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
          <div className="mt-4 grid gap-3 lg:grid-cols-2">{sections.connected.map((channel) => <ChannelCard key={channel.id} channel={channel} health={healthByProvider.get(channel.id)} organisationId={organisationId} onDisconnect={disconnect} recheck={recheck} />)}</div>
          {sections.connected.length === 0 && <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No connected accounts are reported yet.</p>}
        </section>

        <section aria-labelledby="attention-channels">
          <h2 id="attention-channels" className="text-xl font-semibold">Needs attention</h2>
          <p className="mt-1 text-sm text-slate-400">See whether setup needs your attention or help from Root.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">{sections.needsAttention.map((channel) => <ChannelCard key={channel.id} channel={channel} health={healthByProvider.get(channel.id)} organisationId={organisationId} onDisconnect={disconnect} recheck={recheck} />)}</div>
        </section>

        <details className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <summary className="cursor-pointer text-lg font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Available / Coming soon <span className="ml-2 text-sm font-normal text-slate-400">{sections.future.length} planned channels</span></summary>
          <div className="mt-4 space-y-6">{channelGroups.map((group) => {
            const channels = sections.future.filter((channel) => channel.group === group);
            return channels.length ? <section key={group}><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{group}</h3><div className="grid gap-3 lg:grid-cols-2">{channels.map((channel) => <ChannelCard key={channel.id} channel={channel} health={healthByProvider.get(channel.id)} organisationId={organisationId} onDisconnect={disconnect} recheck={recheck} />)}</div></section> : null;
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
