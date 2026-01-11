"use client";

import React, { useEffect, useMemo, useState } from "react";

type SocialAccountRow = {
  id?: string;
  platform?: string;
  connection_type?: string;
  display_name?: string | null;
};

type QuickBlastResponse = any;

const MINIMUM_PLATFORMS = ["facebook", "linkedin", "instagram", "threads", "tiktok"] as const;

function normalizePlatform(p: string) {
  return (p || "").toLowerCase().trim();
}

function prettyPlatform(p: string) {
  const x = normalizePlatform(p);
  if (x === "google") return "Google Business Profile";
  if (x === "tiktok") return "TikTok";
  return x.charAt(0).toUpperCase() + x.slice(1);
}

export default function DashboardPage() {
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["facebook", "linkedin"]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<QuickBlastResponse | null>(null);

  // Build a stable, ordered list:
  // - Prefer platforms from /api/social-accounts
  // - Ensure minimum platforms are always visible in UI
  // - Keep a sensible display order
  const orderedPlatforms = useMemo(() => {
    const fromApi = (availablePlatforms || []).map(normalizePlatform).filter(Boolean);
    const merged = Array.from(new Set([...fromApi, ...MINIMUM_PLATFORMS]));
    const order = [
      "facebook",
      "linkedin",
      "instagram",
      "threads",
      "tiktok",
      "twitter",
      "youtube",
      "reddit",
      "google",
    ];

    merged.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return merged;
  }, [availablePlatforms]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlatforms() {
      setLoadingAccounts(true);
      setAccountsError(null);

      try {
        const res = await fetch("/api/social-accounts", { method: "GET" });
        const data = await res.json().catch(() => null);

        // /api/social-accounts may return:
        // - array of rows
        // - or { data: [...] }
        const rows: SocialAccountRow[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
          ? data.data
          : [];

        const platforms = rows
          .map((r) => normalizePlatform(r.platform || ""))
          .filter(Boolean);

        if (!cancelled) {
          setAvailablePlatforms(Array.from(new Set(platforms)));
        }
      } catch (e: any) {
        if (!cancelled) setAccountsError(e?.message || "Failed to load social accounts.");
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    }

    loadPlatforms();
    return () => {
      cancelled = true;
    };
  }, []);

  // If the current selection includes platforms that no longer exist in the selector list,
  // keep them anyway (so we never silently drop user choice). But if selection is empty,
  // default to fb+li.
  useEffect(() => {
    if (selectedPlatforms.length === 0) {
      setSelectedPlatforms(["facebook", "linkedin"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlatform(p: string) {
    const platform = normalizePlatform(p);
    setSelectedPlatforms((prev) => {
      const set = new Set(prev.map(normalizePlatform));
      if (set.has(platform)) set.delete(platform);
      else set.add(platform);
      return Array.from(set);
    });
  }

  async function runQuickBlast() {
    setSubmitting(true);
    setSubmitError(null);
    setRawResponse(null);

    const msg = message.trim();
    const platforms = selectedPlatforms.map(normalizePlatform).filter(Boolean);

    if (!msg) {
      setSubmitting(false);
      setSubmitError("Please enter a message.");
      return;
    }

    if (platforms.length === 0) {
      setSubmitting(false);
      setSubmitError("Please select at least one platform.");
      return;
    }

    try {
      const res = await fetch("/api/social/quick-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          platforms,
          imageUrl: imageUrl.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      setRawResponse(data);

      // Don’t assume exact response shape — but try to surface something helpful.
      // Common patterns:
      // { success: true, results: [...] }
      // { success: false, error: "..." }
      // { ok: false, ... }
      const success =
        data?.success === true ||
        data?.ok === true ||
        (Array.isArray(data?.results) && data.results.length > 0);

      if (!success) {
        const err =
          data?.error ||
          data?.message ||
          "Quick Blast did not succeed on any channel. Check your Ayrshare connections or plan.";
        setSubmitError(String(err));
      }
    } catch (e: any) {
      setSubmitError(e?.message || "Quick Blast request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedSet = useMemo(() => new Set(selectedPlatforms.map(normalizePlatform)), [selectedPlatforms]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Quick Blast posts immediately to the platforms you select (via Ayrshare).
          </p>
        </div>
      </div>

      {/* QUICK BLAST CARD */}
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="p-5 border-b">
          <h2 className="text-lg font-semibold">Quick Blast</h2>
          <p className="text-sm text-gray-500">
            Select platforms (including Instagram / Threads) and post now.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Platforms */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Platforms</div>
                <div className="text-xs text-gray-500">
                  These are loaded from <code className="px-1 py-0.5 rounded bg-gray-50 border">/api/social-accounts</code>.
                </div>
              </div>

              {loadingAccounts ? (
                <div className="text-xs text-gray-500">Loading…</div>
              ) : accountsError ? (
                <div className="text-xs text-red-600">{accountsError}</div>
              ) : (
                <div className="text-xs text-gray-500">
                  Connected:{" "}
                  <span className="font-medium">
                    {availablePlatforms.length ? availablePlatforms.map(prettyPlatform).join(", ") : "None detected"}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {orderedPlatforms.map((p) => {
                const checked = selectedSet.has(normalizePlatform(p));
                return (
                  <label
                    key={p}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer select-none ${
                      checked ? "bg-gray-50" : "bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={() => togglePlatform(p)}
                    />
                    <span className="text-sm">{prettyPlatform(p)}</span>
                  </label>
                );
              })}
            </div>

            <div className="text-xs text-gray-500">
              Tip: If Instagram/Threads are connected in Ayrshare but still fail, Ayrshare may require plan/features or specific
              account permissions. This UI at least ensures they’re selectable and actually sent to the API.
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Message</div>
            <textarea
              className="w-full min-h-[120px] rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-gray-200"
              placeholder="Write your post…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {/* Optional image */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Image URL (optional)</div>
            <input
              className="w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-gray-200"
              placeholder="https://…"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <div className="text-xs text-gray-500">
              If your Quick Blast endpoint supports images, it will use this URL. Leave blank for text-only.
            </div>
          </div>

          {/* Submit */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
            <button
              onClick={runQuickBlast}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
            >
              {submitting ? "Posting…" : "Post now"}
            </button>

            <div className="text-xs text-gray-500">
              Sending platforms: <span className="font-medium">{selectedPlatforms.map(prettyPlatform).join(", ")}</span>
            </div>
          </div>

          {/* Errors */}
          {submitError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          {/* Raw response for debugging */}
          {rawResponse ? (
            <div className="rounded-xl border bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">Ayrshare / Quick Blast response</div>
              <pre className="text-xs whitespace-pre-wrap break-words text-gray-800">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>

      {/* You can keep or remove any other dashboard widgets below.
          I’m not adding more changes here until Quick Blast is confirmed fixed. */}
    </div>
  );
}
