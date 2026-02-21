"use client";

import React, { useEffect, useMemo, useState } from "react";

type Pattern = {
  id: string;
  organisation_id: string;
  source_post_id: string | null;
  platform: string | null;
  pattern_type: string;
  format: string;
  hook_style: string | null;
  cta_style: string | null;
  notes: string | null;
  performance_score: number | null;
  suggested: boolean;
  saved_by_user: boolean;
  created_at: string;
};

type SuggestionItem = {
  platform: string;
  pattern_type: string;
  format: "text" | "image" | "video";
  hook_style: string;
  cta_style: string;
  notes?: string;
};

type SuggestionResponse = {
  success: boolean;
  organisationId?: string;
  suggestion?: SuggestionItem;
  suggestions?: SuggestionItem[];
  error?: string;
};

function getOrganisationIdFromLocalStorage(): string | null {
  if (typeof window === "undefined") return null;

  const keysToTry = [
    "activeOrganisationId",
    "activeOrganizationId",
    "organisationId",
    "organizationId",
    "orgId",
    "selectedOrganisationId",
    "selectedOrganizationId",
  ];

  for (const key of keysToTry) {
    const v = window.localStorage.getItem(key);
    if (v && v.trim()) return v.trim();
  }

  // Some apps store a JSON blob; try a couple common ones
  const jsonKeys = ["activeOrganisation", "activeOrganization", "org"];
  for (const key of jsonKeys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const candidate =
        parsed?.id || parsed?.organisation_id || parsed?.organization_id;
      if (candidate && String(candidate).trim()) return String(candidate).trim();
    } catch {
      // ignore
    }
  }

  return null;
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function CampaignsPage() {
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loadingPatterns, setLoadingPatterns] = useState(false);

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [activeTab, setActiveTab] = useState<"patterns" | "suggestions">(
    "suggestions"
  );

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [savedOnly, setSavedOnly] = useState<boolean>(false);

  useEffect(() => {
    const id = getOrganisationIdFromLocalStorage();
    setOrganisationId(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadPatterns(orgId: string) {
    setLoadingPatterns(true);
    setError(null);
    try {
      // ✅ Adjust this route name if your API differs
      const res = await fetch(`/api/campaigns/patterns?organisationId=${encodeURIComponent(orgId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(
          data?.error || data?.message || `Failed to load patterns (${res.status})`
        );
      }

      const items: Pattern[] = data?.patterns || data?.data || [];
      setPatterns(Array.isArray(items) ? items : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load patterns");
    } finally {
      setLoadingPatterns(false);
    }
  }

  async function loadSuggestions(orgId: string) {
    setLoadingSuggestions(true);
    setError(null);
    try {
      // ✅ Adjust this route name if your API differs
      const res = await fetch(`/api/campaigns/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId: orgId }),
      });

      const data: SuggestionResponse | null = await safeJson(res);
      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error || `Failed to generate suggestions (${res.status})`
        );
      }

      const items = data.suggestions || (data.suggestion ? [data.suggestion] : []);
      setSuggestions(Array.isArray(items) ? items : []);
      setToast("Suggestions refreshed ✅");
    } catch (e: any) {
      setError(e?.message || "Failed to load suggestions");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  useEffect(() => {
    if (!organisationId) return;
    // Load both, but start user on suggestions tab (usually the goal)
    loadPatterns(organisationId);
    loadSuggestions(organisationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationId]);

  async function saveSuggestionAsPattern(item: SuggestionItem) {
    if (!organisationId) return;

    setError(null);
    try {
      // ✅ Adjust this route name if your API differs
      const res = await fetch(`/api/campaigns/patterns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          platform: item.platform,
          pattern_type: item.pattern_type,
          format: item.format,
          hook_style: item.hook_style,
          cta_style: item.cta_style,
          notes: item.notes || null,
          suggested: true,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(
          data?.error || data?.message || `Failed to save pattern (${res.status})`
        );
      }

      setToast("Saved to Patterns ✅");
      // Refresh patterns list
      await loadPatterns(organisationId);
      setActiveTab("patterns");
    } catch (e: any) {
      setError(e?.message || "Failed to save suggestion");
    }
  }

  async function toggleSaved(patternId: string, nextSaved: boolean) {
    if (!organisationId) return;

    setError(null);
    try {
      // ✅ Adjust this route name if your API differs
      const res = await fetch(`/api/campaigns/patterns/${encodeURIComponent(patternId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId, saved_by_user: nextSaved }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(
          data?.error || data?.message || `Failed to update (${res.status})`
        );
      }

      setPatterns((prev) =>
        prev.map((p) => (p.id === patternId ? { ...p, saved_by_user: nextSaved } : p))
      );
    } catch (e: any) {
      setError(e?.message || "Failed to update saved status");
    }
  }

  const filteredPatterns = useMemo(() => {
    let list = [...patterns];

    if (platformFilter !== "all") {
      list = list.filter((p) => (p.platform || "unknown") === platformFilter);
    }
    if (typeFilter !== "all") {
      list = list.filter((p) => p.pattern_type === typeFilter);
    }
    if (savedOnly) {
      list = list.filter((p) => p.saved_by_user);
    }

    // Sort newest first
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return list;
  }, [patterns, platformFilter, typeFilter, savedOnly]);

  const platformOptions = useMemo(() => {
    const set = new Set<string>();
    patterns.forEach((p) => set.add(p.platform || "unknown"));
    suggestions.forEach((s) => set.add(s.platform || "unknown"));
    return ["all", ...Array.from(set).sort()];
  }, [patterns, suggestions]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    patterns.forEach((p) => set.add(p.pattern_type));
    return ["all", ...Array.from(set).sort()];
  }, [patterns]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Campaigns</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Growth Lab: capture winning content patterns and generate new ones.
          </p>
          <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
            Org: {organisationId || "Not found (check localStorage key / org selection)"}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setActiveTab("suggestions")}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: activeTab === "suggestions" ? "rgba(255,255,255,0.10)" : "transparent",
              cursor: "pointer",
            }}
          >
            Suggestions
          </button>
          <button
            onClick={() => setActiveTab("patterns")}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: activeTab === "patterns" ? "rgba(255,255,255,0.10)" : "transparent",
              cursor: "pointer",
            }}
          >
            Patterns
          </button>
        </div>
      </div>

      {!organisationId && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.05)",
            marginBottom: 16,
          }}
        >
          <strong>Organisation ID not found.</strong>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            This page looks for your org id in localStorage. If your app stores it
            under a different key, tell me the key name and I’ll wire it in.
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            border: "1px solid rgba(255,0,0,0.25)",
            background: "rgba(255,0,0,0.08)",
            marginBottom: 16,
          }}
        >
          <strong>Problem:</strong> {error}
        </div>
      )}

      {toast && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(0,255,0,0.20)",
            background: "rgba(0,255,0,0.08)",
            marginBottom: 16,
          }}
        >
          {toast}
        </div>
      )}

      {activeTab === "suggestions" && (
        <div
          style={{
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.04)",
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Suggested Patterns</h2>

            <button
              disabled={!organisationId || loadingSuggestions}
              onClick={() => organisationId && loadSuggestions(organisationId)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                cursor: !organisationId || loadingSuggestions ? "not-allowed" : "pointer",
                opacity: !organisationId || loadingSuggestions ? 0.6 : 1,
              }}
            >
              {loadingSuggestions ? "Refreshing…" : "Refresh suggestions"}
            </button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {suggestions.length === 0 && (
              <div style={{ opacity: 0.8, padding: 12 }}>
                No suggestions yet. Click “Refresh suggestions”.
              </div>
            )}

            {suggestions.map((s, idx) => (
              <div
                key={`${s.platform}-${s.pattern_type}-${idx}`}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {s.platform.toUpperCase()} • {s.pattern_type} • {s.format}
                    </div>
                    <div style={{ marginTop: 8, opacity: 0.85 }}>
                      <div>Hook: {s.hook_style}</div>
                      <div>CTA: {s.cta_style}</div>
                      {s.notes && <div style={{ marginTop: 6 }}>Notes: {s.notes}</div>}
                    </div>
                  </div>

                  <button
                    onClick={() => saveSuggestionAsPattern(s)}
                    disabled={!organisationId}
                    style={{
                      height: 40,
                      padding: "0 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(255,255,255,0.08)",
                      cursor: !organisationId ? "not-allowed" : "pointer",
                      opacity: !organisationId ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "patterns" && (
        <div
          style={{
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.04)",
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Saved Patterns</h2>

            <button
              disabled={!organisationId || loadingPatterns}
              onClick={() => organisationId && loadPatterns(organisationId)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                cursor: !organisationId || loadingPatterns ? "not-allowed" : "pointer",
                opacity: !organisationId || loadingPatterns ? 0.6 : 1,
              }}
            >
              {loadingPatterns ? "Refreshing…" : "Refresh patterns"}
            </button>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
            }}
          >
            <label style={{ fontSize: 13, opacity: 0.9 }}>
              Platform{" "}
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                style={{ marginLeft: 6, padding: 6, borderRadius: 8 }}
              >
                {platformOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 13, opacity: 0.9 }}>
              Type{" "}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ marginLeft: 6, padding: 6, borderRadius: 8 }}
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 13, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={savedOnly}
                onChange={(e) => setSavedOnly(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Saved only
            </label>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {loadingPatterns && (
              <div style={{ opacity: 0.8, padding: 12 }}>Loading patterns…</div>
            )}

            {!loadingPatterns && filteredPatterns.length === 0 && (
              <div style={{ opacity: 0.8, padding: 12 }}>
                No patterns yet. Save a suggestion first.
              </div>
            )}

            {filteredPatterns.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {(p.platform || "unknown").toUpperCase()} • {p.pattern_type} • {p.format}
                    </div>
                    <div style={{ marginTop: 8, opacity: 0.85 }}>
                      <div>Hook: {p.hook_style || "—"}</div>
                      <div>CTA: {p.cta_style || "—"}</div>
                      {p.performance_score !== null && (
                        <div>Score: {p.performance_score}</div>
                      )}
                      {p.notes && <div style={{ marginTop: 6 }}>Notes: {p.notes}</div>}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                      Created: {new Date(p.created_at).toLocaleString()}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleSaved(p.id, !p.saved_by_user)}
                    style={{
                      height: 40,
                      padding: "0 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: p.saved_by_user ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.saved_by_user ? "Saved ✓" : "Save"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
