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
  | "worksheet"
  | "course";
type FillLevel = "skeleton" | "draft" | "ready";
type PresentationMode = "audience" | "presenter";
type PresentationTheme = "calm" | "corporate" | "warm" | "dark";
type ActiveImageSource = "" | "ai" | "upload";

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
  if (type === "course") return "New Course";
  return "New Worksheet";
}
function typeLabel(type: CreateResourceType) {
  if (type === "webinar_outline") return "Webinar";
  if (type === "presentation") return "Presentation";
  if (type === "guide") return "Guide";
  if (type === "course") return "Course";
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
  next.generated_image_source = String(
    next.generated_image_source || ""
  ).trim();

  next.uploaded_image_url = String(next.uploaded_image_url || "").trim();
  next.uploaded_image_status = String(next.uploaded_image_status || "").trim();
  next.uploaded_image_source = String(next.uploaded_image_source || "").trim();
  next.uploaded_image_name = String(next.uploaded_image_name || "").trim();

  next.active_image_source = String(
    next.active_image_source || ""
  ).trim() as ActiveImageSource;

  if (
    !next.active_image_source ||
    (next.active_image_source !== "ai" &&
      next.active_image_source !== "upload")
  ) {
    if (next.uploaded_image_url) {
      next.active_image_source = "upload";
    } else if (next.generated_image_url) {
      next.active_image_source = "ai";
    } else {
      next.active_image_source = "";
    }
  }

  next.artwork_generated_at = next.artwork_generated_at || null;

  return next;
}
function upgradeLegacyResourceContent(content: any) {
  const next = isObjectLike(content) ? deepClone(content) : {};

  next.presentation_style = String(next.presentation_style || "").trim();
  next.promise = String(next.promise || "").trim();
  next.objective = String(next.objective || "").trim();
  next.summary = String(next.summary || "").trim();
  next.purpose = String(next.purpose || "").trim();
  next.audience_takeaway = String(next.audience_takeaway || "").trim();
  next.intended_reader = String(next.intended_reader || "").trim();
  next.instructions = String(next.instructions || "").trim();
  next.closing_invitation = String(next.closing_invitation || "").trim();
  next.closing_encouragement = String(
    next.closing_encouragement || ""
  ).trim();
  next.closing_note = String(next.closing_note || "").trim();

  if (Array.isArray(next.slides)) {
    next.slides = next.slides.map((slide: any) => getSafeSlide(slide));
  }

  if (Array.isArray(next.sections)) {
    next.sections = next.sections.map((section: any) => ({
      title: String(section?.title || "").trim(),
      bullets: Array.isArray(section?.bullets)
        ? section.bullets.map((b: any) => String(b || "").trim())
        : [],
    }));
  }

  if (Array.isArray(next.reflection_prompts)) {
    next.reflection_prompts = next.reflection_prompts.map((p: any) =>
      String(p || "").trim()
    );
  }

  if (Array.isArray(next.action_prompts)) {
    next.action_prompts = next.action_prompts.map((p: any) =>
      String(p || "").trim()
    );
  }

  return next;
}

function isObjectLike(value: any) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resourceNeedsLegacyUpgrade(content: any) {
  if (!isObjectLike(content)) return false;

  const slides = Array.isArray(content?.slides) ? content.slides : [];
  if (!slides.length) return false;

  return slides.some((slide: any) => {
    const s = slide && typeof slide === "object" ? slide : {};
    return (
      s.uploaded_image_url === undefined ||
      s.uploaded_image_status === undefined ||
      s.uploaded_image_source === undefined ||
      s.uploaded_image_name === undefined ||
      s.active_image_source === undefined ||
      s.generated_image_prompt === undefined ||
      s.generated_image_status === undefined ||
      s.generated_image_source === undefined ||
      s.artwork_label === undefined ||
      s.artwork_chip === undefined ||
      s.image_prompt === undefined ||
      s.visual_direction === undefined ||
      s.audience_prompt === undefined ||
      s.speaker_notes === undefined
    );
  });
}
function getDisplayImageForSlide(slide: any) {
  const safe = getSafeSlide(slide);

  if (
    safe.active_image_source === "upload" &&
    String(safe.uploaded_image_url || "").trim()
  ) {
    return {
      url: String(safe.uploaded_image_url || "").trim(),
      source: "upload" as ActiveImageSource,
    };
  }

  if (
    safe.active_image_source === "ai" &&
    String(safe.generated_image_url || "").trim()
  ) {
    return {
      url: String(safe.generated_image_url || "").trim(),
      source: "ai" as ActiveImageSource,
    };
  }

  if (String(safe.uploaded_image_url || "").trim()) {
    return {
      url: String(safe.uploaded_image_url || "").trim(),
      source: "upload" as ActiveImageSource,
    };
  }

  if (String(safe.generated_image_url || "").trim()) {
    return {
      url: String(safe.generated_image_url || "").trim(),
      source: "ai" as ActiveImageSource,
    };
  }

  return {
    url: "",
    source: "" as ActiveImageSource,
  };
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
  const [usage, setUsage] = useState<number>(0);
  const [limit, setLimit] = useState<number>(0);
  const [proposalPrice, setProposalPrice] = useState("");
const [proposalText, setProposalText] = useState("");
  async function loadUsage() {
  try {
    const res = await fetch("/api/usage");
    const data = await res.json();

    setUsage(data?.usage || 0);
    setLimit(data?.limit || 0);
  } catch (e) {
    console.error("Failed to load usage");
  }
}
  const [toast, setToast] = useState<string | null>(null);

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorType, setCreatorType] =
    useState<CreateResourceType>("webinar_outline");
  const [creatorTitle, setCreatorTitle] = useState("New Webinar");
  const [creatorGoal, setCreatorGoal] = useState("");
const [creatorAudience, setCreatorAudience] = useState("");
const [creatorInstructorType, setCreatorInstructorType] =
  useState("therapist");
const [creatorLearnerAudience, setCreatorLearnerAudience] =
  useState("members of the public");
const [creatorDeliveryContext, setCreatorDeliveryContext] =
  useState("workshop");
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
const [slideImproveInputs, setSlideImproveInputs] = useState<
  Record<string, string>
>({});
const [presentationImproveInput, setPresentationImproveInput] = useState("");
const [improvingPresentation, setImprovingPresentation] = useState(false);
const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  async function loadOrganisation() {
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data?.organisationId) {
        throw new Error(data?.error || "Failed to load organisation");
      }

      setOrganisationId(data.organisationId);
      console.log("RESOURCES PAGE organisationId:", data.organisationId);
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

    await loadUsage()
  }

  init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
  useEffect(() => {
  const interval = setInterval(() => {
    loadUsage();
  }, 5000);

  return () => clearInterval(interval);
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
    } else if (creatorType === "course") {
      setCreatorDuration("n/a");
      setCreatorTone("supportive and practical");
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
    setDraftContent(
      deepClone(upgradeLegacyResourceContent(selected.content || {}))
    );
  }, [selected]);
  function buildProposalText(resource: Resource, totalPriceInput: string) {
  const content = resource?.content || {};
  const totalPrice = Number(String(totalPriceInput || "").replace(/[^0-9.]/g, ""));
  const safeTotal = Number.isFinite(totalPrice) ? totalPrice : 0;

  const isPresentationLike =
    resource?.resource_type === "presentation" ||
    resource?.resource_type === "webinar_outline";

  const sections = Array.isArray((content as any)?.sections) ? (content as any).sections : [];
  const slides = Array.isArray((content as any)?.slides) ? (content as any).slides : [];

  const itemCount = isPresentationLike
    ? slides.length || 1
    : sections.length || 1;

  const perSession = safeTotal > 0 ? (safeTotal / itemCount).toFixed(2) : null;

  const title = String(resource?.title || "Programme").trim();

  const summary = String(
    (content as any)?.summary ||
      (content as any)?.objective ||
      (content as any)?.audience_takeaway ||
      ""
  ).trim();

  const audience = String(
    (content as any)?.intended_reader ||
      (content as any)?.audience ||
      "Public, workplace, or practitioner audiences"
  ).trim();

  const format = isPresentationLike
    ? "Presentation / webinar delivery"
    : "Structured programme delivery";

  const lines = [
    `${title}`,
    ``,
    `Overview:`,
    summary || "Tailored learning experience designed for practical delivery.",
    ``,
    `Audience:`,
    audience,
    ``,
    `Format:`,
    format,
    ``,
    `Scope:`,
    isPresentationLike
      ? `${itemCount} slides / teaching segments`
      : `${itemCount} sessions / modules`,
    ``,
  ];

  if (safeTotal > 0) {
    lines.push(`Investment:`);
    lines.push(`£${safeTotal.toFixed(2)}`);
    lines.push(``);

    if (perSession) {
      lines.push(`Equivalent rate:`);
      lines.push(`£${perSession} per ${isPresentationLike ? "slide segment" : "session"}`);
      lines.push(``);
    }
  }

  lines.push(`Includes:`);
  lines.push(`- Tailored delivery discussion`);
  lines.push(`- Structured teaching materials`);
  lines.push(`- Professional summary document`);
  lines.push(`- Option to adapt for your organisation or audience`);
  lines.push(``);
  lines.push(`Next steps:`);
  lines.push(
    `I’d be happy to discuss delivery options, timing, customisation, and any questions you may have.`
  );

  return lines.join("\n");
}

function downloadProposalAsPdf(resource: Resource, proposal: string) {
  const escapeHtml = (value: unknown) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const title = String(resource?.title || "Proposal").trim();

  let brand: any = {};
  try {
    const raw = localStorage.getItem("rootops_brand_profile_v1");
    if (raw) brand = JSON.parse(raw);
  } catch {}

  const html = `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            line-height: 1.6;
            color: #0f172a;
            background: #ffffff;
          }

          .top-logo {
            margin-bottom: 18px;
          }

          .top-logo img {
            height: 48px;
            width: auto;
            object-fit: contain;
          }

          h1 {
            font-size: 24px;
            margin: 0 0 20px 0;
          }

          .box {
            border: 1px solid #cbd5e1;
            border-radius: 14px;
            padding: 20px;
            white-space: pre-wrap;
            background: #f8fafc;
          }

          .footer {
            margin-top: 28px;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            font-size: 13px;
            color: #475569;
          }

          .footer-logo {
            margin-bottom: 12px;
          }

          .footer-logo img {
            height: 32px;
            width: auto;
            object-fit: contain;
          }

          .footer-line {
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        ${
          brand?.logoUrl
            ? `
          <div class="top-logo">
            <img src="${escapeHtml(brand.logoUrl)}" alt="Logo" />
          </div>
        `
            : ""
        }

        <h1>${escapeHtml(title)}</h1>

        <div class="box">${escapeHtml(proposal)}</div>

        <div class="footer">
          ${
            brand?.logoUrl
              ? `
            <div class="footer-logo">
              <img src="${escapeHtml(brand.logoUrl)}" alt="Logo" />
            </div>
          `
              : ""
          }

          ${
            brand?.footerText
              ? `<div class="footer-line">${escapeHtml(brand.footerText)}</div>`
              : ""
          }
          ${
            brand?.yourName
              ? `<div class="footer-line"><strong>${escapeHtml(
                  brand.yourName
                )}</strong></div>`
              : ""
          }
          ${
            brand?.businessName
              ? `<div class="footer-line">${escapeHtml(
                  brand.businessName
                )}</div>`
              : ""
          }
          ${
            brand?.contactEmail
              ? `<div class="footer-line">${escapeHtml(
                  brand.contactEmail
                )}</div>`
              : ""
          }
          ${
            brand?.website
              ? `<div class="footer-line">${escapeHtml(brand.website)}</div>`
              : ""
          }
        </div>
      </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (!w) return;

  w.document.write(html);
  w.document.close();
  w.focus();

  setTimeout(() => w.print(), 300);
}
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
  title: resource.title || "Course Pack",
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
  active_image_source:
    slide.uploaded_image_url && slide.active_image_source === "upload"
      ? "upload"
      : "ai",
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
        active_image_source:
          slide.uploaded_image_url && slide.active_image_source === "upload"
            ? "upload"
            : "ai",
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
async function improveSlide(resource: Resource, slideIndex: number) {
  const content = deepClone(resource.content || {});
  const slides = Array.isArray(content?.slides) ? content.slides : [];
  const slide = getSafeSlide(slides[slideIndex]);
  const inputKey = `${resource.id}:${slideIndex}`;
  const instruction = String(slideImproveInputs[inputKey] || "").trim();

  if (!slide) return;

  if (!instruction) {
    setError("Please enter an instruction for the slide improvement.");
    return;
  }

  setBusyAction(`improve:${resource.id}:${slideIndex}`);
  setError(null);

  try {
    const res = await fetch("/api/ai/improve-slide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presentationTitle: resource.title,
        presentationObjective: String(content?.objective || "").trim(),
        presentationPromise: String(content?.promise || "").trim(),
        presentationAudienceTakeaway: String(
          content?.audience_takeaway || ""
        ).trim(),
        presentationStyle: String(content?.presentation_style || "").trim(),
        slideIndex,
        slide,
        instruction,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success || !data?.slide) {
      throw new Error(data?.error || "Failed to improve slide");
    }

    await persistSlidePatch(
      resource,
      slideIndex,
      {
        slide_title: String(data.slide.slide_title || "").trim(),
        slide_goal: String(data.slide.slide_goal || "").trim(),
        bullets: Array.isArray(data.slide.bullets) ? data.slide.bullets : [],
        speaker_notes: String(data.slide.speaker_notes || "").trim(),
        audience_prompt: String(data.slide.audience_prompt || "").trim(),
        visual_direction: String(data.slide.visual_direction || "").trim(),
        image_prompt: String(data.slide.image_prompt || "").trim(),
        artwork_label: String(data.slide.artwork_label || "").trim(),
        artwork_chip: String(data.slide.artwork_chip || "").trim(),
      },
      `Slide ${slideIndex + 1} improved ✅`
    );

    setSlideImproveInputs((prev) => ({
      ...prev,
      [inputKey]: "",
    }));
  } catch (e: any) {
    setError(e?.message || "Failed to improve slide");
  } finally {
    setBusyAction(null);
  }
}

async function improvePresentation(resource: Resource) {
  const content = deepClone(resource.content || {});
  const instruction = String(presentationImproveInput || "").trim();

  if (!instruction) {
    setError("Please enter an instruction for the presentation improvement.");
    return;
  }

  if (!Array.isArray(content?.slides) || !content.slides.length) {
    setError("This resource does not contain presentation slides.");
    return;
  }

  setImprovingPresentation(true);
  setError(null);
  setToast(null);

  try {
    const res = await fetch("/api/ai/improve-presentation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: resource.title,
        objective: String(content?.objective || "").trim(),
        promise: String(content?.promise || "").trim(),
        audience_takeaway: String(content?.audience_takeaway || "").trim(),
        presentation_style: String(content?.presentation_style || "").trim(),
        closing_invitation: String(content?.closing_invitation || "").trim(),
        slides: Array.isArray(content?.slides) ? content.slides : [],
        instruction,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success || !data?.presentation) {
      throw new Error(data?.error || "Failed to improve presentation");
    }

    const nextContent = {
      ...content,
      objective: String(data.presentation.objective || "").trim(),
      audience_takeaway: String(
        data.presentation.audience_takeaway || ""
      ).trim(),
      presentation_style: String(
        data.presentation.presentation_style || ""
      ).trim(),
      closing_invitation: String(
        data.presentation.closing_invitation || ""
      ).trim(),
      slides: Array.isArray(data.presentation.slides)
        ? data.presentation.slides
        : Array.isArray(content?.slides)
        ? content.slides
        : [],
    };

    await persistResourceContent(
      resource,
      nextContent,
      "Presentation improved ✅"
    );

    setPresentationImproveInput("");
  } catch (e: any) {
    setError(e?.message || "Failed to improve presentation");
  } finally {
    setImprovingPresentation(false);
  }
}
  async function uploadSlideArtwork(
  resource: Resource,
  slideIndex: number,
  file: File
) {
  if (!organisationId) {
    setError("Organisation not loaded yet.");
    return;
  }

  const content = deepClone(resource.content || {});
  const slides = Array.isArray(content?.slides) ? content.slides : [];
  const slide = getSafeSlide(slides[slideIndex]);

  if (!slide || !file) return;

  setBusyAction(`upload:${resource.id}:${slideIndex}`);
  setError(null);

  try {
    const form = new FormData();
    form.append("file", file);
    form.append("organisationId", organisationId);
    form.append("resourceId", resource.id);
    form.append("slideIndex", String(slideIndex));
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
        uploaded_image_url: nextImageUrl,
        uploaded_image_status: "uploaded",
        uploaded_image_source: "upload",
        uploaded_image_name: String(data?.fileName || file.name || "").trim(),
        active_image_source: "upload",
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
  async function setActiveSlideImageSource(
  resource: Resource,
  slideIndex: number,
  source: ActiveImageSource
) {
  setBusyAction(`source:${resource.id}:${slideIndex}`);
  setError(null);

  try {
    await persistSlidePatch(
      resource,
      slideIndex,
      {
        active_image_source: source,
      },
      source === "upload"
        ? `Slide ${slideIndex + 1} set to custom artwork ✅`
        : source === "ai"
        ? `Slide ${slideIndex + 1} set to AI artwork ✅`
        : `Slide ${slideIndex + 1} artwork cleared ✅`
    );
  } catch (e: any) {
    setError(e?.message || "Failed to update slide artwork source");
  } finally {
    setBusyAction(null);
  }
}

async function clearAiSlideImage(resource: Resource, slideIndex: number) {
  const content = deepClone(resource.content || {});
  const slides = Array.isArray(content?.slides) ? content.slides : [];
  const slide = getSafeSlide(slides[slideIndex]);

  if (!slide) return;

  setBusyAction(`clear-ai:${resource.id}:${slideIndex}`);
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
        active_image_source:
          slide.active_image_source === "ai" && slide.uploaded_image_url
            ? "upload"
            : slide.active_image_source === "ai"
            ? ""
            : slide.active_image_source,
        artwork_generated_at: new Date().toISOString(),
      },
      "AI artwork removed ✅"
    );
  } catch (e: any) {
    setError(e?.message || "Failed to remove AI artwork");
  } finally {
    setBusyAction(null);
  }
}

async function clearUploadedSlideImage(
  resource: Resource,
  slideIndex: number
) {
  const content = deepClone(resource.content || {});
  const slides = Array.isArray(content?.slides) ? content.slides : [];
  const slide = getSafeSlide(slides[slideIndex]);

  if (!slide) return;

  setBusyAction(`clear-upload:${resource.id}:${slideIndex}`);
  setError(null);

  try {
    await persistSlidePatch(
      resource,
      slideIndex,
      {
        uploaded_image_url: "",
        uploaded_image_status: "",
        uploaded_image_source: "",
        uploaded_image_name: "",
        active_image_source:
          slide.active_image_source === "upload" && slide.generated_image_url
            ? "ai"
            : slide.active_image_source === "upload"
            ? ""
            : slide.active_image_source,
        artwork_generated_at: new Date().toISOString(),
      },
      "Custom artwork removed ✅"
    );
  } catch (e: any) {
    setError(e?.message || "Failed to remove custom artwork");
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
    await loadUsage();
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
async function createProgramme() {
  if (!organisationId) return;

  const title = creatorTitle.trim();
  if (!title) {
    setError("Title is required.");
    return;
  }

  setBusyAction("create-programme");
  setError(null);

  try {
    const body: any = {
      topic: title,
      name: title,
      goal: creatorGoal.trim(),
      audience: creatorAudience.trim(),
      instructorType: creatorInstructorType,
      learnerAudience: creatorLearnerAudience,
      deliveryContext: creatorDeliveryContext,
      notes: creatorNotes.trim(),
      tone: creatorTone.trim(),
      fillLevel: creatorFillLevel,
    };

    const aiRes = await fetch("/api/ai/programme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const aiData = await aiRes.json().catch(() => null);

    if (!aiRes.ok || !aiData?.success) {
      throw new Error(aiData?.error || "Failed to generate programme");
    }

    const content = aiData?.programme || null;
    
    const saveRes = await fetch("/api/resource-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organisationId,
        title,
        resource_type: "course",
        content,
      }),
    });

    const saveData = await saveRes.json().catch(() => null);

    if (!saveRes.ok || !saveData?.success) {
      throw new Error(saveData?.error || "Failed to save programme");
    }

    await loadResources();
    if (saveData?.resource) setSelected(saveData.resource);

    setLibraryTab("saved");
    await loadUsage();
    setCreatorOpen(false);
    setToast("Programme created ✅");
  } catch (e: any) {
    setError(e?.message || "Failed to create programme");
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
  instructorType: creatorInstructorType,
  learnerAudience: creatorLearnerAudience,
  deliveryContext: creatorDeliveryContext,
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
} else if (creatorType === "course") {
  route = "/api/ai/course";
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
      } else if (creatorType === "course") {
        content = aiData?.course || null;
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
  uploaded_image_url: "",
  uploaded_image_status: "",
  uploaded_image_source: "",
  uploaded_image_name: "",
  active_image_source: "",
}
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
    uploaded_image_url: "",
    uploaded_image_status: "",
    uploaded_image_source: "",
    uploaded_image_name: "",
    active_image_source: "",
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
  async function eliteDeepTeachSection(resource: Resource, sectionIndex: number) {
  if (!organisationId) {
    setError("organisationId required");
    return;
  }

  if (!resource?.id) {
    setError("resourceId required");
    return;
  }

  const content = deepClone(resource.content || {});
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  const section = sections[sectionIndex];

  if (!section) {
    setError("Section not found.");
    return;
  }

  setBusyAction(`elite-deep-teach:${resource.id}:${sectionIndex}`);
  setError(null);

  try {
    const aiRes = await fetch("/api/ai/elite-deep-teach-section", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        courseTitle: resource.title,
        courseAudience: String(content?.intended_reader || "").trim(),
        courseSummary: String(content?.summary || "").trim(),
        learnerAudience: String(content?.learner_audience || "").trim(),
        deliveryContext: String(content?.delivery_context || "").trim(),
        sectionTitle: String(section?.title || "").trim(),
        sectionSummary: String(section?.summary || "").trim(),
        sectionBullets: Array.isArray(section?.bullets) ? section.bullets : [],
        keyConceptsExplained: String(
          section?.key_concepts_explained || ""
        ).trim(),
        mainPoints: String(section?.main_points || "").trim(),
        workedExamples: String(section?.worked_examples || "").trim(),
        instructorNotes: String(section?.instructor_notes || "").trim(),
        facilitatorScript: String(section?.facilitator_script || "").trim(),
        deliverySteps: String(section?.delivery_steps || "").trim(),
        exercise: String(section?.exercise || "").trim(),
        selfAssessmentActivity: String(
          section?.self_assessment_activity || ""
        ).trim(),
        exerciseFacilitatorGuidance: String(
          section?.exercise_facilitator_guidance || ""
        ).trim(),
        debriefNotes: String(section?.debrief_notes || "").trim(),
        reflectionPrompt: String(section?.reflection_prompt || "").trim(),
      }),
    });

    const aiData = await aiRes.json().catch(() => null);

    if (!aiRes.ok || !aiData?.success) {
      throw new Error(aiData?.error || "Failed to elite deep teach section");
    }

        const nextContent = deepClone(resource.content || {});
    nextContent.sections = Array.isArray(nextContent.sections)
      ? nextContent.sections
      : [];

    if (!nextContent.sections[sectionIndex]) {
      throw new Error("Section not found while saving elite deep teach notes.");
    }

    nextContent.sections[sectionIndex].facilitator_elite_deep_teach = String(
      aiData?.eliteDeepTeachNotes || ""
    ).trim();

    const saveRes = await fetch("/api/resource-library", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organisationId,
        resourceId: resource.id,
        title: resource.title,
        content: nextContent,
      }),
    });

    const saveData = await saveRes.json().catch(() => null);
    if (!saveRes.ok || !saveData?.success) {
      throw new Error(saveData?.error || "Failed to save elite deep teach notes");
    }

    const updated = saveData?.resource || null;

    if (updated) {
      setResources((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setSelected(updated);
      setDraftTitle(updated.title || "");
      setDraftContent(deepClone(updated.content || {}));
    } else {
      await loadResources();
    }

    setToast(`Module ${sectionIndex + 1} elite deep teach added ✅`);
  } catch (e: any) {
    setError(e?.message || "Failed to elite deep teach section");
  } finally {
    setBusyAction(null);
  }
}
  async function deepTeachSection(resource: Resource, sectionIndex: number) {
  if (!organisationId) {
    setError("organisationId required");
    return;
  }

  if (!resource?.id) {
    setError("resourceId required");
    return;
  }

  const content = deepClone(resource.content || {});
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  const section = sections[sectionIndex];

  if (!section) {
    setError("Section not found.");
    return;
  }

  setBusyAction(`deep-teach:${resource.id}:${sectionIndex}`);
  setError(null);

  try {
    const aiRes = await fetch("/api/ai/deep-teach-section", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        courseTitle: resource.title,
        courseAudience: String(content?.intended_reader || "").trim(),
        courseSummary: String(content?.summary || "").trim(),
        sectionTitle: String(section?.title || "").trim(),
        sectionSummary: String(section?.summary || "").trim(),
        sectionBullets: Array.isArray(section?.bullets) ? section.bullets : [],
        mainPoints: String(section?.main_points || "").trim(),
        instructorNotes: String(section?.instructor_notes || "").trim(),
        facilitatorScript: String(section?.facilitator_script || "").trim(),
        deliverySteps: String(section?.delivery_steps || "").trim(),
        exercise: String(section?.exercise || "").trim(),
        exerciseFacilitatorGuidance: String(
          section?.exercise_facilitator_guidance || ""
        ).trim(),
        reflectionPrompt: String(section?.reflection_prompt || "").trim(),
      }),
    });

    const aiData = await aiRes.json().catch(() => null);

    if (!aiRes.ok || !aiData?.success) {
      throw new Error(aiData?.error || "Failed to deep teach section");
    }

    const nextContent = deepClone(resource.content || {});
    nextContent.sections = Array.isArray(nextContent.sections)
      ? nextContent.sections
      : [];

    if (!nextContent.sections[sectionIndex]) {
      throw new Error("Section not found while saving deep teach notes.");
    }

    nextContent.sections[sectionIndex].facilitator_deep_teach = String(
      aiData?.deepTeachNotes || ""
    ).trim();

    const saveRes = await fetch("/api/resource-library", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organisationId,
        resourceId: resource.id,
        title: resource.title,
        content: nextContent,
      }),
    });

    const saveData = await saveRes.json().catch(() => null);

    if (!saveRes.ok || !saveData?.success) {
      throw new Error(saveData?.error || "Failed to save deep teach notes");
    }

    const updated = saveData?.resource || null;

    if (updated) {
      setResources((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setSelected(updated);
      setDraftTitle(updated.title || "");
      setDraftContent(deepClone(updated.content || {}));
    } else {
      await loadResources();
    }

    setToast(`Module ${sectionIndex + 1} deep teach notes added ✅`);
  } catch (e: any) {
    setError(e?.message || "Failed to deep teach section");
  } finally {
    setBusyAction(null);
  }
}
 async function upgradeLegacyResource(resource: Resource) {
  if (!organisationId) {
    setError("organisationId required");
    return;
  }

  if (!resource?.id) {
    setError("resourceId required");
    return;
  }

  setBusyAction(`upgrade:${resource.id}`);
  setError(null);
   
 try {
    const content = deepClone(resource.content || {});

    const saveRes = await fetch("/api/resource-library", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organisationId,
        resourceId: resource.id,
        title: resource.title,
        content,
      }),
    });

    const saveData = await saveRes.json().catch(() => null);

    if (!saveRes.ok || !saveData?.success) {
      throw new Error(saveData?.error || "Failed to upgrade draft");
    }

    const updated = saveData?.resource || null;

    if (updated) {
      setResources((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setSelected(updated);
      setDraftTitle(updated.title || "");
      setDraftContent(deepClone(updated.content || {}));
    } else {
      await loadResources();
    }

    setToast("Draft upgraded ✅");
  } catch (e: any) {
    setError(e?.message || "Failed to upgrade draft");
  } finally {
    setBusyAction(null);
  }
}
 function downloadResourceAsPdf(resource: Resource) {
  const content = resource?.content || {};
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  const learningOutcomes = Array.isArray(content?.learning_outcomes)
    ? content.learning_outcomes
    : [];

  const escapeHtml = (value: unknown) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const printDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

 const title = String(resource?.title || "Programme Summary").trim();
   const logoUrl = String((resource as any)?.organisation_logo_url || "").trim();
const isPresentationLike =
  resource?.resource_type === "presentation" ||
  resource?.resource_type === "webinar_outline";

const summary = String(
  content?.summary ||
    content?.objective ||
    content?.audience_takeaway ||
    ""
).trim();

const intendedReader = String(
  content?.intended_reader ||
    bodySafeAudience(content) ||
    "Public, workplace, or practitioner audiences"
).trim();

const estimatedLearningTime = String(
  content?.estimated_learning_time ||
    content?.duration ||
    "To be agreed"
).trim();

const practitionerLevel = String(
  content?.practitioner_level ||
    "Suitable for mixed audiences where tailored"
).trim();

function bodySafeAudience(content: any) {
  return String(
    content?.audience ||
      content?.audience_takeaway ||
      ""
  ).trim();
}
 const contentCards = isPresentationLike
  ? (Array.isArray(content?.slides) ? content.slides : [])
      .slice(0, 6)
      .map((slide: any, index: number) => {
        const slideTitle = String(
          slide?.slide_title || `Slide ${index + 1}`
        ).trim();
        const slideGoal = String(slide?.slide_goal || "").trim();
        const bullets = Array.isArray(slide?.bullets) ? slide.bullets : [];

        return `
          <div class="session-card">
            <div class="session-number">Slide ${index + 1}</div>
            <div class="session-title">${escapeHtml(slideTitle)}</div>
            ${
              slideGoal
                ? `<div class="session-summary">${escapeHtml(slideGoal)}</div>`
                : ""
            }
            ${
              bullets.length
                ? `
                  <ul class="session-bullets">
                    ${bullets
                      .slice(0, 4)
                      .map((b: string) => `<li>${escapeHtml(b)}</li>`)
                      .join("")}
                  </ul>
                `
                : ""
            }
          </div>
        `;
      })
      .join("")
  : sections
      .slice(0, 4)
      .map((section: any, index: number) => {
        const sectionTitle = String(
          section?.title || `Session ${index + 1}`
        ).trim();
        const sectionSummary = String(section?.summary || "").trim();
        const bullets = Array.isArray(section?.bullets) ? section.bullets : [];

        return `
          <div class="session-card">
            <div class="session-number">Session ${index + 1}</div>
            <div class="session-title">${escapeHtml(sectionTitle)}</div>
            ${
              sectionSummary
                ? `<div class="session-summary">${escapeHtml(sectionSummary)}</div>`
                : ""
            }
            ${
              bullets.length
                ? `
                  <ul class="session-bullets">
                    ${bullets
                      .slice(0, 4)
                      .map((b: string) => `<li>${escapeHtml(b)}</li>`)
                      .join("")}
                  </ul>
                `
                : ""
            }
          </div>
        `;
      })
      .join("");

  const html = `
    <html>
      <head>
        <title>${escapeHtml(title)} - PDF Summary</title>
        <style>
          @page {
            size: A4;
            margin: 16mm;
          }

          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            line-height: 1.5;
          }

          body {
            padding: 0;
          }

          .page {
            max-width: 210mm;
            margin: 0 auto;
            background: white;
            border: 1px solid #e2e8f0;
          }

          .hero {
            padding: 24mm 18mm 14mm 18mm;
            background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 45%, #ecfeff 100%);
            border-bottom: 1px solid #dbeafe;
          }

          .eyebrow {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #2563eb;
            margin-bottom: 10px;
          }

          .hero-title {
            font-size: 28px;
            line-height: 1.2;
            font-weight: 700;
            color: #0f172a;
            margin: 0 0 10px 0;
          }

          .hero-summary {
            font-size: 15px;
            color: #334155;
            max-width: 150mm;
          }

          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-top: 18px;
          }

          .meta-card {
            border: 1px solid #dbeafe;
            background: rgba(255,255,255,0.82);
            border-radius: 12px;
            padding: 12px;
          }

          .meta-label {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 6px;
          }

          .meta-value {
            font-size: 13px;
            color: #0f172a;
          }

          .body-wrap {
            padding: 16mm 18mm 18mm 18mm;
          }

          .section-title {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin: 0 0 10px 0;
          }

          .soft-card {
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            border-radius: 14px;
            padding: 14px;
            margin-top: 12px;
          }

          .session-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-top: 12px;
          }

          .session-card {
            border: 1px solid #dbeafe;
            border-radius: 14px;
            padding: 14px;
            background: #ffffff;
            page-break-inside: avoid;
          }

          .session-number {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #2563eb;
            margin-bottom: 6px;
          }

          .session-title {
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 8px;
          }

          .session-summary {
            font-size: 13px;
            color: #334155;
            margin-bottom: 8px;
          }

          .session-bullets {
            margin: 8px 0 0 18px;
            padding: 0;
          }

          .session-bullets li {
            margin-bottom: 5px;
            font-size: 13px;
            color: #0f172a;
          }

          .cta {
            margin-top: 18px;
            border: 1px solid #bfdbfe;
            background: #eff6ff;
            border-radius: 14px;
            padding: 14px 16px;
          }

          .cta-title {
            font-size: 14px;
            font-weight: 700;
            color: #1d4ed8;
            margin-bottom: 6px;
          }

          .cta-text {
            font-size: 13px;
            color: #1e293b;
          }

          .footer {
            margin-top: 20px;
            font-size: 11px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            padding-top: 10px;
            display: flex;
            justify-content: space-between;
            gap: 10px;
          }

          @media print {
            html, body {
              background: white;
            }

            .page {
              border: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="hero">
          ${
  logoUrl
    ? `<div style="margin-bottom:12px;">
         <img src="${logoUrl}" alt="Logo" style="height:40px;object-fit:contain;" />
       </div>`
    : ""
}
            <div class="eyebrow">${isPresentationLike ? "Presentation summary" : "Programme summary"}</div>
           <h1 class="hero-title">${escapeHtml(title)}</h1>

<div style="margin-top:6px;font-size:12px;color:#475569;">
  Prepared for organisations, HR teams, and decision-makers
</div>

<div class="hero-summary">
             ${escapeHtml(
  summary ||
    (isPresentationLike
      ? "A clear, practical presentation that can be shared with decision-makers, organisers, or HR teams."
      : "A structured, practical learning programme that can be delivered in-house or online.")
)}
            </div>

            <div class="meta-grid">
              <div class="meta-card">
                <div class="meta-label">Designed for</div>
                <div class="meta-value">${escapeHtml(
                  intendedReader || "Public, workplace, or practitioner audiences"
                )}</div>
              </div>
              </div>

<div style="margin-top:18px;">
  <div class="section-title">Delivery options</div>
  <div style="font-size:13px;color:#334155;margin-top:6px;">
    • Live webinar (remote)<br/>
    • In-house workshop delivery<br/>
    • Hybrid formats available<br/>
    • Customised versions for your organisation
  </div>
</div>

              <div class="meta-card">
                <div class="meta-label">Estimated learning time</div>
                <div class="meta-value">${escapeHtml(
                  estimatedLearningTime || "To be agreed"
                )}</div>
              </div>

              <div class="meta-card">
                <div class="meta-label">Level</div>
                <div class="meta-value">${escapeHtml(
                  practitionerLevel || "Suitable for mixed audiences where tailored"
                )}</div>
              </div>

              <div class="meta-card">
                <div class="meta-label">Format</div>
                <div class="meta-value">Can be delivered in-house or online</div>
              </div>
            </div>
          </div>

          <div class="body-wrap">
            ${
              learningOutcomes.length
                ? `
              <div>
                <div class="section-title">What participants will gain</div>
                <div class="soft-card">
                  <ul style="margin:0 0 0 18px; padding:0;">
                    ${learningOutcomes
                      .slice(0, 4)
                      .map((item: string) => `<li>${escapeHtml(item)}</li>`)
                      .join("")}
                  </ul>
                </div>
              </div>
            `
                : ""
            }

           ${
  contentCards
    ? `
      <div style="margin-top:18px;">
        <div class="section-title">Business outcomes</div>
        <ul style="margin-top:8px;padding-left:18px;font-size:13px;color:#334155;">
          <li>Improved wellbeing, engagement, and productivity</li>
          <li>Practical tools participants can apply immediately</li>
          <li>Supports organisational health and retention</li>
          <li>Delivered in a clear, structured, and accessible format</li>
        </ul>
      </div>

      <div style="margin-top: 18px;">
        <div class="section-title">Programme structure</div>
        <div class="session-grid">
          ${contentCards}
        </div>              
        </div>
            `
                : ""
            }

            <div class="cta">
  <div class="cta-title">Tailored delivery available</div>
  <div class="cta-text">
    This programme can be tailored for your organisation, team, or audience. A full facilitator pack, delivery notes, and supporting session materials are available separately.
  </div>
</div>
            <div class="footer">
              <div>Prepared from Root Health Ops</div>
              <div>${escapeHtml(printDate)}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) return;

  win.document.open();
  win.document.write(html);
  win.document.close();

  setTimeout(() => {
    win.focus();
    win.print();
  }, 300);
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

  const needsLegacyUpgrade =
    !isTemplate(selected) &&
    resourceNeedsLegacyUpgrade((selected as any)?.content || null);

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
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
  You have {Math.max(limit - usage, 0)} resource creations remaining this month
</div>

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
        {error && (
  <div className="space-y-3">
    <div className="text-sm text-red-400">{error}</div>

    {error.includes("allowance") && (
      <button
        onClick={() => (window.location.href = "/pricing")}
        className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
      >
        Upgrade now
      </button>
    )}
  </div>
)}

<button
  type="button"
  onClick={() => {
    window.location.href = "/pricing";
  }}
  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
>
  View plans
</button>
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
                                        {needsLegacyUpgrade ? (
                      <button
                        type="button"
                        onClick={() => upgradeLegacyResource(selected as Resource)}
                        disabled={
                          busyAction === `upgrade:${(selected as Resource).id}`
                        }
                        className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
                      >
                        {busyAction === `upgrade:${(selected as Resource).id}`
                          ? "Upgrading…"
                          : "Upgrade old draft"}
                      </button>
                    ) : null}

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
  onClick={async () => {
    const res = await fetch("/api/export/course-pack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        course: selectedContent,
        title: (selected as any)?.title || "Course Pack",
        organisationId,
      }),
    });

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "course-pack.doc";
    a.click();
    window.URL.revokeObjectURL(url);
  }}
  className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10"
>
  Download Course Pack
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
  onClick={() => downloadResourceAsPdf(selected as Resource)}
  className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10"
>
  Download PDF
</button>
                        <button
  type="button"
  onClick={() => {
    const resource = selected as Resource;
    const content = (resource as any)?.content || {};

    const title = String(resource?.title || "Programme Summary").trim();
    const summary = String(
      content?.summary ||
        content?.objective ||
        content?.audience_takeaway ||
        "Please find attached a short summary document."
    ).trim();

    const audience = String(
      content?.intended_reader ||
        content?.audience ||
        "public, workplace, or practitioner audiences"
    ).trim();

    const subject = encodeURIComponent(`Programme summary: ${title}`);

    const body = encodeURIComponent(
      `Hello,\n\nPlease find attached a short summary for "${title}".\n\n` +
        `Overview:\n${summary}\n\n` +
        `Audience:\n${audience}\n\n` +
        `This can be tailored for your organisation, team, or audience.\n\n` +
        `I’d be happy to discuss delivery options, pricing, and next steps.\n\n` +
        `Best wishes`
    );

    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }}
  className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200 hover:bg-emerald-500/20"
>
  Send to HR draft
</button>
                        <button
  type="button"
  onClick={() => {
    const resource = selected as Resource;
    const content = (resource as any)?.content || {};

    const title = String(resource?.title || "Programme Summary").trim();
    const summary = String(
      content?.summary ||
        content?.objective ||
        content?.audience_takeaway ||
        ""
    ).trim();

    const audience = String(
      content?.intended_reader ||
        content?.audience ||
        "Public, workplace, or practitioner audiences"
    ).trim();

    const text =
      `${title}\n\n` +
      `Overview:\n${summary}\n\n` +
      `Audience:\n${audience}\n\n` +
      `This programme can be tailored for your organisation.\n\n` +
      `Contact us to discuss delivery options and next steps.`;

    navigator.clipboard.writeText(text);

    setToast("Summary copied to clipboard ✅");
  }}
  className="rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-xs text-blue-200 hover:bg-blue-500/20"
>
  Copy summary
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
                        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
  <div className="text-sm font-semibold text-slate-200">
    Proposal builder
  </div>

  <div className="mt-1 text-xs text-slate-400">
    Enter your total price and generate a proposal-ready summary.
  </div>

  <input
    value={proposalPrice}
    onChange={(e) => setProposalPrice(e.target.value)}
    className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
    placeholder="Enter total price (£)"
  />

  <div className="mt-3 flex flex-wrap gap-2">
    <button
      type="button"
      onClick={() => {
        const text = buildProposalText(selected as Resource, proposalPrice);
        setProposalText(text);
        setToast("Proposal generated ✅");
      }}
      className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
    >
      Generate proposal
    </button>

    <button
      type="button"
      onClick={() => {
        const text =
          proposalText ||
          buildProposalText(selected as Resource, proposalPrice);

        navigator.clipboard.writeText(text);
        setProposalText(text);
        setToast("Proposal copied ✅");
      }}
      className="rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-xs text-blue-200 hover:bg-blue-500/20"
    >
      Copy proposal
    </button>

    <button
      type="button"
      onClick={() => {
        const resource = selected as Resource;
        const text =
          proposalText ||
          buildProposalText(resource, proposalPrice);

        const subject = encodeURIComponent(
          `Proposal: ${String(resource?.title || "Programme")}`
        );

        const body = encodeURIComponent(text);

        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      }}
      className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200 hover:bg-emerald-500/20"
    >
      Email proposal
    </button>

    <button
      type="button"
      onClick={() =>
        downloadProposalAsPdf(
          selected as Resource,
          buildProposalText(selected as Resource, proposalPrice)
        )
      }
      className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs text-slate-100 hover:bg-white/10"
    >
      Proposal PDF
    </button>
  </div>

  {proposalText ? (
    <textarea
      value={proposalText}
      readOnly
      rows={14}
      className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
    />
  ) : null}
</div>
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
                    {!editMode && isPresentation && !isTemplate(selected) ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm font-semibold text-slate-200">
                          Improve entire presentation
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Example: make the whole thing warmer, shorten it to 20 mins, rewrite for HR leaders, make it more practical
                        </div>

                        <textarea
                          value={presentationImproveInput}
                          onChange={(e) =>
                            setPresentationImproveInput(e.target.value)
                          }
                          rows={3}
                          className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
                          placeholder="e.g. make the whole presentation warmer and more practical"
                        />

                       <div className="mt-3 flex flex-wrap gap-2">
  <button
    type="button"
    onClick={() => improvePresentation(selected as Resource)}
    disabled={
      improvingPresentation ||
      !presentationImproveInput.trim()
    }
    className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
  >
    {improvingPresentation
      ? "Improving presentation…"
      : "Improve presentation"}
  </button>
</div>
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
                    {selectedContent?.estimated_learning_time !== undefined ? (
  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
    <div className="text-sm font-semibold text-emerald-200">
      Estimated learning time
    </div>
    {editMode && !isTemplate(selected) ? (
      <textarea
        value={String(selectedContent.estimated_learning_time || "")}
        onChange={(e) =>
          setDraftField("estimated_learning_time", e.target.value)
        }
        rows={2}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
      />
    ) : (
      <div className="mt-2 text-sm text-slate-300">
        {selectedContent.estimated_learning_time}
      </div>
    )}
  </div>
) : null}
                    {selectedContent?.practitioner_level !== undefined ? (
  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
    <div className="text-sm font-semibold text-emerald-200">
      Practitioner level
    </div>
    {editMode && !isTemplate(selected) ? (
      <textarea
        value={String(selectedContent.practitioner_level || "")}
        onChange={(e) =>
          setDraftField("practitioner_level", e.target.value)
        }
        rows={2}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300"
      />
    ) : (
      <div className="mt-2 text-sm text-slate-300">
        {selectedContent.practitioner_level}
      </div>
    )}
  </div>
) : null}
                                        {Array.isArray(selectedContent?.learning_outcomes) &&
                    selectedContent.learning_outcomes.length > 0 ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="text-sm font-semibold text-emerald-200">
                          Learning outcomes
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedContent.learning_outcomes.map(
                            (item: any, idx: number) =>
                              editMode && !isTemplate(selected) ? (
                                <textarea
                                  key={`${(selected as any).id}-learning-${idx}`}
                                  value={String(item || "")}
                                  onChange={(e) =>
                                    updateStringArrayField(
                                      "learning_outcomes",
                                      idx,
                                      e.target.value
                                    )
                                  }
                                  rows={2}
                                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                />
                              ) : (
                                <div
                                  key={`${(selected as any).id}-learning-${idx}`}
                                  className="text-sm text-slate-300"
                                >
                                  • {String(item || "").trim()}
                                </div>
                              )
                          )}
                        </div>
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
<div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
      Facilitator deep teach
    </div>

    {!editMode && !isTemplate(selected) ? (
      <button
        type="button"
        onClick={() => deepTeachSection(selected as Resource, idx)}
        disabled={
          busyAction === `deep-teach:${(selected as Resource).id}:${idx}`
        }
        className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
      >
        {busyAction === `deep-teach:${(selected as Resource).id}:${idx}`
          ? "Deep teaching…"
          : "Deep Teach This Module"}
      </button>
    ) : null}
  </div>

  {editMode && !isTemplate(selected) ? (
    <textarea
      value={String(section?.facilitator_deep_teach || "")}
      onChange={(e) =>
        setDraftContent((prev: any) => {
          const next = deepClone(prev || {});
          next.sections = Array.isArray(next.sections)
            ? next.sections
            : [];
          if (!next.sections[idx]) {
            next.sections[idx] = {
              title: "",
              bullets: [],
            };
          }
          next.sections[idx].facilitator_deep_teach = e.target.value;
          return next;
        })
      }
      rows={10}
      className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
    />
  ) : (
    <div className="mt-3 text-sm text-slate-300 whitespace-pre-wrap">
      {String(section?.facilitator_deep_teach || "").trim() ||
        "No deep teach notes yet. Click 'Deep Teach This Module' to generate step-by-step facilitator notes, wording, examples, and debrief guidance."}
    </div>
  )}
</div>
                            <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-300">
      Facilitator elite deep teach
    </div>

    {!editMode && !isTemplate(selected) ? (
      <button
        type="button"
        onClick={() => eliteDeepTeachSection(selected as Resource, idx)}
        disabled={
          busyAction === `elite-deep-teach:${(selected as Resource).id}:${idx}`
        }
        className="rounded-full bg-blue-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-400 disabled:opacity-60"
      >
        {busyAction === `elite-deep-teach:${(selected as Resource).id}:${idx}`
          ? "Elite deep teaching…"
          : "Elite Deep Teach"}
      </button>
    ) : null}
  </div>

  {editMode && !isTemplate(selected) ? (
    <textarea
      value={String(section?.facilitator_elite_deep_teach || "")}
      onChange={(e) =>
        setDraftContent((prev: any) => {
          const next = deepClone(prev || {});
          next.sections = Array.isArray(next.sections)
            ? next.sections
            : [];
          if (!next.sections[idx]) {
            next.sections[idx] = {
              title: "",
              bullets: [],
            };
          }
          next.sections[idx].facilitator_elite_deep_teach = e.target.value;
          return next;
        })
      }
      rows={12}
      className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
    />
  ) : (
    <div className="mt-3 text-sm text-slate-300 whitespace-pre-wrap">
      {String(section?.facilitator_elite_deep_teach || "").trim() ||
        "No elite deep teach notes yet. Click 'Elite Deep Teach' for fuller facilitator scripting, adaptation notes, troubleshooting, short/extended delivery versions, and debrief guidance."}
    </div>
  )}
</div>
                            {section?.summary !== undefined ? (
                              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  Module summary
                                </div>
                                {editMode && !isTemplate(selected) ? (
                                  <textarea
                                    value={String(section?.summary || "")}
                                    onChange={(e) =>
                                      setDraftContent((prev: any) => {
                                        const next = deepClone(prev || {});
                                        next.sections = Array.isArray(next.sections)
                                          ? next.sections
                                          : [];
                                        if (!next.sections[idx]) {
                                          next.sections[idx] = {
                                            title: "",
                                            bullets: [],
                                          };
                                        }
                                        next.sections[idx].summary =
                                          e.target.value;
                                        return next;
                                      })
                                    }
                                    rows={4}
                                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                  />
                                ) : (
                                  <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                                    {String(section?.summary || "").trim()}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            <div className="mt-3 space-y-2">
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
                            {section?.key_concepts_explained !== undefined ? (
  <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300">
      Key concepts explained
    </div>
    {editMode && !isTemplate(selected) ? (
      <textarea
        value={String(section?.key_concepts_explained || "")}
        onChange={(e) =>
          setDraftContent((prev: any) => {
            const next = deepClone(prev || {});
            next.sections = Array.isArray(next.sections)
              ? next.sections
              : [];
            if (!next.sections[idx]) {
              next.sections[idx] = {
                title: "",
                bullets: [],
              };
            }
            next.sections[idx].key_concepts_explained = e.target.value;
            return next;
          })
        }
        rows={6}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
      />
    ) : (
      <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
        {String(section?.key_concepts_explained || "").trim()}
      </div>
    )}
  </div>
) : null}
{section?.main_points !== undefined ? (
  <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-300">
      Main points for the teacher
    </div>
    {editMode && !isTemplate(selected) ? (
      <textarea
        value={String(section?.main_points || "")}
        onChange={(e) =>
          setDraftContent((prev: any) => {
            const next = deepClone(prev || {});
            next.sections = Array.isArray(next.sections)
              ? next.sections
              : [];
            if (!next.sections[idx]) {
              next.sections[idx] = {
                title: "",
                bullets: [],
              };
            }
            next.sections[idx].main_points = e.target.value;
            return next;
          })
        }
        rows={6}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
      />
    ) : (
      <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
        {String(section?.main_points || "").trim()}
      </div>
    )}
  </div>
) : null}

{section?.facilitator_script !== undefined ? (
  <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
      Facilitator script
    </div>
    {editMode && !isTemplate(selected) ? (
      <textarea
        value={String(section?.facilitator_script || "")}
        onChange={(e) =>
          setDraftContent((prev: any) => {
            const next = deepClone(prev || {});
            next.sections = Array.isArray(next.sections)
              ? next.sections
              : [];
            if (!next.sections[idx]) {
              next.sections[idx] = {
                title: "",
                bullets: [],
              };
            }
            next.sections[idx].facilitator_script = e.target.value;
            return next;
          })
        }
        rows={6}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
      />
    ) : (
      <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
        {String(section?.facilitator_script || "").trim()}
      </div>
    )}
  </div>
) : null}
                            {section?.worked_examples !== undefined ? (
  <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">
      Worked examples
    </div>
    {editMode && !isTemplate(selected) ? (
      <textarea
        value={String(section?.worked_examples || "")}
        onChange={(e) =>
          setDraftContent((prev: any) => {
            const next = deepClone(prev || {});
            next.sections = Array.isArray(next.sections)
              ? next.sections
              : [];
            if (!next.sections[idx]) {
              next.sections[idx] = {
                title: "",
                bullets: [],
              };
            }
            next.sections[idx].worked_examples = e.target.value;
            return next;
          })
        }
        rows={6}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
      />
    ) : (
      <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
        {String(section?.worked_examples || "").trim()}
      </div>
    )}
  </div>
) : null}
                            {section?.instructor_notes !== undefined ? (
                              <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                                  Instructor notes
                                </div>
                                {editMode && !isTemplate(selected) ? (
                                  <textarea
                                    value={String(
                                      section?.instructor_notes || ""
                                    )}
                                    onChange={(e) =>
                                      setDraftContent((prev: any) => {
                                        const next = deepClone(prev || {});
                                        next.sections = Array.isArray(next.sections)
                                          ? next.sections
                                          : [];
                                        if (!next.sections[idx]) {
                                          next.sections[idx] = {
                                            title: "",
                                            bullets: [],
                                          };
                                        }
                                        next.sections[idx].instructor_notes =
                                          e.target.value;
                                        return next;
                                      })
                                    }
                                    rows={5}
                                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                  />
                                ) : (
                                  <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                                    {String(
                                      section?.instructor_notes || ""
                                    ).trim()}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {section?.delivery_steps !== undefined ? (
                              <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300">
                                  Delivery steps
                                </div>
                                {editMode && !isTemplate(selected) ? (
                                  <textarea
                                    value={String(
                                      section?.delivery_steps || ""
                                    )}
                                    onChange={(e) =>
                                      setDraftContent((prev: any) => {
                                        const next = deepClone(prev || {});
                                        next.sections = Array.isArray(next.sections)
                                          ? next.sections
                                          : [];
                                        if (!next.sections[idx]) {
                                          next.sections[idx] = {
                                            title: "",
                                            bullets: [],
                                          };
                                        }
                                        next.sections[idx].delivery_steps =
                                          e.target.value;
                                        return next;
                                      })
                                    }
                                    rows={5}
                                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                  />
                                ) : (
                                  <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                                    {String(
                                      section?.delivery_steps || ""
                                    ).trim()}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {section?.exercise !== undefined ? (
                              <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">
                                  Practical exercise
                                </div>
                                {editMode && !isTemplate(selected) ? (
                                  <textarea
                                    value={String(section?.exercise || "")}
                                    onChange={(e) =>
                                      setDraftContent((prev: any) => {
                                        const next = deepClone(prev || {});
                                        next.sections = Array.isArray(next.sections)
                                          ? next.sections
                                          : [];
                                        if (!next.sections[idx]) {
                                          next.sections[idx] = {
                                            title: "",
                                            bullets: [],
                                          };
                                        }
                                        next.sections[idx].exercise =
                                          e.target.value;
                                        return next;
                                      })
                                    }
                                    rows={4}
                                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                  />
                                ) : (
                                  <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                                    {String(section?.exercise || "").trim()}
                                  </div>
                                )}
                              </div>
                            ) : null}
                            {section?.self_assessment_activity !== undefined ? (
  <div className="mt-3 rounded-xl border border-lime-500/20 bg-lime-500/5 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-lime-300">
      Self-assessment activity
    </div>
    {editMode && !isTemplate(selected) ? (
      <textarea
        value={String(section?.self_assessment_activity || "")}
        onChange={(e) =>
          setDraftContent((prev: any) => {
            const next = deepClone(prev || {});
            next.sections = Array.isArray(next.sections)
              ? next.sections
              : [];
            if (!next.sections[idx]) {
              next.sections[idx] = {
                title: "",
                bullets: [],
              };
            }
            next.sections[idx].self_assessment_activity = e.target.value;
            return next;
          })
        }
        rows={5}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
      />
    ) : (
      <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
        {String(section?.self_assessment_activity || "").trim()}
      </div>
    )}
  </div>
) : null}
                            {section?.exercise_facilitator_guidance !== undefined ? (
  <div className="mt-3 rounded-xl border border-teal-500/20 bg-teal-500/5 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-teal-300">
      Exercise facilitator guidance
    </div>
    {editMode && !isTemplate(selected) ? (
      <textarea
        value={String(section?.exercise_facilitator_guidance || "")}
        onChange={(e) =>
          setDraftContent((prev: any) => {
            const next = deepClone(prev || {});
            next.sections = Array.isArray(next.sections)
              ? next.sections
              : [];
            if (!next.sections[idx]) {
              next.sections[idx] = {
                title: "",
                bullets: [],
              };
            }
            next.sections[idx].exercise_facilitator_guidance =
              e.target.value;
            return next;
          })
        }
        rows={5}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
      />
    ) : (
      <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
        {String(section?.exercise_facilitator_guidance || "").trim()}
      </div>
    )}
  </div>
) : null}

                           {section?.debrief_notes !== undefined ? (
  <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-300">
      Debrief notes
    </div>
    {editMode && !isTemplate(selected) ? (
      <textarea
        value={String(section?.debrief_notes || "")}
        onChange={(e) =>
          setDraftContent((prev: any) => {
            const next = deepClone(prev || {});
            next.sections = Array.isArray(next.sections)
              ? next.sections
              : [];
            if (!next.sections[idx]) {
              next.sections[idx] = {
                title: "",
                bullets: [],
              };
            }
            next.sections[idx].debrief_notes = e.target.value;
            return next;
          })
        }
        rows={5}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
      />
    ) : (
      <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
        {String(section?.debrief_notes || "").trim()}
      </div>
    )}
  </div>
) : null}
 {section?.reflection_prompt !== undefined ? (
                                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                                  Reflection prompt
                                </div>
                                {editMode && !isTemplate(selected) ? (
                                  <textarea
                                    value={String(
                                      section?.reflection_prompt || ""
                                    )}
                                    onChange={(e) =>
                                      setDraftContent((prev: any) => {
                                        const next = deepClone(prev || {});
                                        next.sections = Array.isArray(next.sections)
                                          ? next.sections
                                          : [];
                                        if (!next.sections[idx]) {
                                          next.sections[idx] = {
                                            title: "",
                                            bullets: [],
                                          };
                                        }
                                        next.sections[idx].reflection_prompt =
                                          e.target.value;
                                        return next;
                                      })
                                    }
                                    rows={3}
                                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300"
                                  />
                                                                ) : (
                                  <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                                    {String(
                                      section?.reflection_prompt || ""
                                    ).trim()}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {Array.isArray(section?.review_questions) &&
                            section.review_questions.length > 0 ? (
                              <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
                                  Review questions
                                </div>
                                <div className="mt-2 space-y-1">
                                  {section.review_questions.map(
                                    (q: string, i: number) => (
                                      <div
                                        key={i}
                                        className="text-sm text-slate-300"
                                      >
                                        • {q}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            ) : null}

                            {section?.follow_up_practice ? (
                              <div className="mt-3 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300">
                                  Follow-up practice
                                </div>
                                <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                                  {section.follow_up_practice}
                                </div>
                              </div>
                            ) : null}
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
                          const aiImageUrl = String(
                            slide?.generated_image_url || ""
                          ).trim();
                          const uploadedImageUrl = String(
                            slide?.uploaded_image_url || ""
                          ).trim();
                          const activeImageSource = String(
                            slide?.active_image_source || ""
                          ).trim() as ActiveImageSource;

                          const displayImage = getDisplayImageForSlide(slide);
                          const displayImageUrl = displayImage.url;
                          const displayImageSource = displayImage.source;

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

                          const isImprovingSlide =
                            busyAction ===
                            `improve:${(selected as Resource).id}:${idx}`;

                          const inputKey = `${(selected as Resource).id}:${idx}`;
                          const slideImproveValue = String(
                            slideImproveInputs[inputKey] || ""
                          );

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
                                  {displayImageUrl ? (
                                    <>
                                      <img
                                        src={displayImageUrl}
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
                                    {!editMode && displayImageSource ? (
                                      <div
                                        className={[
                                          "inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-wide",
                                          theme.badge,
                                        ].join(" ")}
                                      >
                                        {displayImageSource === "upload"
                                          ? "Custom artwork active"
                                          : "AI artwork active"}
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

                                {!editMode && (
                                  <div className="mt-4">
                                    <div className="text-xs text-slate-400 mb-1">
                                      AI improve this slide
                                    </div>

                                    <textarea
                                      value={slideImproveValue}
                                      onChange={(e) =>
                                        setSlideImproveInputs((prev) => ({
                                          ...prev,
                                          [inputKey]: e.target.value,
                                        }))
                                      }
                                      rows={2}
                                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                                      placeholder="e.g. make this calmer"
                                    />

                                    <button
                                      type="button"
                                      onClick={() =>
                                        improveSlide(
                                          selected as Resource,
                                          idx
                                        )
                                      }
                                      disabled={
                                        !slideImproveValue.trim() ||
                                        isImprovingSlide
                                      }
                                      className="mt-2 rounded bg-emerald-500 px-3 py-1 text-xs text-black disabled:opacity-60"
                                    >
                                      {isImprovingSlide
                                        ? "Improving…"
                                        : "Improve slide"}
                                    </button>
                                  </div>
                                )}

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
                    <option value="course">Course</option>
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

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Who is delivering this?
                  </label>
                  <select
                    value={creatorInstructorType}
                    onChange={(e) => setCreatorInstructorType(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="therapist">Therapist</option>
                    <option value="coach">Coach</option>
                    <option value="lifestyle coach">Lifestyle coach</option>
                    <option value="workplace trainer">Workplace trainer</option>
                    <option value="peer facilitator">Peer facilitator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Who is this for?
                  </label>
                  <select
                    value={creatorLearnerAudience}
                    onChange={(e) => setCreatorLearnerAudience(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="members of the public">Members of the public</option>
                    <option value="clients or sufferers">Clients or sufferers</option>
                    <option value="peer group">Peer group</option>
                    <option value="therapists or practitioners">Therapists or practitioners</option>
                    <option value="companies or workplace teams">Companies or workplace teams</option>
                    <option value="mixed audience">Mixed audience</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    How will this be used or delivered?
                  </label>
                  <select
                    value={creatorDeliveryContext}
                    onChange={(e) => setCreatorDeliveryContext(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="one-to-one">One-to-one</option>
                    <option value="group session">Group session</option>
                    <option value="workshop">Workshop</option>
                    <option value="course">Course</option>
                    <option value="cpd training">CPD training</option>
                    <option value="workplace session">Workplace session</option>
                    <option value="community session">Community session</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    This shapes the tone and examples. The actual format is chosen above in Resource type.
                  </p>
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
                      creatorType === "guide" ||
                      creatorType === "worksheet" ||
                      creatorType === "course"
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
                    "A webinar resource with objective, audience takeaway, slide-by-slide flow, presenter notes, audience prompts, and closing invitation."}
                  {creatorType === "presentation" &&
                    "A slide-by-slide presentation with objective, audience takeaway, presenter notes, audience prompts, and closing invitation."}
                  {creatorType === "guide" &&
                    "A guide with summary, intended reader, structured sections, and a closing encouragement."}
                  {creatorType === "worksheet" &&
                    "A worksheet with instructions, reflection prompts, action prompts, and a closing note."}
                 {creatorType === "course" &&
  "A structured course with summary, intended reader, estimated learning time, practitioner level, learning outcomes, detailed modules, and closing encouragement. Or use the blue button below to generate a 4-session workplace programme saved into the course system."}                </div>
              </div>

             <div className="flex flex-wrap gap-3 pt-1">
  <button
    type="button"
    onClick={createResource}
    disabled={busyAction === "create-resource" || busyAction === "create-programme"}
    className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
  >
    {busyAction === "create-resource"
      ? "Creating…"
      : "Create Resource"}
  </button>

  <button
    type="button"
    onClick={createProgramme}
    disabled={busyAction === "create-resource" || busyAction === "create-programme"}
    className="rounded-2xl bg-blue-500 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-60"
  >
    {busyAction === "create-programme"
      ? "Generating Programme…"
      : "Generate Workplace Programme"}
  </button>

  <button
    type="button"
    onClick={() => setCreatorOpen(false)}
    disabled={busyAction === "create-resource" || busyAction === "create-programme"}
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
