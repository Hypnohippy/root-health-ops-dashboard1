"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = {
  id: string;
  name: string;
  access_token?: string; // returned by /me/accounts
};

function base64UrlToJson(s: string): any | null {
  try {
    // base64url -> base64
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readTokenFromBrowser(): string {
  if (typeof window === "undefined") return "";

  // token should be in querystring
  const url = new URL(window.location.href);
  const qToken = url.searchParams.get("token") || url.searchParams.get("access_token");
  if (qToken) return qToken;

  // fallback: sometimes people mistakenly put params in hash
  const hash = (url.hash || "").replace(/^#/, "");
  if (hash) {
    const hp = new URLSearchParams(hash);
    const hToken = hp.get("token") || hp.get("access_token");
    if (hToken) return hToken;
  }

  return "";
}

export default function PickFacebookPageClient({
  token,
  state,
}: {
  token?: string;
  state?: string;
}) {
  const resolvedToken = useMemo(() => {
    const t = (token || "").trim();
    if (t) return t;
    return readTokenFromBrowser();
  }, [token]);

  const decodedState = useMemo(() => {
    const s = (state || "").trim();
    if (!s) return null;
    return base64UrlToJson(s);
  }, [state]);

  const organisationId: string | null =
    typeof decodedState?.organisationId === "string" ? decodedState.organisationId : null;

  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string>("");

  const debug = useMemo(() => {
    if (typeof window === "undefined") return null;
    const u = new URL(window.location.href);
    return {
      href: window.location.href,
      search: u.search,
      hash: u.hash,
      tokenPropLength: (token || "").length,
      tokenResolvedLength: resolvedToken.length,
      hasOrganisationId: Boolean(organisationId),
    };
  }, [token, resolvedToken, organisationId]);

  async function loadPages() {
    setLoading(true);
    setError(null);

    try {
      const t = (resolvedToken || "").trim();
      if (!t) {
        setError("Missing token. Please go back and click Connect again.");
        setPages([]);
        return;
      }

      const res = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(
          t
        )}`,
        { cache: "no-store" }
      );

      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          `Could not load Facebook Pages. (${res.status})\n` +
            (json?.error?.message ? json.error.message : "Unknown error")
        );
        setPages([]);
        return;
      }

      const list: FbPage[] = Array.isArray(json?.data) ? json.data : [];
      setPages(list);

      // auto-select if exactly one
      if (list.length === 1 && list[0]?.id) setPickedId(list[0].id);

      if (list.length === 0) {
        setError(
          "No Pages returned.\n\nIf you don’t see the right Page:\n" +
            "• Make sure you logged into the correct Facebook account\n" +
            "• Make sure you have Page access (Full control / Admin)\n" +
            "• Try reconnecting and re-approving permissions"
        );
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load Pages.");
      setPages([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveSelection() {
    setError(null);
    try {
      const picked = pages.find((p) => p.id === pickedId);
      if (!picked) {
        setError("Please select a Page first.");
        return;
      }

      // Save to your existing social_accounts route
      // NOTE: your table currently does NOT include a token column.
      // For now we store page_id + page_name only (this fixes “wrong page”).
      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId: organisationId || undefined,
          platform: "facebook",
          pageId: picked.id,
          pageName: picked.name,
          // If later you add a secure token field/table, we can store picked.access_token then.
        }),
      });

      const out: any = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(out?.error || `Failed to save Page (HTTP ${res.status}).`);
      }

      // Send user back to Connect with a friendly success flag
      const back = new URL("/connect", window.location.origin);
      back.searchParams.set("provider", "facebook");
      back.searchParams.set("success", "true");
      back.searchParams.set("pageName", picked.name);
      window.location.href = back.toString();
    } catch (e: any) {
      setError(e?.message || "Failed to save selection.");
    }
  }

  useEffect(() => {
    void loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur">
        <h1 className="text-2xl font-semibold">Pick your Facebook Page</h1>
        <p className="mt-2 text-sm text-slate-300">
          Select which Page Root Health Ops should connect to.
        </p>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={loadPages}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Reload Pages"}
          </button>

          <button
            type="button"
            onClick={() => {
              // hard refresh without changing anything
              window.location.reload();
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
          >
            Refresh page
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {pages.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 cursor-pointer"
            >
              <input
                type="radio"
                name="fbpage"
                value={p.id}
                checked={pickedId === p.id}
                onChange={() => setPickedId(p.id)}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100 truncate">{p.name}</div>
                <div className="text-xs text-slate-400 truncate">{p.id}</div>
              </div>
            </label>
          ))}

          {pages.length > 0 && (
            <button
              type="button"
              onClick={saveSelection}
              className="mt-2 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
            >
              Use this Page
            </button>
          )}
        </div>

        {/* Debug panel (super helpful right now) */}
        <details className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
          <summary className="cursor-pointer text-xs font-semibold text-slate-200">
            Debug (click to expand)
          </summary>
          <pre className="mt-3 text-[11px] text-slate-300 whitespace-pre-wrap break-words">
            {JSON.stringify(debug, null, 2)}
          </pre>
          <pre className="mt-3 text-[11px] text-slate-300 whitespace-pre-wrap break-words">
            decodedState: {JSON.stringify(decodedState, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
