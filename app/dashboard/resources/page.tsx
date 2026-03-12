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

type FilterType =
  | "all"
  | "webinar_outline"
  | "presentation"
  | "guide"
  | "course"
  | "worksheet"
  | "pdf"
  | "template";

type StarterTemplate = {
  id: string;
  title: string;
  resource_type: "template";
  category: "presentation" | "webinar" | "workshop" | "course";
  audience: string;
  description: string;
  duration: string;
  delivery: "online" | "in_person" | "hybrid";
  tags: string[];
  outline: {
    title: string;
    promise: string;
    audience_takeaway: string;
    sections: Array<{
      title: string;
      bullets: string[];
    }>;
    closing_invitation: string;
  };
};

const GROWTH_SEED_KEYS = [
  "rootops_growth_seed_brainstorm_v1",
  "rh_growth_seed_brainstorm_v1",
];

function setLocalStorageMulti(keys: string[], payload: any) {
  try {
    const raw = JSON.stringify(payload);
    for (const k of keys) {
      try {
        localStorage.setItem(k, raw);
      } catch {}
    }
  } catch {}
}

function prettyType(v: string) {
  const s = String(v || "").trim();
  if (!s) return "resource";
  return s.replace(/_/g, " ");
}

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "tpl-workplace-anxiety-presentation",
    title: "Workplace Anxiety Presentation",
    resource_type: "template",
    category: "presentation",
    audience: "HR leaders, managers, workplace wellbeing audiences",
    description:
      "A ready-to-edit presentation structure for teaching workplace anxiety in a calm, useful, non-clinical way.",
    duration: "30–45 mins",
    delivery: "hybrid",
    tags: ["workplace", "anxiety", "presentation", "training"],
    outline: {
      title: "Understanding Workplace Anxiety",
      promise:
        "A practical, compassionate session to help people understand workplace anxiety, reduce shame, and explore supportive next steps.",
      audience_takeaway:
        "Attendees leave with clearer language, more confidence, and simple supportive actions they can use immediately.",
      sections: [
        {
          title: "Why this topic matters",
          bullets: [
            "Anxiety often hides behind performance, avoidance, or exhaustion.",
            "Many people appear 'fine' while struggling internally.",
            "Support begins when the issue is named without judgement.",
          ],
        },
        {
          title: "What workplace anxiety can look like",
          bullets: [
            "Overthinking, perfectionism, procrastination, tension, shutdown.",
            "Difficulty concentrating or fear of getting things wrong.",
            "Avoiding meetings, visibility, conflict, or decision-making.",
          ],
        },
        {
          title: "What helps",
          bullets: [
            "Clear expectations and calmer communication.",
            "Psychological safety and permission to ask for support.",
            "Small practical steps instead of pressure and overwhelm.",
          ],
        },
        {
          title: "Supportive actions for teams and leaders",
          bullets: [
            "Use simple check-ins and clearer boundaries.",
            "Reduce ambiguity where possible.",
            "Normalise support without forcing disclosure.",
          ],
        },
      ],
      closing_invitation:
        "Invite the audience to continue the conversation through a workshop, support session, or wellbeing follow-up resource.",
    },
  },
  {
    id: "tpl-burnout-workshop",
    title: "Burnout Workshop",
    resource_type: "template",
    category: "workshop",
    audience: "Teams, managers, helping professionals",
    description:
      "A guided workshop template for recognising burnout patterns and opening healthier conversations about capacity and recovery.",
    duration: "45–60 mins",
    delivery: "online",
    tags: ["burnout", "workshop", "wellbeing", "teams"],
    outline: {
      title: "Recognising and Responding to Burnout",
      promise:
        "A practical workshop that helps people recognise burnout patterns early and respond with more clarity and care.",
      audience_takeaway:
        "Attendees leave with language for burnout, early warning signs, and realistic ways to respond.",
      sections: [
        {
          title: "Burnout is not just tiredness",
          bullets: [
            "Burnout usually builds slowly over time.",
            "It affects thinking, motivation, energy, and emotional resilience.",
            "It is often confused with weakness or poor organisation.",
          ],
        },
        {
          title: "Common warning signs",
          bullets: [
            "Detachment, dread, irritability, numbness, over-functioning.",
            "Loss of motivation for things that once mattered.",
            "Feeling permanently behind or emotionally flat.",
          ],
        },
        {
          title: "What recovery support can look like",
          bullets: [
            "Reducing load where possible.",
            "Improving recovery, boundaries, and role clarity.",
            "Normalising support rather than waiting for collapse.",
          ],
        },
        {
          title: "Discussion prompts",
          bullets: [
            "What signals do people ignore first?",
            "What makes recovery harder in real workplaces?",
            "What small cultural change would help most?",
          ],
        },
      ],
      closing_invitation:
        "Offer a follow-up training, manager guide, or support resource to help people apply what they learned.",
    },
  },
  {
    id: "tpl-stress-management-seminar",
    title: "Stress Management Seminar",
    resource_type: "template",
    category: "webinar",
    audience: "General workplace wellbeing audiences",
    description:
      "A broad educational seminar template focused on stress awareness, regulation, and simple practical action.",
    duration: "30 mins",
    delivery: "online",
    tags: ["stress", "seminar", "education", "wellbeing"],
    outline: {
      title: "Stress Management in Real Life",
      promise:
        "A grounded educational session on stress, overload, and practical ways to create more steadiness.",
      audience_takeaway:
        "Attendees leave with a more realistic understanding of stress and several small actions they can try immediately.",
      sections: [
        {
          title: "What stress is really doing",
          bullets: [
            "Stress is not always visible from the outside.",
            "Pressure affects body, attention, patience, and recovery.",
            "Not all stress responses look dramatic.",
          ],
        },
        {
          title: "Why people get stuck",
          bullets: [
            "Many people wait until they feel overwhelmed.",
            "People often try to solve overload by pushing harder.",
            "Lack of recovery makes even small tasks feel heavier.",
          ],
        },
        {
          title: "Simple supportive tools",
          bullets: [
            "Short recovery moments.",
            "Lowering avoidable friction.",
            "Creating clearer boundaries and kinder pacing.",
          ],
        },
        {
          title: "Taking one next step",
          bullets: [
            "Pick one realistic shift.",
            "Track what reduces pressure rather than what looks impressive.",
            "Build consistency before intensity.",
          ],
        },
      ],
      closing_invitation:
        "Offer a downloadable guide, a follow-up workshop, or a coaching conversation as the next step.",
    },
  },
  {
    id: "tpl-manager-supporting-staff-wellbeing",
    title: "Manager Training: Supporting Staff Wellbeing",
    resource_type: "template",
    category: "presentation",
    audience: "Managers and team leaders",
    description:
      "A practical manager-facing template that helps leaders support wellbeing without turning into therapists.",
    duration: "45 mins",
    delivery: "in_person",
    tags: ["manager", "leadership", "wellbeing", "training"],
    outline: {
      title: "Supporting Staff Wellbeing as a Manager",
      promise:
        "A clear, practical session for managers who want to support wellbeing with confidence, boundaries, and care.",
      audience_takeaway:
        "Managers leave knowing what helpful support looks like, what it does not, and how to respond more confidently.",
      sections: [
        {
          title: "The manager role",
          bullets: [
            "Managers are not therapists.",
            "Good support starts with noticing, listening, and clarity.",
            "Simple responses often matter more than perfect ones.",
          ],
        },
        {
          title: "What support can sound like",
          bullets: [
            "Checking in calmly without pressuring disclosure.",
            "Clarifying priorities and removing avoidable friction.",
            "Signposting support options appropriately.",
          ],
        },
        {
          title: "What not to do",
          bullets: [
            "Do not minimise, diagnose, or over-promise.",
            "Do not make support dependent on performance alone.",
            "Do not wait until someone is visibly struggling.",
          ],
        },
        {
          title: "Creating safer team culture",
          bullets: [
            "Model boundaries and realistic expectations.",
            "Reward clarity, not just constant availability.",
            "Make support feel normal and accessible.",
          ],
        },
      ],
      closing_invitation:
        "Invite leaders into further training, manager resources, or a practical team wellbeing programme.",
    },
  },
];

export default function ResourcesPage() {
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | StarterTemplate | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [libraryTab, setLibraryTab] = useState<"saved" | "templates">("saved");
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

      if (rows.length > 0 && !selected && libraryTab === "saved") {
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
    if (filter === "template") return [];
    return resources.filter((r) => String(r.resource_type || "") === filter);
  }, [resources, filter]);

  const filteredTemplates = useMemo(() => {
    if (filter === "all" || filter === "template") return STARTER_TEMPLATES;
    return STARTER_TEMPLATES.filter((t) => t.category === filter);
  }, [filter]);

  useEffect(() => {
    if (!selected) return;

    if (libraryTab === "saved") {
      const stillExists = filteredResources.some((r) => r.id === (selected as any).id);
      if (!stillExists) {
        setSelected(filteredResources[0] || null);
      }
    } else {
      const stillExists = filteredTemplates.some((t) => t.id === (selected as any).id);
      if (!stillExists) {
        setSelected(filteredTemplates[0] || null);
      }
    }
  }, [filteredResources, filteredTemplates, selected, libraryTab]);

  function isTemplate(item: any): item is StarterTemplate {
    return item?.resource_type === "template";
  }

  function sendTemplateToBrainstorm(template: StarterTemplate) {
    const payload = {
      v: 1,
      createdAt: new Date().toISOString(),
      source: "growth_lab",
      organisationId: organisationId || null,
      experimentId: null,
      platform: "linkedin",
      title: template.title,
      hypothesis: template.promise,
      pattern_type: "template",
      format: "presentation",
      hook_style: "gentle authority",
      cta_style: "soft question",
      notes: template.description,
      confidence: 90,
      brief: [
        `Template: ${template.title}`,
        `Audience: ${template.audience}`,
        `Delivery: ${template.delivery}`,
        `Duration: ${template.duration}`,
        `Description: ${template.description}`,
        `Promise: ${template.outline.promise}`,
        `Audience takeaway: ${template.outline.audience_takeaway}`,
        `Sections: ${template.outline.sections
          .map((s) => `${s.title} (${s.bullets.join(" | ")})`)
          .join(" || ")}`,
        "Please turn this into a polished teaching resource and supporting content. I may want slides, webinar notes, social promo posts, and email copy.",
      ].join("\n"),
    };

    setLocalStorageMulti(GROWTH_SEED_KEYS, payload);
    window.location.href = "/dashboard/brainstorm";
  }

  const selectedType = String((selected as any)?.resource_type || "").trim();
  const selectedContent = isTemplate(selected)
    ? selected.outline
    : (selected as any)?.content || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-7xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Resource Library</h1>
            <p className="text-sm text-slate-400 mt-1">
              Saved resources plus starter teaching templates for webinars, presentations and workshops.
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
          <button
            type="button"
            onClick={() => {
              setLibraryTab("saved");
              setSelected(filteredResources[0] || null);
            }}
            className={[
              "rounded-full border px-4 py-2 text-xs",
              libraryTab === "saved"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-white/10",
            ].join(" ")}
          >
            Saved Resources
          </button>

          <button
            type="button"
            onClick={() => {
              setLibraryTab("templates");
              setSelected(filteredTemplates[0] || null);
            }}
            className={[
              "rounded-full border px-4 py-2 text-xs",
              libraryTab === "templates"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-white/10",
            ].join(" ")}
          >
            Starter Templates
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All" },
            { key: "webinar_outline", label: "Webinars" },
            { key: "presentation", label: "Presentations" },
            { key: "guide", label: "Guides" },
            { key: "course", label: "Courses" },
            { key: "worksheet", label: "Worksheets" },
            { key: "pdf", label: "PDFs" },
            { key: "template", label: "Templates" },
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

        {!loading && libraryTab === "saved" && filteredResources.length === 0 && (
          <div className="text-sm text-slate-400">No saved resources yet.</div>
        )}

        {!loading && libraryTab === "templates" && filteredTemplates.length === 0 && (
          <div className="text-sm text-slate-400">No templates match that filter yet.</div>
        )}

        <div className="grid lg:grid-cols-[360px_1fr] gap-6">
          <div className="space-y-3">
            {libraryTab === "saved" &&
              filteredResources.map((r) => {
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

            {libraryTab === "templates" &&
              filteredTemplates.map((t) => {
                const isSelected = selected?.id === t.id;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelected(t)}
                    className={[
                      "w-full text-left rounded-2xl border p-4 space-y-2 transition",
                      isSelected
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-slate-700 bg-slate-900/70 hover:bg-slate-900",
                    ].join(" ")}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="font-semibold text-slate-100">{t.title}</div>
                      <div className="text-xs text-slate-400 shrink-0">
                        {t.category}
                      </div>
                    </div>

                    <div className="text-xs text-slate-400">{t.description}</div>

                    <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                      <span>{t.duration}</span>
                      <span>•</span>
                      <span>{t.delivery.replace("_", " ")}</span>
                    </div>
                  </button>
                );
              })}
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 min-h-[420px]">
            {!selected ? (
              <div className="text-sm text-slate-400">Select a resource or template to view it.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {prettyType(selectedType)}
                  </div>

                  <h2 className="mt-1 text-xl font-semibold text-slate-100">
                    {(selected as any).title}
                  </h2>

                  {isTemplate(selected) ? (
                    <div className="mt-2 space-y-1 text-xs text-slate-400">
                      <div>Audience: {selected.audience}</div>
                      <div>
                        Format: {selected.category} • {selected.duration} •{" "}
                        {selected.delivery.replace("_", " ")}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-slate-500">
                      Saved {new Date((selected as Resource).created_at).toLocaleString()}
                    </div>
                  )}
                </div>

                {isTemplate(selected) ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => sendTemplateToBrainstorm(selected)}
                      className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      Use in Brainstorm
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLibraryTab("saved");
                        window.location.href = "/dashboard/sequences";
                      }}
                      className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10"
                    >
                      Open Campaign Studio
                    </button>
                  </div>
                ) : null}

                {selectedContent ? (
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
                            key={`${(selected as any).id}-section-${idx}`}
                            className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                          >
                            <div className="text-sm font-semibold text-slate-200">
                              {idx + 1}. {String(section?.title || "").trim()}
                            </div>

                            <div className="mt-2 space-y-1">
                              {Array.isArray(section?.bullets) &&
                                section.bullets.map((bullet: any, bulletIdx: number) => (
                                  <div
                                    key={`${(selected as any).id}-section-${idx}-bullet-${bulletIdx}`}
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

                    {isTemplate(selected) && selected.tags?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selected.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                      {(selected as any)?.content
                        ? JSON.stringify((selected as any).content, null, 2)
                        : "No content saved."}
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
