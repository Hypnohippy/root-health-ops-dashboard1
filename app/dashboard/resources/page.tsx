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

type CreateResourceType =
  | "webinar_outline"
  | "presentation"
  | "guide"
  | "worksheet";

type FillLevel = "skeleton" | "draft" | "ready";
type PresentationMode = "audience" | "presenter";
type PresentationTheme = "calm" | "corporate" | "warm" | "dark";

type ArtPreset = {
  key: string;
  label: string;
  icon: string;
  chip: string;
  orbA: string;
  orbB: string;
  line: string;
  panel: string;
};

const GROWTH_SEED_KEYS = [
  "rootops_growth_seed_brainstorm_v1",
  "rh_growth_seed_brainstorm_v1",
];

const PRESENTATION_RESOURCE_CACHE_PREFIX =
  "root-health-presentation-resource:";

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

function defaultTitleForType(type: CreateResourceType) {
  if (type === "webinar_outline") return "New Webinar";
  if (type === "presentation") return "New Presentation";
  if (type === "guide") return "New Guide";
  return "New Worksheet";
}

function typeLabel(type: CreateResourceType) {
  if (type === "webinar_outline") return "Webinar";
  if (type === "presentation") return "Presentation";
  if (type === "guide") return "Guide";
  return "Worksheet";
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function cachePresentationResource(resource: Resource) {
  try {
    localStorage.setItem(
      `${PRESENTATION_RESOURCE_CACHE_PREFIX}${resource.id}`,
      JSON.stringify(resource)
    );
  } catch {}
}

function normaliseText(v: any) {
  return String(v || "").toLowerCase().trim();
}

function slideThemeClasses(theme: PresentationTheme) {
  if (theme === "corporate") {
    return {
      card: "border-slate-200 bg-white text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.08)]",
      note: "border-slate-200 bg-slate-50/92 text-slate-700",
      prompt: "text-slate-700",
      badge: "border-slate-300 bg-white/90 text-slate-700",
      subtle: "text-slate-600",
      styleCard: "border-slate-200 bg-slate-50 text-slate-700",
      overlay: "bg-gradient-to-br from-white/38 via-white/18 to-slate-100/10",
      imageTint: "bg-slate-900/8",
      imageFrame:
        "ring-1 ring-black/8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
    };
  }

  if (theme === "warm") {
    return {
      card: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-slate-900 shadow-[0_12px_40px_rgba(120,53,15,0.12)]",
      note: "border-amber-200 bg-white/82 text-slate-700",
      prompt: "text-amber-950/90",
      badge: "border-amber-300 bg-white/80 text-amber-900",
      subtle: "text-amber-950/60",
      styleCard: "border-amber-200 bg-white/60 text-amber-900",
      overlay: "bg-gradient-to-br from-amber-50/26 via-orange-50/12 to-white/8",
      imageTint: "bg-amber-950/10",
      imageFrame:
        "ring-1 ring-amber-900/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
    };
  }

  if (theme === "dark") {
    return {
      card: "border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.35)]",
      note: "border-slate-700 bg-black/42 text-slate-300",
      prompt: "text-slate-300",
      badge: "border-slate-500 bg-black/45 text-slate-200",
      subtle: "text-slate-400",
      styleCard: "border-slate-700 bg-slate-900/60 text-slate-300",
      overlay: "bg-gradient-to-br from-slate-950/24 via-slate-900/10 to-slate-950/22",
      imageTint: "bg-slate-950/14",
      imageFrame:
        "ring-1 ring-white/6 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]",
    };
  }

  return {
    card: "border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/30 text-slate-100 shadow-[0_12px_40px_rgba(16,185,129,0.10)]",
    note: "border-emerald-500/20 bg-black/26 text-slate-300",
    prompt: "text-emerald-50/92",
    badge: "border-emerald-300/30 bg-black/30 text-emerald-100",
    subtle: "text-emerald-100/60",
    styleCard: "border-emerald-500/20 bg-emerald-500/5 text-emerald-100",
    overlay: "bg-gradient-to-br from-slate-950/22 via-slate-900/8 to-emerald-950/16",
    imageTint: "bg-slate-950/10",
    imageFrame:
      "ring-1 ring-white/6 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]",
  };
}

function getArtPreset(input: string): ArtPreset {
  const s = normaliseText(input);

  if (
    s.includes("anxiety") ||
    s.includes("stress") ||
    s.includes("overwhelm") ||
    s.includes("panic")
  ) {
    return {
      key: "calm-mind",
      label: "Calm focus",
      icon: "◔",
      chip: "Breathing space",
      orbA: "bg-sky-400/20",
      orbB: "bg-indigo-400/15",
      line: "border-sky-300/20",
      panel: "bg-white/5 border-white/10",
    };
  }

  if (
    s.includes("burnout") ||
    s.includes("recovery") ||
    s.includes("exhaustion") ||
    s.includes("fatigue")
  ) {
    return {
      key: "recovery",
      label: "Recovery path",
      icon: "◡",
      chip: "Restore pace",
      orbA: "bg-amber-400/20",
      orbB: "bg-rose-400/10",
      line: "border-amber-200/20",
      panel: "bg-white/5 border-white/10",
    };
  }

  if (
    s.includes("manager") ||
    s.includes("leader") ||
    s.includes("leadership") ||
    s.includes("team")
  ) {
    return {
      key: "leadership",
      label: "Leadership clarity",
      icon: "◇",
      chip: "Guide with care",
      orbA: "bg-violet-400/20",
      orbB: "bg-fuchsia-400/10",
      line: "border-violet-200/20",
      panel: "bg-white/5 border-white/10",
    };
  }

  if (
    s.includes("workplace") ||
    s.includes("hr") ||
    s.includes("staff") ||
    s.includes("organisation") ||
    s.includes("corporate")
  ) {
    return {
      key: "workplace",
      label: "Workplace wellbeing",
      icon: "▣",
      chip: "Practical culture",
      orbA: "bg-cyan-400/20",
      orbB: "bg-emerald-400/10",
      line: "border-cyan-200/20",
      panel: "bg-white/5 border-white/10",
    };
  }

  if (
    s.includes("wellbeing") ||
    s.includes("wellness") ||
    s.includes("mental health") ||
    s.includes("support")
  ) {
    return {
      key: "wellbeing",
      label: "Supportive wellbeing",
      icon: "✦",
      chip: "Gentle guidance",
      orbA: "bg-emerald-400/20",
      orbB: "bg-teal-400/10",
      line: "border-emerald-200/20",
      panel: "bg-white/5 border-white/10",
    };
  }

  return {
    key: "root",
    label: "Root Health",
    icon: "✳",
    chip: "Calm teaching",
    orbA: "bg-emerald-400/15",
    orbB: "bg-sky-400/10",
    line: "border-white/10",
    panel: "bg-white/5 border-white/10",
  };
}

function getArtFromVisualDirection(input: string): ArtPreset {
  const s = normaliseText(input);

  if (
    s.includes("blue") ||
    s.includes("green") ||
    s.includes("calm") ||
    s.includes("soft layered circles")
  ) {
    return {
      key: "blue-calm",
      label: "Calm visual",
      icon: "◔",
      chip: "Soft layers",
      orbA: "bg-sky-400/20",
      orbB: "bg-emerald-400/10",
      line: "border-sky-200/20",
      panel: "bg-white/5 border-white/10",
    };
  }

  if (
    s.includes("warm") ||
    s.includes("recovery") ||
    s.includes("sunrise") ||
    s.includes("amber")
  ) {
    return {
      key: "warm-recovery",
      label: "Warm recovery",
      icon: "◡",
      chip: "Gentle warmth",
      orbA: "bg-amber-400/20",
      orbB: "bg-orange-400/10",
      line: "border-amber-200/20",
      panel: "bg-white/5 border-white/10",
    };
  }

  if (
    s.includes("corporate") ||
    s.includes("structured") ||
    s.includes("workplace") ||
    s.includes("panels")
  ) {
    return {
      key: "work-structure",
      label: "Structured clarity",
      icon: "▣",
      chip: "Clean layout",
      orbA: "bg-cyan-400/20",
      orbB: "bg-slate-300/10",
      line: "border-cyan-200/20",
      panel: "bg-white/5 border-white/10",
    };
  }

  if (
    s.includes("reflective") ||
    s.includes("wellbeing") ||
    s.includes("gentle") ||
    s.includes("supportive")
  ) {
    return {
      key: "reflective",
      label: "Reflective wellbeing",
      icon: "✦",
      chip: "Supportive tone",
      orbA: "bg-emerald-400/20",
      orbB: "bg-teal-400/10",
      line: "border-emerald-200/20",
      panel: "bg-white/5 border-white/10",
    };
  }

  return getArtPreset(input);
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
  const [selected, setSelected] = useState<Resource | StarterTemplate | null>(
    null
  );
  const [filter, setFilter] = useState<FilterType>("all");
  const [libraryTab, setLibraryTab] = useState<"saved" | "templates">("saved");
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorType, setCreatorType] =
    useState<CreateResourceType>("webinar_outline");
  const [creatorTitle, setCreatorTitle] = useState("New Webinar");
  const [creatorGoal, setCreatorGoal] = useState("");
  const [creatorAudience, setCreatorAudience] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [creatorTone, setCreatorTone] = useState("calm and professional");
  const [creatorDuration, setCreatorDuration] = useState("30 mins");
  const [creatorFillLevel, setCreatorFillLevel] =
    useState<FillLevel>("draft");

  const [editMode, setEditMode] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState<any>(null);

  const [presentationMode, setPresentationMode] =
    useState<PresentationMode>("audience");
  const [presentationTheme, setPresentationTheme] =
    useState<PresentationTheme>("calm");
  const [showArtwork, setShowArtwork] = useState(true);

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setCreatorTitle(defaultTitleForType(creatorType));

    if (creatorType === "webinar_outline") {
      setCreatorDuration("30 mins");
      setCreatorTone("calm and professional");
    } else if (creatorType === "presentation") {
      setCreatorDuration("30 mins");
      setCreatorTone("calm and professional");
    } else if (creatorType === "guide") {
      setCreatorDuration("n/a");
      setCreatorTone("supportive and clear");
    } else if (creatorType === "worksheet") {
      setCreatorDuration("n/a");
      setCreatorTone("gentle and practical");
    }
  }, [creatorType]);

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
      const stillExists = filteredResources.some(
        (r) => r.id === (selected as any).id
      );
      if (!stillExists) setSelected(filteredResources[0] || null);
    } else {
      const stillExists = filteredTemplates.some(
        (t) => t.id === (selected as any).id
      );
      if (!stillExists) setSelected(filteredTemplates[0] || null);
    }
  }, [filteredResources, filteredTemplates, selected, libraryTab]);

  useEffect(() => {
    if (!selected || isTemplate(selected)) {
      setEditMode(false);
      setDraftTitle("");
      setDraftContent(null);
      return;
    }

    setEditMode(false);
    setDraftTitle(selected.title || "");
    setDraftContent(deepClone(selected.content || {}));
  }, [selected]);

  function isTemplate(item: any): item is StarterTemplate {
    return item?.resource_type === "template";
  }

  async function persistResourceContent(
    resource: Resource,
    nextContent: any,
    successMessage: string
  ) {
    if (!organisationId) return;

    setBusyAction(`save:${resource.id}`);
    setError(null);

    try {
      const res = await fetch("/api/resource-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          resourceId: resource.id,
          title: resource.title,
          content: nextContent,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to save resource");
      }

      const updated = data?.resource || null;

      if (updated) {
        setResources((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r))
        );
        setSelected(updated);

        if (!isTemplate(updated)) {
          setDraftTitle(updated.title || "");
          setDraftContent(deepClone(updated.content || {}));
        }
      } else {
        await loadResources();
      }

      setToast(successMessage);
    } catch (e: any) {
      setError(e?.message || "Failed to save resource");
    } finally {
      setBusyAction(null);
    }
  }

  async function persistSlidePatch(
    resource: Resource,
    slideIndex: number,
    slidePatch: any,
    successMessage?: string
  ) {
    if (!organisationId) return null;

    setError(null);

    const res = await fetch("/api/resource-library", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organisationId,
        resourceId: resource.id,
        title: resource.title,
        slideIndex,
        slidePatch,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      throw new Error(data?.error || "Failed to save resource");
    }

    const updated = data?.resource || null;

    if (updated) {
      setResources((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setSelected(updated);
      cachePresentationResource(updated);

      if (!isTemplate(updated)) {
        setDraftTitle(updated.title || "");
        setDraftContent(deepClone(updated.content || {}));
      }
    } else {
      await loadResources();
    }

    if (successMessage) {
      setToast(successMessage);
    }

    return updated;
  }

  async function generateSlideImage(resource: Resource, slideIndex: number) {
    const content = deepClone(resource.content || {});
    const slides = Array.isArray(content?.slides) ? content.slides : [];
    const slide = slides[slideIndex];

    if (!slide) return;

    setBusyAction(`image:${resource.id}:${slideIndex}`);
    setError(null);

    try {
      const res = await fetch("/api/ai/slide-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentationTitle: resource.title,
          presentationObjective: String(content?.objective || "").trim(),
          presentationPromise: String(content?.promise || "").trim(),
          presentationAudienceTakeaway: String(
            content?.audience_takeaway || ""
          ).trim(),
          slideTitle: String(slide?.slide_title || "").trim(),
          slideGoal: String(slide?.slide_goal || "").trim(),
          bullets: Array.isArray(slide?.bullets) ? slide.bullets : [],
          speakerNotes: String(slide?.speaker_notes || "").trim(),
          audiencePrompt: String(slide?.audience_prompt || "").trim(),
          visualDirection: String(slide?.visual_direction || "").trim(),
          imagePrompt: String(slide?.image_prompt || "").trim(),
          theme: presentationTheme,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to generate image");
      }

      const nextImageUrl = String(data?.imageUrl || "").trim();
      if (!nextImageUrl) {
        throw new Error("No image URL was returned.");
      }

      await persistSlidePatch(
        resource,
        slideIndex,
        {
          generated_image_url: nextImageUrl,
          generated_image_prompt: String(data?.imagePrompt || "").trim(),
          generated_image_status: "ready",
          artwork_label: String(
            data?.artworkLabel || slide?.artwork_label || ""
          ).trim(),
          artwork_chip: String(
            data?.artworkChip || slide?.artwork_chip || ""
          ).trim(),
          visual_direction: String(
            data?.visualDirection || slide?.visual_direction || ""
          ).trim(),
          image_prompt: String(
            data?.imagePrompt || slide?.image_prompt || ""
          ).trim(),
          artwork_generated_at: new Date().toISOString(),
        },
        `Slide ${slideIndex + 1} image generated ✅`
      );
    } catch (e: any) {
      setError(e?.message || "Failed to generate image");
    } finally {
      setBusyAction(null);
    }
  }

  async function generateAllSlideImages(resource: Resource) {
    const content = deepClone(resource.content || {});
    const slides = Array.isArray(content?.slides) ? content.slides : [];

    if (!slides.length) return;

    setBusyAction(`image-all:${resource.id}`);
    setError(null);

    try {
      let latestResource: Resource = resource;

      for (let i = 0; i < slides.length; i++) {
        const currentSlides = Array.isArray(latestResource?.content?.slides)
          ? latestResource.content.slides
          : slides;

        const slide = currentSlides[i];
        if (!slide) continue;

        const res = await fetch("/api/ai/slide-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            presentationTitle: latestResource.title,
            presentationObjective: String(
              latestResource?.content?.objective || ""
            ).trim(),
            presentationPromise: String(
              latestResource?.content?.promise || ""
            ).trim(),
            presentationAudienceTakeaway: String(
              latestResource?.content?.audience_takeaway || ""
            ).trim(),
            slideTitle: String(slide?.slide_title || "").trim(),
            slideGoal: String(slide?.slide_goal || "").trim(),
            bullets: Array.isArray(slide?.bullets) ? slide.bullets : [],
            speakerNotes: String(slide?.speaker_notes || "").trim(),
            audiencePrompt: String(slide?.audience_prompt || "").trim(),
            visualDirection: String(slide?.visual_direction || "").trim(),
            imagePrompt: String(slide?.image_prompt || "").trim(),
            theme: presentationTheme,
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
          throw new Error(
            data?.error || `Failed to generate image for slide ${i + 1}`
          );
        }

        const nextImageUrl = String(data?.imageUrl || "").trim();
        if (!nextImageUrl) {
          throw new Error(`No image URL returned for slide ${i + 1}`);
        }

        const updated = await persistSlidePatch(latestResource, i, {
          generated_image_url: nextImageUrl,
          generated_image_prompt: String(data?.imagePrompt || "").trim(),
          generated_image_status: "ready",
          artwork_label: String(
            data?.artworkLabel || slide?.artwork_label || ""
          ).trim(),
          artwork_chip: String(
            data?.artworkChip || slide?.artwork_chip || ""
          ).trim(),
          visual_direction: String(
            data?.visualDirection || slide?.visual_direction || ""
          ).trim(),
          image_prompt: String(
            data?.imagePrompt || slide?.image_prompt || ""
          ).trim(),
          artwork_generated_at: new Date().toISOString(),
        });

        if (updated) {
          latestResource = updated;
        }
      }

      setToast("All slide images generated ✅");
    } catch (e: any) {
      setError(e?.message || "Failed to generate all slide images");
    } finally {
      setBusyAction(null);
    }
  }

  async function clearSlideImage(resource: Resource, slideIndex: number) {
    const content = deepClone(resource.content || {});
    const slides = Array.isArray(content?.slides) ? content.slides : [];
    const slide = slides[slideIndex];

    if (!slide)
