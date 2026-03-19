"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

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

function getSafeSlide(slide: any) {
  const next = slide && typeof slide === "object" ? { ...slide } : {};

  next.slide_title = String(next.slide_title || "").trim();
  next.slide_goal = String(next.slide_goal || "").trim();
  next.bullets = Array.isArray(next.bullets) ? next.bullets : [];
  next.speaker_notes = String(next.speaker_notes || "").trim();
  next.audience_prompt = String(next.audience_prompt || "").trim();
  next.visual_direction = String(next.visual_direction || "").trim();
  next.image_prompt = String(next.image_prompt || "").trim();
  next.artwork_label = String(next.artwork_label || "").trim();
  next.artwork_chip = String(next.artwork_chip || "").trim();
  next.generated_image_url = String(next.generated_image_url || "").trim();
  next.generated_image_prompt = String(
    next.generated_image_prompt || ""
  ).trim();
  next.generated_image_status = String(
    next.generated_image_status || ""
  ).trim();
  next.artwork_generated_at = next.artwork_generated_at || null;
  next.generated_image_source = String(
    next.generated_image_source || ""
  ).trim();

  return next;
}

function slideThemeClasses(theme: PresentationTheme) {
  if (theme === "corporate") {
    return {
      card: "border-slate-200 bg-white text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.08)]",
      note: "border-slate-200 bg-slate-50 text-slate-700",
      prompt: "text-slate-600",
      badge: "border-slate-300 bg-slate-100 text-slate-700",
      subtle: "text-slate-500",
      styleCard: "border-slate-200 bg-slate-50 text-slate-700",
      overlay: "bg-gradient-to-br from-white/58 via-white/40 to-slate-100/28",
      imageTint: "bg-white/10",
    };
  }

  if (theme === "warm") {
    return {
      card: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-slate-900 shadow-[0_12px_40px_rgba(120,53,15,0.12)]",
      note: "border-amber-200 bg-white/70 text-slate-700",
      prompt: "text-amber-900/80",
      badge: "border-amber-300 bg-amber-100 text-amber-800",
      subtle: "text-amber-900/60",
      styleCard: "border-amber-200 bg-white/60 text-amber-900",
      overlay: "bg-gradient-to-br from-amber-50/52 via-orange-50/34 to-white/24",
      imageTint: "bg-amber-50/8",
    };
  }

  if (theme === "dark") {
    return {
      card: "border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.35)]",
      note: "border-slate-700 bg-black/20 text-slate-300",
      prompt: "text-slate-400",
      badge: "border-slate-600 bg-slate-800 text-slate-300",
      subtle: "text-slate-400",
      styleCard: "border-slate-700 bg-slate-900/60 text-slate-300",
      overlay: "bg-gradient-to-br from-slate-950/58 via-slate-900/42 to-slate-950/56",
      imageTint: "bg-slate-950/8",
    };
  }

  return {
    card: "border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/30 text-slate-100 shadow-[0_12px_40px_rgba(16,185,129,0.10)]",
    note: "border-emerald-500/20 bg-emerald-500/5 text-slate-300",
    prompt: "text-emerald-100/80",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    subtle: "text-emerald-100/50",
    styleCard: "border-emerald-500/20 bg-emerald-500/5 text-emerald-100",
    overlay: "bg-gradient-to-br from-slate-950/52 via-slate-900/38 to-emerald-950/32",
    imageTint: "bg-emerald-950/6",
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

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
    const slide = getSafeSlide(slides[slideIndex]);

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
          generated_image_source: "ai",
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

        const slide = getSafeSlide(currentSlides[i]);
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
          generated_image_source: "ai",
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

  async function uploadSlideArtwork(
    resource: Resource,
    slideIndex: number,
    file: File
  ) {
    const content = deepClone(resource.content || {});
    const slides = Array.isArray(content?.slides) ? content.slides : [];
    const slide = getSafeSlide(slides[slideIndex]);

    if (!slide || !file) return;

    setBusyAction(`upload:${resource.id}:${slideIndex}`);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("resourceTitle", resource.title || "Resource");
      form.append("slideTitle", slide.slide_title || `Slide ${slideIndex + 1}`);

      const res = await fetch("/api/resource-artwork", {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to upload artwork");
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
          generated_image_prompt: "",
          generated_image_status: "uploaded",
          generated_image_source: "upload",
          artwork_generated_at: new Date().toISOString(),
        },
        `Slide ${slideIndex + 1} artwork uploaded ✅`
      );
    } catch (e: any) {
      setError(e?.message || "Failed to upload artwork");
    } finally {
      setBusyAction(null);
    }
  }

  async function clearSlideImage(resource: Resource, slideIndex: number) {
    const content = deepClone(resource.content || {});
    const slides = Array.isArray(content?.slides) ? content.slides : [];
    const slide = slides[slideIndex];

    if (!slide) return;

    setBusyAction(`save:${resource.id}`);
    setError(null);

    try {
      await persistSlidePatch(
        resource,
        slideIndex,
        {
          generated_image_url: "",
          generated_image_prompt: "",
          generated_image_status: "",
          generated_image_source: "",
          artwork_generated_at: null,
        },
        "Slide image removed ✅"
      );
    } catch (e: any) {
      setError(e?.message || "Failed to save resource");
    } finally {
      setBusyAction(null);
    }
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
      hypothesis: template.outline.promise,
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

  function sendSavedResourceToBrainstorm(resource: Resource) {
    const content = resource?.content || null;

    const sections =
      Array.isArray(content?.sections) && content.sections.length > 0
        ? content.sections
            .map((s: any) => {
              const title = String(s?.title || "").trim();
              const bullets = Array.isArray(s?.bullets)
                ? s.bullets
                    .map((b: any) => String(b || "").trim())
                    .filter(Boolean)
                : [];
              return `${title}${
                bullets.length ? ` (${bullets.join(" | ")})` : ""
              }`;
            })
            .join(" || ")
        : "";

    const payload = {
      v: 1,
      createdAt: new Date().toISOString(),
      source: "growth_lab",
      organisationId: organisationId || null,
      experimentId: null,
      platform: "linkedin",
      title: resource.title,
      hypothesis: String(content?.promise || resource.title || "").trim(),
      pattern_type: "resource_library",
      format: "resource",
      hook_style: "gentle authority",
      cta_style: "soft question",
      notes: `Resource type: ${resource.resource_type}`,
      confidence: 90,
      brief: [
        `Saved resource: ${resource.title}`,
        `Resource type: ${resource.resource_type}`,
        content?.promise ? `Promise: ${String(content.promise).trim()}` : "",
        content?.audience_takeaway
          ? `Audience takeaway: ${String(content.audience_takeaway).trim()}`
          : "",
        sections ? `Sections: ${sections}` : "",
        content?.closing_invitation
          ? `Closing invitation: ${String(content.closing_invitation).trim()}`
          : "",
        "Please turn this into a polished teaching resource and supporting content. I may want slides, webinar notes, social promo posts, email copy, or a refined delivery version.",
      ]
        .filter(Boolean)
        .join("\n"),
    };

    setLocalStorageMulti(GROWTH_SEED_KEYS, payload);
    window.location.href = "/dashboard/brainstorm";
  }

  async function renameResource(resource: Resource) {
    if (!organisationId) return;

    const nextTitle = window.prompt("Rename resource", resource.title || "");
    if (!nextTitle) return;

    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === resource.title) return;

    setBusyAction(`rename:${resource.id}`);
    setError(null);

    try {
      const res = await fetch("/api/resource-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          resourceId: resource.id,
          title: trimmed,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to rename resource");
      }

      await loadResources();

      setSelected((prev) => {
        if (!prev || isTemplate(prev)) return prev;
        if (prev.id !== resource.id) return prev;
        return { ...prev, title: trimmed };
      });

      setToast("Resource renamed ✅");
    } catch (e: any) {
      setError(e?.message || "Failed to rename resource");
    } finally {
      setBusyAction(null);
    }
  }

  async function duplicateResource(resource: Resource) {
    if (!organisationId) return;

    setBusyAction(`duplicate:${resource.id}`);
    setError(null);

    try {
      const res = await fetch("/api/resource-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "duplicate",
          organisationId,
          resourceId: resource.id,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to duplicate resource");
      }

      await loadResources();
      if (data?.resource) setSelected(data.resource);

      setToast("Resource duplicated ✅");
    } catch (e: any) {
      setError(e?.message || "Failed to duplicate resource");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteResource(resource: Resource) {
    if (!organisationId) return;

    const ok = window.confirm(`Delete "${resource.title}"?`);
    if (!ok) return;

    setBusyAction(`delete:${resource.id}`);
    setError(null);

    try {
      const res = await fetch("/api/resource-library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          resourceId: resource.id,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to delete resource");
      }

      const remaining = resources.filter((r) => r.id !== resource.id);
      setResources(remaining);
      setSelected(remaining[0] || null);

      setToast("Resource deleted ✅");
    } catch (e: any) {
      setError(e?.message || "Failed to delete resource");
    } finally {
      setBusyAction(null);
    }
  }

  async function createResource() {
    if (!organisationId) return;

    const title = creatorTitle.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }

    setBusyAction("create-resource");
    setError(null);

    try {
      let route = "";
      let body: any = {
        topic: title,
        name: title,
        goal: creatorGoal.trim(),
        audience: creatorAudience.trim(),
        notes: creatorNotes.trim(),
        tone: creatorTone.trim(),
        fillLevel: creatorFillLevel,
      };

      if (creatorType === "webinar_outline") {
        route = "/api/ai/presentation-outline";
        body.duration = creatorDuration.trim() || "30 mins";
        body.deliveryMode = "online";
        body.resourceKind = "webinar";
      } else if (creatorType === "presentation") {
        route = "/api/ai/presentation-outline";
        body.duration = creatorDuration.trim() || "30 mins";
        body.deliveryMode = "online";
        body.resourceKind = "presentation";
      } else if (creatorType === "guide") {
        route = "/api/ai/guide";
      } else if (creatorType === "worksheet") {
        route = "/api/ai/worksheet";
      }

      const aiRes = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const aiData = await aiRes.json().catch(() => null);

      if (!aiRes.ok || !aiData?.success) {
        throw new Error(aiData?.error || "Failed to generate resource");
      }

      let resourceType = creatorType;
      let content: any = null;

      if (creatorType === "webinar_outline") {
        content = aiData?.presentation || aiData?.outline || null;
      } else if (creatorType === "presentation") {
        content = aiData?.presentation || null;
      } else if (creatorType === "guide") {
        content = aiData?.guide || null;
      } else if (creatorType === "worksheet") {
        content = aiData?.worksheet || null;
      }

      const saveRes = await fetch("/api/resource-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          title,
          resource_type: resourceType,
          content,
        }),
      });

      const saveData = await saveRes.json().catch(() => null);

      if (!saveRes.ok || !saveData?.success) {
        throw new Error(saveData?.error || "Failed to save resource");
      }

      await loadResources();
      if (saveData?.resource) setSelected(saveData.resource);

      setLibraryTab("saved");
      setCreatorOpen(false);
      setToast(`${typeLabel(creatorType)} created ✅`);
    } catch (e: any) {
      setError(e?.message || "Failed to create resource");
    } finally {
      setBusyAction(null);
    }
  }

  function startEditingSelected() {
    if (!selected || isTemplate(selected)) return;
    setDraftTitle(selected.title || "");
    setDraftContent(deepClone(selected.content || {}));
    setEditMode(true);
  }

  function cancelEditingSelected() {
    if (!selected || isTemplate(selected)) return;
    setDraftTitle(selected.title || "");
    setDraftContent(deepClone(selected.content || {}));
    setEditMode(false);
  }

  async function saveEditedResource(resource: Resource) {
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
          title: draftTitle.trim() || resource.title,
          content: draftContent,
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
        setDraftTitle(updated.title || "");
        setDraftContent(deepClone(updated.content || {}));
      } else {
        await loadResources();
      }

      setEditMode(false);
      setToast("Resource updated ✅");
    } catch (e: any) {
      setError(e?.message || "Failed to save resource");
    } finally {
      setBusyAction(null);
    }
  }

  function setDraftField(key: string, value: string) {
    setDraftContent((prev: any) => ({
      ...(prev || {}),
      [key]: value,
    }));
  }

  function updateSectionTitle(index: number, value: string) {
    setDraftContent((prev: any) => {
      const next = deepClone(prev || {});
      next.sections = Array.isArray(next.sections) ? next.sections : [];
      if (!next.sections[index]) next.sections[index] = { title: "", bullets: [] };
      next.sections[index].title = value;
      return next;
    });
  }

  function updateSectionBullet(
    sectionIndex: number,
    bulletIndex: number,
    value: string
  ) {
    setDraftContent((prev: any) => {
      const next = deepClone(prev || {});
      next.sections = Array.isArray(next.sections) ? next.sections : [];
      if (!next.sections[sectionIndex]) {
        next.sections[sectionIndex] = { title: "", bullets: [] };
      }
      next.sections[sectionIndex].bullets = Array.isArray(
        next.sections[sectionIndex].bullets
      )
        ? next.sections[sectionIndex].bullets
        : [];
      next.sections[sectionIndex].bullets[bulletIndex] = value;
      return next;
    });
  }

  function updateSlideField(index: number, key: string, value: string) {
    setDraftContent((prev: any) => {
      const next = deepClone(prev || {});
      next.slides = Array.isArray(next.slides) ? next.slides : [];
      if (!next.slides[index]) {
        next.slides[index] = {
          slide_title: "",
          slide_goal: "",
          bullets: [],
          speaker_notes: "",
          audience_prompt: "",
          visual_direction: "",
          image_prompt: "",
          artwork_label: "",
          artwork_chip: "",
          generated_image_url: "",
          generated_image_prompt: "",
          generated_image_status: "",
          generated_image_source: "",
        };
      }
      next.slides[index][key] = value;
      return next;
    });
  }

  function updateSlideBullet(
    slideIndex: number,
    bulletIndex: number,
    value: string
  ) {
    setDraftContent((prev: any) => {
      const next = deepClone(prev || {});
      next.slides = Array.isArray(next.slides) ? next.slides : [];
      if (!next.slides[slideIndex]) {
        next.slides[slideIndex] = {
          slide_title: "",
          slide_goal: "",
          bullets: [],
          speaker_notes: "",
          audience_prompt: "",
          visual_direction: "",
          image_prompt: "",
          artwork_label: "",
          artwork_chip: "",
          generated_image_url: "",
          generated_image_prompt: "",
          generated_image_status: "",
          generated_image_source: "",
        };
      }
      next.slides[slideIndex].bullets = Array.isArray(
        next.slides[slideIndex].bullets
      )
        ? next.slides[slideIndex].bullets
        : [];
      next.slides[slideIndex].bullets[bulletIndex] = value;
      return next;
    });
  }

  function updateStringArrayField(field: string, index: number, value: string) {
    setDraftContent((prev: any) => {
      const next = deepClone(prev || {});
      next[field] = Array.isArray(next[field]) ? next[field] : [];
      next[field][index] = value;
      return next;
    });
  }

  const selectedType = String((selected as any)?.resource_type || "").trim();
  const selectedContent = isTemplate(selected)
    ? selected.outline
    : editMode
    ? draftContent || null
    : (selected as any)?.content || null;

  const isPresentation =
    !isTemplate(selected) &&
    Array.isArray(selectedContent?.slides) &&
    selectedContent.slides.length > 0;

  const theme = slideThemeClasses(presentationTheme);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-7xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Resource Library</h1>
            <p className="text-sm text-slate-400 mt-1">
              Saved resources plus starter teaching templates for webinars,
              presentations, guides and worksheets.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreatorOpen(true)}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              + Create Resource
            </button>

            <button
              type="button"
              onClick={() => loadResources()}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        </header>

        {toast ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {toast}
          </div>
        ) : null}

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

        {loading && (
          <div className="text-sm text-slate-400">Loading resources...</div>
        )}
        {error && <div className="text-sm text-red-400">{error}</div>}

        {!loading && libraryTab === "saved" && filteredResources.length === 0 && (
          <div className="text-sm text-slate-400">No saved resources yet.</div>
        )}

        {!loading &&
          libraryTab === "templates" &&
          filteredTemplates.length === 0 && (
            <div className="text-sm text-slate-400">
              No templates match that filter yet.
            </div>
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
                      <div className="font-semibold text-slate-100">
                        {r.title}
                      </div>
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
                      <div className="font-semibold text-slate-100">
                        {t.title}
                      </div>
                      <div className="text-xs text-slate-400 shrink-0">
                        {t.category}
                      </div>
                    </div>

                    <div className="text-xs text-slate-400">
                      {t.description}
                    </div>

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
              <div className="text-sm text-slate-400">
                Select a resource or template to view it.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {prettyType(selectedType)}
                  </div>

                  {editMode && !isTemplate(selected) ? (
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xl font-semibold text-slate-100"
                    />
                  ) : (
                    <h2 className="mt-1 text-xl font-semibold text-slate-100">
                      {(selected as any).title}
                    </h2>
                  )}

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
                      Saved{" "}
                      {new Date((selected as Resource).created_at).toLocaleString()}
                    </div>
                  )}
                </div>

                {isPresentation && !editMode ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPresentationMode("audience")}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs",
                        presentationMode === "audience"
                          ? "border-emerald-500 bg-emerald-500 text-slate-950"
                          : "border-slate-600 bg-slate-900 text-slate-200",
                      ].join(" ")}
                    >
                      Audience View
                    </button>

                    <button
                      type="button"
                      onClick={() => setPresentationMode("presenter")}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs",
                        presentationMode === "presenter"
                          ? "border-emerald-500 bg-emerald-500 text-slate-950"
                          : "border-slate-600 bg-slate-900 text-slate-200",
                      ].join(" ")}
                    >
                      Presenter View
                    </button>

                    <select
                      value={presentationTheme}
                      onChange={(e) =>
                        setPresentationTheme(e.target.value as PresentationTheme)
                      }
                      className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100"
                    >
                      <option value="calm">Calm</option>
                      <option value="corporate">Corporate</option>
                      <option value="warm">Warm</option>
                      <option value="dark">Dark</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setShowArtwork((prev) => !prev)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs",
                        showArtwork
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                          : "border-slate-600 bg-slate-900 text-slate-200",
                      ].join(" ")}
                    >
                      {showArtwork ? "Artwork on" : "Artwork off"}
                    </button>

                    <button
                      type="button"
                      onClick={() => generateAllSlideImages(selected as Resource)}
                      disabled={
                        busyAction === `image-all:${(selected as Resource).id}`
                      }
                      className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                    >
                      {busyAction === `image-all:${(selected as Resource).id}`
                        ? "Generating all…"
                        : "Generate all images"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const resource = selected as Resource;
                        cachePresentationResource(resource);
                        window.open(
                          `/dashboard/resources/present/${resource.id}`,
                          "_blank"
                        );
                      }}
                      className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                    >
                      Open audience screen
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const resource = selected as Resource;
                        cachePresentationResource(resource);
                        window.open(
                          `/dashboard/resources/presenter/${resource.id}`,
                          "_blank"
                        );
                      }}
                      className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                    >
                      Open presenter console
                    </button>
                  </div>
                ) : null}

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
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {!editMode ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            sendSavedResourceToBrainstorm(selected as Resource)
                          }
                          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                        >
                          Send to Brainstorm
                        </button>

                        <button
                          type="button"
                          onClick={() => startEditingSelected()}
                          className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => renameResource(selected as Resource)}
                          disabled={
                            busyAction === `rename:${(selected as Resource).id}`
                          }
                          className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10 disabled:opacity-60"
                        >
                          {busyAction === `rename:${(selected as Resource).id}`
                            ? "Renaming…"
                            : "Rename"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            duplicateResource(selected as Resource)
                          }
                          disabled={
                            busyAction ===
                            `duplicate:${(selected as Resource).id}`
                          }
                          className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10 disabled:opacity-60"
                        >
                          {busyAction ===
                          `duplicate:${(selected as Resource).id}`
                            ? "Duplicating…"
                            : "Duplicate"}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteResource(selected as Resource)}
                          disabled={
                            busyAction === `delete:${(selected as Resource).id}`
                          }
                          className="rounded-full border border-red-500/40 bg-red-950/20 px-4 py-2 text-xs text-red-200 hover:bg-red-950/35 disabled:opacity-60"
                        >
                          {busyAction === `delete:${(selected as Resource).id}`
                            ? "Deleting…"
                            : "Delete"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => saveEditedResource(selected as Resource)}
                          disabled={
                            busyAction === `save:${(selected as Resource).id}`
                          }
                          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                        >
                          {busyAction === `save:${(selected as Resource).id}`
                            ? "Saving…"
                            : "Save changes"}
                        </button>

                        <button
                          type="button"
                          onClick={cancelEditingSelected}
                          disabled={
                            busyAction === `save:${(selected as Resource).id}`
                          }
                          className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                )}

                {selectedContent ? (
                  <div className="space-y-4">
                    {selectedContent?.presentation_style !== undefined ? (
                      <div
                        className={["rounded-xl border p-4", theme.styleCard].join(
                          " "
                        )}
                      >
                        <div className="text-sm font-semibold">
                          Presentation style
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(
                              selectedContent.presentation_style || ""
                            )}
                            onChange={(e) =>
                              setDraftField(
                                "presentation_style",
                                e.target.value
                              )
                            }
                            rows={2}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm">
                            {selectedContent.presentation_style}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedContent?.promise !== undefined ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Promise
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(selectedContent.promise || "")}
                            onChange={(e) =>
                              setDraftField("promise", e.target.value)
                            }
                            rows={3}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.promise}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedContent?.objective !== undefined ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Objective
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(selectedContent.objective || "")}
                            onChange={(e) =>
                              setDraftField("objective", e.target.value)
                            }
                            rows={3}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.objective}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedContent?.summary !== undefined ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Summary
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(selectedContent.summary || "")}
                            onChange={(e) =>
                              setDraftField("summary", e.target.value)
                            }
                            rows={3}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.summary}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedContent?.purpose !== undefined ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Purpose
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(selectedContent.purpose || "")}
                            onChange={(e) =>
                              setDraftField("purpose", e.target.value)
                            }
                            rows={3}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.purpose}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedContent?.audience_takeaway !== undefined ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="text-sm font-semibold text-emerald-200">
                          Audience takeaway
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(
                              selectedContent.audience_takeaway || ""
                            )}
                            onChange={(e) =>
                              setDraftField(
                                "audience_takeaway",
                                e.target.value
                              )
                            }
                            rows={3}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.audience_takeaway}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedContent?.intended_reader !== undefined ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="text-sm font-semibold text-emerald-200">
                          Intended reader
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(
                              selectedContent.intended_reader || ""
                            )}
                            onChange={(e) =>
                              setDraftField(
                                "intended_reader",
                                e.target.value
                              )
                            }
                            rows={3}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.intended_reader}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedContent?.instructions !== undefined ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="text-sm font-semibold text-emerald-200">
                          Instructions
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(selectedContent.instructions || "")}
                            onChange={(e) =>
                              setDraftField("instructions", e.target.value)
                            }
                            rows={4}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.instructions}
                          </div>
                        )}
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
                            {editMode && !isTemplate(selected) ? (
                              <input
                                value={String(section?.title || "")}
                                onChange={(e) =>
                                  updateSectionTitle(idx, e.target.value)
                                }
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200"
                              />
                            ) : (
                              <div className="text-sm font-semibold text-slate-200">
                                {idx + 1}. {String(section?.title || "").trim()}
                              </div>
                            )}

                            <div className="mt-2 space-y-2">
                              {Array.isArray(section?.bullets) &&
                                section.bullets.map(
                                  (bullet: any, bulletIdx: number) =>
                                    editMode && !isTemplate(selected) ? (
                                      <textarea
                                        key={`${(selected as any).id}-section-${idx}-bullet-${bulletIdx}`}
                                        value={String(bullet || "")}
                                        onChange={(e) =>
                                          updateSectionBullet(
                                            idx,
                                            bulletIdx,
                                            e.target.value
                                          )
                                        }
                                        rows={2}
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                      />
                                    ) : (
                                      <div
                                        key={`${(selected as any).id}-section-${idx}-bullet-${bulletIdx}`}
                                        className="text-sm text-slate-300"
                                      >
                                        • {String(bullet || "").trim()}
                                      </div>
                                    )
                                )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {Array.isArray(selectedContent?.slides) &&
                    selectedContent.slides.length > 0 ? (
                      <div className="space-y-6">
                        {selectedContent.slides.map((rawSlide: any, idx: number) => {
                          const slide = getSafeSlide(rawSlide);
                          const visualDirection = String(
                            slide?.visual_direction || ""
                          ).trim();
                          const imagePrompt = String(
                            slide?.image_prompt || ""
                          ).trim();
                          const artworkLabel = String(
                            slide?.artwork_label || ""
                          ).trim();
                          const artworkChip = String(
                            slide?.artwork_chip || ""
                          ).trim();
                          const generatedImageUrl = String(
                            slide?.generated_image_url || ""
                          ).trim();
                          const imageSource = String(
                            slide?.generated_image_source || ""
                          ).trim();

                          const art = getArtFromVisualDirection(
                            [
                              visualDirection,
                              artworkLabel,
                              artworkChip,
                              (selected as any)?.title || "",
                              slide?.slide_title || "",
                              slide?.slide_goal || "",
                              selectedContent?.objective || "",
                              selectedContent?.promise || "",
                            ].join(" ")
                          );

                          const isGeneratingImage =
                            busyAction ===
                            `image:${(selected as Resource).id}:${idx}`;

                          const isUploadingImage =
                            busyAction ===
                            `upload:${(selected as Resource).id}:${idx}`;

                          const inputKey = `${(selected as Resource).id}:${idx}`;

                          return (
                            <div
                              key={`${(selected as any).id}-slide-${idx}`}
                              className={[
                                "relative overflow-hidden rounded-[28px] border p-6 md:p-8 transition",
                                editMode
                                  ? "border-slate-800 bg-slate-950/60"
                                  : theme.card,
                              ].join(" ")}
                            >
                              {!editMode && showArtwork ? (
                                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                                  {generatedImageUrl ? (
                                    <>
                                      <img
                                        src={generatedImageUrl}
                                        alt={
                                          slide?.slide_title || `Slide ${idx + 1}`
                                        }
                                        className="absolute inset-0 h-full w-full object-cover"
                                      />
                                      <div
                                        className={`absolute inset-0 ${theme.imageTint}`}
                                      />
                                      <div
                                        className={`absolute inset-0 ${theme.overlay}`}
                                      />
                                    </>
                                  ) : (
                                    <>
                                      <div
                                        className={[
                                          "absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl",
                                          art.orbA,
                                        ].join(" ")}
                                      />
                                      <div
                                        className={[
                                          "absolute -left-10 bottom-0 h-32 w-32 rounded-full blur-3xl",
                                          art.orbB,
                                        ].join(" ")}
                                      />
                                      <div
                                        className={[
                                          "absolute inset-x-0 top-16 border-t",
                                          art.line,
                                        ].join(" ")}
                                      />
                                    </>
                                  )}
                                </div>
                              ) : null}

                              <div className="relative z-10">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div
                                    className={[
                                      "text-[11px] uppercase tracking-[0.18em]",
                                      theme.subtle,
                                    ].join(" ")}
                                  >
                                    Slide {idx + 1}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    {!editMode && imageSource ? (
                                      <div
                                        className={[
                                          "inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-wide",
                                          theme.badge,
                                        ].join(" ")}
                                      >
                                        {imageSource === "upload"
                                          ? "Custom artwork"
                                          : "AI artwork"}
                                      </div>
                                    ) : null}

                                    {!editMode ? (
                                      <div
                                        className={[
                                          "inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-wide",
                                          theme.badge,
                                        ].join(" ")}
                                      >
                                        <span className="whitespace-nowrap">
                                          {presentationMode === "presenter"
                                            ? "Presenter view"
                                            : "Audience view"}
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                {editMode && !isTemplate(selected) ? (
                                  <input
                                    value={String(slide?.slide_title || "")}
                                    onChange={(e) =>
                                      updateSlideField(
                                        idx,
                                        "slide_title",
                                        e.target.value
                                      )
                                    }
                                    className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xl font-semibold text-slate-100"
                                  />
                                ) : (
                                  <div className="mt-3 text-2xl md:text-3xl font-semibold leading-tight max-w-3xl">
                                    {slide?.slide_title || `Slide ${idx + 1}`}
                                  </div>
                                )}

                                {!editMode ? (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        generateSlideImage(
                                          selected as Resource,
                                          idx
                                        )
                                      }
                                      disabled={isGeneratingImage || isUploadingImage}
                                      className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                                    >
                                      {isGeneratingImage
                                        ? "Generating…"
                                        : generatedImageUrl && imageSource === "ai"
                                        ? "Regenerate image"
                                        : "Generate image"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        fileInputRefs.current[inputKey]?.click()
                                      }
                                      disabled={isGeneratingImage || isUploadingImage}
                                      className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10 disabled:opacity-60"
                                    >
                                      {isUploadingImage
                                        ? "Uploading…"
                                        : "Upload artwork"}
                                    </button>

                                    <input
                                      ref={(el) => {
                                        fileInputRefs.current[inputKey] = el;
                                      }}
                                      type="file"
                                      accept="image/png,image/jpeg,image/jpg,image/webp"
                                      className="hidden"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        await uploadSlideArtwork(
                                          selected as Resource,
                                          idx,
                                          file
                                        );
                                        e.currentTarget.value = "";
                                      }}
                                    />

                                    {generatedImageUrl ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          clearSlideImage(
                                            selected as Resource,
                                            idx
                                          )
                                        }
                                        disabled={
                                          busyAction ===
                                            `save:${(selected as Resource).id}` ||
                                          isUploadingImage ||
                                          isGeneratingImage
                                        }
                                        className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10 disabled:opacity-60"
                                      >
                                        Remove image
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}

                                {slide?.slide_goal !== undefined ? (
                                  <div className="mt-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide opacity-60">
                                      Slide goal
                                    </div>
                                    {editMode && !isTemplate(selected) ? (
                                      <textarea
                                        value={String(slide?.slide_goal || "")}
                                        onChange={(e) =>
                                          updateSlideField(
                                            idx,
                                            "slide_goal",
                                            e.target.value
                                          )
                                        }
                                        rows={2}
                                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                      />
                                    ) : presentationMode === "presenter" ? (
                                      <div className="mt-2 text-sm opacity-80 max-w-3xl">
                                        {String(slide?.slide_goal || "").trim()}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}

                                {editMode ? (
                                  <div className="mt-4 grid gap-3 md:grid-cols-2 max-w-4xl">
                                    <div
                                      className={[
                                        "rounded-2xl border p-3",
                                        theme.note,
                                      ].join(" ")}
                                    >
                                      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                                        Visual direction
                                      </div>
                                      <textarea
                                        value={visualDirection}
                                        onChange={(e) =>
                                          updateSlideField(
                                            idx,
                                            "visual_direction",
                                            e.target.value
                                          )
                                        }
                                        rows={3}
                                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                      />
                                    </div>

                                    <div
                                      className={[
                                        "rounded-2xl border p-3",
                                        theme.note,
                                      ].join(" ")}
                                    >
                                      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                                        Image prompt
                                      </div>
                                      <textarea
                                        value={imagePrompt}
                                        onChange={(e) =>
                                          updateSlideField(
                                            idx,
                                            "image_prompt",
                                            e.target.value
                                          )
                                        }
                                        rows={3}
                                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                      />
                                    </div>
                                  </div>
                                ) : null}

                                <div className="mt-6 space-y-3 max-w-3xl">
                                  {Array.isArray(slide?.bullets) &&
                                    slide.bullets.map(
                                      (bullet: any, bulletIdx: number) =>
                                        editMode && !isTemplate(selected) ? (
                                          <textarea
                                            key={`${(selected as any).id}-slide-${idx}-bullet-${bulletIdx}`}
                                            value={String(bullet || "")}
                                            onChange={(e) =>
                                              updateSlideBullet(
                                                idx,
                                                bulletIdx,
                                                e.target.value
                                              )
                                            }
                                            rows={2}
                                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                          />
                                        ) : (
                                          <div
                                            key={`${(selected as any).id}-slide-${idx}-bullet-${bulletIdx}`}
                                            className="flex items-start gap-3 text-base md:text-lg leading-relaxed"
                                          >
                                            <span className="mt-1 opacity-70">
                                              •
                                            </span>
                                            <span>
                                              {String(bullet || "").trim()}
                                            </span>
                                          </div>
                                        )
                                    )}
                                </div>

                                {slide?.speaker_notes !== undefined ? (
                                  <div className="mt-6">
                                    {editMode && !isTemplate(selected) ? (
                                      <>
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                          Speaker notes
                                        </div>
                                        <textarea
                                          value={String(
                                            slide?.speaker_notes || ""
                                          )}
                                          onChange={(e) =>
                                            updateSlideField(
                                              idx,
                                              "speaker_notes",
                                              e.target.value
                                            )
                                          }
                                          rows={5}
                                          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                                        />
                                      </>
                                    ) : presentationMode === "presenter" ? (
                                      <div
                                        className={[
                                          "rounded-2xl border p-4 max-w-4xl mt-2",
                                          theme.note,
                                        ].join(" ")}
                                      >
                                        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                                          Speaker notes
                                        </div>
                                        <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                                          {String(
                                            slide?.speaker_notes || ""
                                          ).trim()}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}

                                {slide?.audience_prompt !== undefined ? (
                                  <div className="mt-4">
                                    {editMode && !isTemplate(selected) ? (
                                      <>
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                          Audience prompt
                                        </div>
                                        <textarea
                                          value={String(
                                            slide?.audience_prompt || ""
                                          )}
                                          onChange={(e) =>
                                            updateSlideField(
                                              idx,
                                              "audience_prompt",
                                              e.target.value
                                            )
                                          }
                                          rows={3}
                                          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                                        />
                                      </>
                                    ) : presentationMode === "presenter" ? (
                                      <div
                                        className={[
                                          "text-sm italic max-w-4xl mt-2",
                                          theme.prompt,
                                        ].join(" ")}
                                      >
                                        Audience prompt:{" "}
                                        {String(
                                          slide?.audience_prompt || ""
                                        ).trim()}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                                       {Array.isArray(selectedContent?.reflection_prompts) &&
                    selectedContent.reflection_prompts.length > 0 ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Reflection prompts
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedContent.reflection_prompts.map(
                            (prompt: any, idx: number) =>
                              editMode && !isTemplate(selected) ? (
                                <textarea
                                  key={`${(selected as any).id}-reflection-${idx}`}
                                  value={String(prompt || "")}
                                  onChange={(e) =>
                                    updateStringArrayField(
                                      "reflection_prompts",
                                      idx,
                                      e.target.value
                                    )
                                  }
                                  rows={2}
                                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                />
                              ) : (
                                <div
                                  key={`${(selected as any).id}-reflection-${idx}`}
                                  className="text-sm text-slate-300"
                                >
                                  • {String(prompt || "").trim()}
                                </div>
                              )
                          )}
                        </div>
                      </div>
                    ) : null}

                    {Array.isArray(selectedContent?.action_prompts) &&
                    selectedContent.action_prompts.length > 0 ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Action prompts
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedContent.action_prompts.map(
                            (prompt: any, idx: number) =>
                              editMode && !isTemplate(selected) ? (
                                <textarea
                                  key={`${(selected as any).id}-action-${idx}`}
                                  value={String(prompt || "")}
                                  onChange={(e) =>
                                    updateStringArrayField(
                                      "action_prompts",
                                      idx,
                                      e.target.value
                                    )
                                  }
                                  rows={2}
                                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                />
                              ) : (
                                <div
                                  key={`${(selected as any).id}-action-${idx}`}
                                  className="text-sm text-slate-300"
                                >
                                  • {String(prompt || "").trim()}
                                </div>
                              )
                          )}
                        </div>
                      </div>
                    ) : null}

                    {selectedContent?.closing_invitation !== undefined ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Closing invitation
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(
                              selectedContent.closing_invitation || ""
                            )}
                            onChange={(e) =>
                              setDraftField(
                                "closing_invitation",
                                e.target.value
                              )
                            }
                            rows={3}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.closing_invitation}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedContent?.closing_encouragement !== undefined ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Closing encouragement
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(
                              selectedContent.closing_encouragement || ""
                            )}
                            onChange={(e) =>
                              setDraftField(
                                "closing_encouragement",
                                e.target.value
                              )
                            }
                            rows={3}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.closing_encouragement}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedContent?.closing_note !== undefined ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Closing note
                        </div>
                        {editMode && !isTemplate(selected) ? (
                          <textarea
                            value={String(selectedContent.closing_note || "")}
                            onChange={(e) =>
                              setDraftField("closing_note", e.target.value)
                            }
                            rows={3}
                            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          />
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            {selectedContent.closing_note}
                          </div>
                        )}
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

      {creatorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setCreatorOpen(false)}
          />

          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-4 px-6 pt-6 shrink-0">
              <div>
                <div className="text-xs text-slate-400">Content Creator</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  Create Resource
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  Generate a calm, useful long-form resource and save it straight
                  to the library.
                </div>
              </div>

              <button
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                onClick={() => setCreatorOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 overflow-y-auto px-6 pb-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Resource type
                  </label>
                  <select
                    value={creatorType}
                    onChange={(e) =>
                      setCreatorType(e.target.value as CreateResourceType)
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="webinar_outline">Webinar</option>
                    <option value="presentation">Presentation</option>
                    <option value="guide">Guide</option>
                    <option value="worksheet">Worksheet</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Fill level
                  </label>
                  <select
                    value={creatorFillLevel}
                    onChange={(e) =>
                      setCreatorFillLevel(e.target.value as FillLevel)
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="skeleton">Skeleton</option>
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Title / topic
                </label>
                <input
                  value={creatorTitle}
                  onChange={(e) => setCreatorTitle(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  placeholder="e.g. Workplace Stress Webinar"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Goal
                  </label>
                  <input
                    value={creatorGoal}
                    onChange={(e) => setCreatorGoal(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    placeholder="e.g. Webinar signups or workplace education"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Audience
                  </label>
                  <input
                    value={creatorAudience}
                    onChange={(e) => setCreatorAudience(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    placeholder="e.g. HR leaders, managers, staff"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Tone
                  </label>
                  <input
                    value={creatorTone}
                    onChange={(e) => setCreatorTone(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    placeholder="e.g. calm and professional"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Duration
                  </label>
                  <input
                    value={creatorDuration}
                    onChange={(e) => setCreatorDuration(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    placeholder="e.g. 30 mins"
                    disabled={
                      creatorType === "guide" || creatorType === "worksheet"
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Notes
                </label>
                <textarea
                  value={creatorNotes}
                  onChange={(e) => setCreatorNotes(e.target.value)}
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm"
                  placeholder="Add extra context, delivery angle, key teaching points, or desired emphasis..."
                />
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-[12px] text-slate-300">
                <div className="font-semibold text-slate-200">
                  What gets created
                </div>
                <div className="mt-2">
                  {creatorType === "webinar_outline" &&
                    "A full webinar deck using the same slide system as presentation: objective, takeaway, slide-by-slide structure, presenter notes, audience prompts, and closing invitation."}
                  {creatorType === "presentation" &&
                    "A slide-by-slide presentation structure with objective, takeaway, presenter notes, audience prompts, slide images, and a closing invitation."}
                  {creatorType === "guide" &&
                    "A readable guide with summary, intended reader, 5 sections, and a closing encouragement."}
                  {creatorType === "worksheet" &&
                    "A practical worksheet with instructions, reflection prompts, action prompts, and a closing note."}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={createResource}
                  disabled={busyAction === "create-resource"}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {busyAction === "create-resource"
                    ? "Creating…"
                    : "Create Resource"}
                </button>

                <button
                  type="button"
                  onClick={() => setCreatorOpen(false)}
                  disabled={busyAction === "create-resource"}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
