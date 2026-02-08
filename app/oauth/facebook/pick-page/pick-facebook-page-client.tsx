"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FbPage = { id: string; name: string; access_token?: string };

async function fetchJson(url: string, token: string) {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // Some endpoints don't accept Bearer, so fallback to query param
  if (!res.ok) {
    const u = new URL(url);
    if (!u.searchParams.get("access_token")) u.searchParams.set("access_token", token);
    const res2 = await fetch(u.toString(), { cache: "no-store" });
    const j2 = await res2.json().catch(() => null);
    if (!res2.ok) {
      throw new Error(j2?.error?.message || `Facebook request failed (HTTP ${res2.status})`);
    }
    return j2;
  }

  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error?.message || `Facebook request failed (HTTP ${res.status})`);
  return j;
}

export default function PickFacebookPageClient() {
  const router = useRouter();
  const sp = useSearchParams();

  // Accept common token param names coming back from callback
  const token = useMemo(() => {
    const t =
      (sp.get("token") || "").trim() ||
      (sp.get("access_token") || "").trim() ||
      (sp.get("userToken") || "").trim();
    return t;
  }, [sp]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");

  async function loadPages() {
    setLoading(true);
    setError(null);

    try {
      if (!token) throw new Error("Missing token. Please go back to Dashboard → Connect and try again.");

      // ✅ pull pages user manages (includes page access_token in response)
      const pagesRes = await fetchJson(
        "https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token&limit=100",
        token
      );

      const list: FbPage[] = Array.isArray(pagesRes?.data) ? pagesRes.data : [];
      if (list.length === 0) throw new Error("No Pages found. Make sure you selected the correct Facebook account and granted Page permissions.");

      setPages(list);
      setSelectedPageId(String(list[0]?.id || ""));
    } catch (e: any) {
      setError(e?.message || "Failed to load Facebook Pages.");
    } finally {
      setLoading(false);
    }
  }

  async function connectSelected() {
    setSaving(true);
    setError(null);

    try {
      if (!token) throw new Error("Missing token. Please go back to Dashboard → Connect and try again.");
      if (!selectedPageId) throw new Error("Select a Page first.");

      // ✅ IMPORTANT:
      // we must call OUR API to save the Page token into Supabase social_accounts
      const res = await fetch("/api/oauth/facebook/connect-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          token, // user token (server will exchange to page token)
          pageId: selectedPageId,
        }),
      });

      const j = await res.json().catch(() => null);

      if (!res.ok || !j?.success) {
        throw new Error(j?.error || `Failed to save Facebook connection (HTTP ${res.status}).`);
      }

      // ✅ back to connect screen (or wherever you prefer)
      router.push("/dashboard/connect?fb=connected");
    } catch (e: any) {
      setError(e?.message || "Failed to connect Facebook Page.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
        <h1 className="text-2xl font-semibold">Pick your Facebook Page</h1>

        {!token ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
            Missing token. Go back to <b>Dashboard → Connect</b> and start Facebook connect again.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Loading Pages…
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
            <label className="text-sm text-slate-300">Choose Page</label>
            <select
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm"
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-950">
                  {p.name} ({p.id})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={connectSelected}
              disabled={saving || !selectedPageId || !token}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Connect this Page"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/dashboard/connect")}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="text-xs text-slate-400">
          If Facebook still shows “Connect” after this, the connect callback isn’t sending you to this page correctly.
        </div>
      </div>
    </div>
  );
}
