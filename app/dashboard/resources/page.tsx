"use client";

import React, { useEffect, useMemo, useState } from "react";

type Resource = {
  id: string;
  title: string;
  resource_type: string;
  content: any;
  created_at: string;
  updated_at?: string | null;
};

type FilterType = "all" | "webinar_outline" | "presentation" | "guide" | "course" | "worksheet" | "pdf";

function prettyType(v: string) {
  const s = String(v || "").trim();
  if (!s) return "resource";
  return s.replace(/_/g, " ");
}

export default function ResourcesPage() {
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOrganisation() {
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data?.organisationId) {
        throw new Error(data?.error || "Failed to load organisation");
      }

      setOrganisationId(data.organisationId);
      return data.organisationId as string;
    } catch (e: any) {
      setError(e?.message || "Failed to load organisation");
      return null;
    }
  }

  async function loadResources(orgId?: string) {
    const id = orgId || organisationId;
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/resource-library?organisationId=${id}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load resources");
      }

      const rows = Array.isArray(data?.resources) ? data.resources : [];
      setResources(rows);

      if (rows.length > 0 && !selected) {
        setSelected(rows[0]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load resources");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      const org = await loadOrganisation();
      if (org) {
        loadResources(org);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredResources = useMemo(() => {
    if (filter === "all") return resources;
    return resources.filter((r) => String(r.resource_type || "") === filter);
  }, [resources, filter]);

  useEffect(() => {
    if (!selected) return;
    const stillExists = filteredResources.some((r) => r.id === selected.id);
    if (!stillExists) {
      setSelected(filteredResources[0] || null);
    }
  }, [filteredResources, selected]);

  const selectedContent = selected?.content || null;
  const selectedType = String(selected?.resource_type || "").trim();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-7xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Resource Library</h1>
            <p className="text-sm text-slate-400 mt-1">
              Your saved guides, presentations, webinars and future resources.
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadResources()}
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10"
          >
            Refresh
          </button>
        </header>

        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All" },
            { key: "webinar_outline", label: "Webinars" },
            { key: "presentation", label: "Presentations" },
            { key: "guide", label: "Guides" },
            { key: "course", label: "Courses" },
            { key: "worksheet", label: "Worksheets" },
            { key: "pdf", label: "PDFs" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key as FilterType)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs",
                filter === item.key
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-white/10",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-sm text-slate-400">Loading resources...</div>}

        {error && <div className="text-sm text-red-400">{error}</div>}

        {!loading && filteredResources.length === 0 && (
          <div className="text-sm text-slate-400">No resources saved yet.</div>
        )}

        <div className="grid lg:grid-cols-[360px_1fr] gap-6">
          <div className="space-y-3">
            {filteredResources.map((r) => {
              const isSelected = selected?.id === r.id;

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(r)}
                  className={[
                    "w-full text-left rounded-2xl border p-4 space-y-2 transition",
                    isSelected
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-slate-700 bg-slate-900/70 hover:bg-slate-900",
                  ].join(" ")}
                >
                  <div className="flex justify-between gap-3">
                    <div className="font-semibold text-slate-100">{r.title}</div>
                    <div className="text-xs text-slate-400 shrink-0">
                      {prettyType(r.resource_type)}
                    </div>
                  </div>

                  <div className="text-xs text-slate-500">
                    Created {new Date(r.created_at).toLocaleString()}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 min-h-[420px]">
            {!selected ? (
              <div className="text-sm text-slate-400">Select a resource to view it.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {prettyType(selected.resource_type)}
                  </div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-100">
                    {selected.title}
                  </h2>
                  <div className="mt-1 text-xs text-slate-500">
                    Saved {new Date(selected.created_at).toLocaleString()}
                  </div>
                </div>

                {selectedType === "webinar_outline" && selectedContent ? (
                  <div className="space-y-4">
                    {selectedContent?.promise ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">Promise</div>
                        <div className="mt-2 text-sm text-slate-300">
                          {selectedContent.promise}
                        </div>
                      </div>
                    ) : null}

                    {selectedContent?.audience_takeaway ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="text-sm font-semibold text-emerald-200">
                          Audience takeaway
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                          {selectedContent.audience_takeaway}
                        </div>
                      </div>
                    ) : null}

                    {Array.isArray(selectedContent?.sections) &&
                    selectedContent.sections.length > 0 ? (
                      <div className="space-y-3">
                        {selectedContent.sections.map((section: any, idx: number) => (
                          <div
                            key={`${selected.id}-section-${idx}`}
                            className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                          >
                            <div className="text-sm font-semibold text-slate-200">
                              {idx + 1}. {String(section?.title || "").trim()}
                            </div>

                            <div className="mt-2 space-y-1">
                              {Array.isArray(section?.bullets) &&
                                section.bullets.map((bullet: any, bulletIdx: number) => (
                                  <div
                                    key={`${selected.id}-section-${idx}-bullet-${bulletIdx}`}
                                    className="text-sm text-slate-300"
                                  >
                                    • {String(bullet || "").trim()}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {selectedContent?.closing_invitation ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Closing invitation
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                          {selectedContent.closing_invitation}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                      {selectedContent ? JSON.stringify(selectedContent, null, 2) : "No content saved."}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
