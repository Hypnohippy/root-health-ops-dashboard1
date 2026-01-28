"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = {
  id: string;
  name?: string;
  access_token?: string;
};

function pickTokenFromUrl(): string {
  try {
    const url = new URL(window.location.href);

    const tokenQ = url.searchParams.get("token");
    if (tokenQ && tokenQ.trim()) return tokenQ.trim();

    const hash = (url.hash || "").replace(/^#/, "");
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const tokenH = hashParams.get("token");
      if (tokenH && tokenH.trim()) return tokenH.trim();
    }

    return "";
  } catch {
    return "";
  }
}

async function fetchJson(url: string, token?: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export default function PickFacebookPageClient() {
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return pickTokenFromUrl();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setBusy(true);
        setError(null);

        if (!token) throw new Error("Missing token. Please go back to Dashboard → Connect and try again.");

        const pagesRes = await fetchJson(
          "https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token&limit=50",
          token
        );

        const list: FbPage[] = Array.isArray(pagesRes.json?.data) ? pagesRes.json.data : [];
        if (!pagesRes.ok || list.length === 0) {
          throw new Error(
            pagesRes.json?.error?.message ||
              "Could not load your Pages. Make sure you granted pages_show_list and pages_manage_posts."
          );
        }

        if (cancelled) return;

        setPages(list);

        // Default select the first
        const first = list[0];
        setSelectedPageId(String(first?.id || ""));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Facebook connect failed.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const doSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const page = pages.find((p) => p.id === selectedPageId) || pages[0];
      const pageId = String(page?.id || "").trim();
      const pageToken = String(page?.access_token || "").trim();

      if (!pageId || !pageToken) {
        throw new Error("Could not resolve Page ID/token. Please reconnect Facebook from Dashboard → Connect.");
      }

      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "facebook",
          page_id: pageId,
          page_name: page?.name || "Facebook Page",
          page_access_token: pageToken,
          is_active: true,
          connection_type: "meta_facebook_page",
        }),
      });

      const json: any = await res.json().catch(() => null);

      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || `Failed to save Facebook connection (HTTP ${res.status}).`);
      }

      window.location.href = "/dashboard/connect?connected=facebook";
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur space-y-4">
        <h1 className="text-2xl md:text-3xl font-semibold">Connect Facebook Page</h1>

        <p className="text-sm text-slate-300">
          Pick the Page you want to post as. We’ll save it to your workspace.
        </p>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {busy ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
            Loading your Pages…
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
            <label className="block text-xs font-medium text-slate-300">Select Page</label>
            <select
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={doSave}
              disabled={saving || !selectedPageId}
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save & return to Connect"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
