"use client";

import { tenantFetch } from "@/lib/tenantFetch";

import React, { useEffect, useMemo, useState } from "react";

type AiVariant = {
  title: string;
  text: string;
  cta: string;
  hashtags: string[];
};

type IdeaState = "active" | "used" | "archived";

type StoredStarterIdea = AiVariant & {
  state?: IdeaState;
};

type CampaignPathPhase = {
  phase: string;
  goal: string;
  why_this_works?: string;
  hook_style: string;
  hooks: string[];
  post_ideas: string[];
};

type WebinarOutlineSection = {
  title: string;
  bullets: string[];
};

type WebinarOutline = {
  title: string;
  promise: string;
  audience_takeaway: string;
  sections: WebinarOutlineSection[];
  closing_invitation: string;
};

type Sequence = {
  id: string;
  organisation_id: string;
  name: string;
  goal: string | null;
  audience: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
  generated_content?: {
    starterIdeas?: StoredStarterIdea[];
    lastGeneratedAt?: string;
    brainstormSends?: Array<{
      sentAt: string;
      variantTitle?: string | null;
    }>;
    campaignPath?: CampaignPathPhase[];
    campaignPathGeneratedAt?: string;
    webinarOutline?: WebinarOutline | null;
    webinarOutlineGeneratedAt?: string;
  } | null;
};

type GeneratingBySequence = Record<string, boolean>;
type ErrorBySequence = Record<string, string | null>;
type ArchivedOpenBySequence = Record<string, boolean>;
type PathGeneratingBySequence = Record<string, boolean>;
type PathErrorsBySequence = Record<string, string | null>;
type WebinarGeneratingBySequence = Record<string, boolean>;
type WebinarErrorsBySequence = Record<string, string | null>;
type WebinarSavingBySequence = Record<string, boolean>;
type WebinarSaveErrorsBySequence = Record<string, string | null>;

type GeneratorKind =
  | "starter_ideas"
  | "campaign_path"
  | "webinar_outline"
  | "template_webinar_funnel"
  | "template_awareness_campaign"
  | "template_lead_magnet"
  | "template_7_day_nurture"
  | "template_workshop_follow_up";

type SectionKey = "generate" | "strategy" | "assets" | "ideas";
type SectionOpenState = Record<string, Record<SectionKey, boolean>>;

type CoachSuggestion = {
  title: string;
  body: string;
  cta: string;
  action:
    | "generate_campaign_path"
    | "generate_starter_ideas"
    | "develop_brainstorm"
    | "save_webinar"
    | "open_library"
    | "generate_webinar_outline";
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

function joinVariant(v: AiVariant) {
  const hash =
    Array.isArray(v.hashtags) && v.hashtags.length > 0
      ? `\n\n${v.hashtags.join(" ")}`
      : "";
  const cta = v.cta ? `\n\n${v.cta}` : "";
  return `${(v.text || "").trim()}${cta}${hash}`.trim();
}

function normaliseIdeas(input: any): StoredStarterIdea[] {
  if (!Array.isArray(input)) return [];
  return input.map((x: any) => ({
    title: String(x?.title || "").trim(),
    text: String(x?.text || "").trim(),
    cta: String(x?.cta || "").trim(),
    hashtags: Array.isArray(x?.hashtags)
      ? x.hashtags.map((h: any) => String(h || "").trim()).filter(Boolean)
      : [],
    state:
      x?.state === "used" || x?.state === "archived" || x?.state === "active"
        ? x.state
        : "active",
  }));
}

function normaliseCampaignPath(input: any): CampaignPathPhase[] {
  if (!Array.isArray(input)) return [];
  return input.map((x: any) => ({
    phase: String(x?.phase || "").trim(),
    goal: String(x?.goal || "").trim(),
    why_this_works: String(x?.why_this_works || "").trim(),
    hook_style: String(x?.hook_style || "").trim(),
    hooks: Array.isArray(x?.hooks)
      ? x.hooks.map((h: any) => String(h || "").trim()).filter(Boolean)
      : [],
    post_ideas: Array.isArray(x?.post_ideas)
      ? x.post_ideas.map((p: any) => String(p || "").trim()).filter(Boolean)
      : [],
  }));
}

function normaliseWebinarOutline(input: any): WebinarOutline | null {
  if (!input || typeof input !== "object") return null;

  return {
    title: String(input?.title || "").trim(),
    promise: String(input?.promise || "").trim(),
    audience_takeaway: String(input?.audience_takeaway || "").trim(),
    sections: Array.isArray(input?.sections)
      ? input.sections.map((s: any) => ({
          title: String(s?.title || "").trim(),
          bullets: Array.isArray(s?.bullets)
            ? s.bullets.map((b: any) => String(b || "").trim()).filter(Boolean)
            : [],
        }))
      : [],
    closing_invitation: String(input?.closing_invitation || "").trim(),
  };
}

function getPhaseOrder(phase: string) {
  const p = String(phase || "").toLowerCase().trim();
  if (p === "awareness") return 1;
  if (p === "understanding") return 2;
  if (p === "support") return 3;
  if (p === "invitation") return 4;
  return 99;
}

function statusTone(status: string) {
  const s = String(status || "").toLowerCase().trim();
  if (s === "in_progress") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (s === "draft") {
    return "border-slate-700 bg-slate-900/60 text-slate-300";
  }
  return "border-slate-700 bg-slate-900/60 text-slate-300";
}

function makeDefaultSections(
  hasStrategy: boolean,
  hasAssets: boolean,
  hasIdeas: boolean
): Record<SectionKey, boolean> {
  return {
    generate: !hasStrategy && !hasAssets && !hasIdeas,
    strategy: hasStrategy,
    assets: hasAssets,
    ideas: hasIdeas,
  };
}

function countCompletedPhases(campaignPath: CampaignPathPhase[]) {
  const phases = campaignPath.map((p) => String(p.phase || "").trim().toLowerCase());
  const order = ["awareness", "understanding", "support", "invitation"];
  return order.filter((p) => phases.includes(p)).length;
}

function getCoachSuggestion(args: {
  campaignPath: CampaignPathPhase[];
  ideas: StoredStarterIdea[];
  webinarOutline: WebinarOutline | null;
  brainstormSends: number;
}): CoachSuggestion {
  const { campaignPath, ideas, webinarOutline, brainstormSends } = args;

  const usableIdeas = ideas.filter((i) => (i.state || "active") !== "archived");
  const usedIdeas = ideas.filter((i) => (i.state || "active") === "used");

  if (campaignPath.length === 0) {
    return {
      title: "Root Coach suggests",
      body: "Start with a campaign path so the platform can map the journey from awareness to invitation.",
      cta: "Generate Campaign Path",
      action: "generate_campaign_path",
    };
  }

  if (usableIdeas.length === 0) {
    return {
      title: "Root Coach suggests",
      body: "Now that the strategy exists, generate starter ideas so you have posts ready to develop.",
      cta: "Generate Starter Ideas",
      action: "generate_starter_ideas",
    };
  }

  if (brainstormSends === 0 && usedIdeas.length === 0) {
    return {
      title: "Root Coach suggests",
      body: "You have ideas ready. Develop one in Brainstorm to turn it into polished content for publishing.",
      cta: "Open Brainstorm",
      action: "develop_brainstorm",
    };
  }

  if (!webinarOutline) {
    return {
      title: "Root Coach suggests",
      body: "You already have campaign momentum. Generate a webinar outline to create a deeper resource from this campaign.",
      cta: "Generate Webinar Outline",
      action: "generate_webinar_outline",
    };
  }

  return {
    title: "Root Coach suggests",
    body: "Your campaign already has strategy, ideas, and a webinar asset. Save it to the library so it becomes a reusable resource.",
    cta: "Save Webinar to Library",
    action: "save_webinar",
  };
}

function buildTemplateCampaignPath(
  template: GeneratorKind,
  sequence: Sequence
): CampaignPathPhase[] {
  const name = String(sequence.name || "").trim() || "This campaign";
  const goal = String(sequence.goal || "").trim() || "build trust and momentum";
  const audience = String(sequence.audience || "").trim() || "your audience";

  if (template === "template_webinar_funnel") {
    return [
      {
        phase: "Awareness",
        goal: `Help ${audience} notice the problem this webinar solves.`,
        why_this_works:
          "People engage first when they feel seen, not sold to. Awareness content opens the emotional door.",
        hook_style: "gentle problem recognition",
        hooks: [
          `A lot of ${audience} are carrying more than anyone realises.`,
          `Sometimes the hardest part is not knowing where to start.`,
          `If ${name.toLowerCase()} feels important, this may be why.`,
        ],
        post_ideas: [
          `A short awareness post naming the hidden struggle behind ${goal}.`,
          `A myth-busting post about why people delay getting support or guidance.`,
        ],
      },
      {
        phase: "Understanding",
        goal: "Teach the audience what is happening and why it matters.",
        why_this_works:
          "Education lowers resistance. When people understand the problem, they trust the guide more.",
        hook_style: "clear educational authority",
        hooks: [
          `Here’s what most people misunderstand about this problem.`,
          `This is usually not about lack of effort.`,
          `A clearer way to understand what is really going on.`,
        ],
        post_ideas: [
          "An educational explainer post with 3 key insights.",
          "A post breaking the issue into simple, human language.",
        ],
      },
      {
        phase: "Support",
        goal: "Offer practical help and show the webinar as a safe next step.",
        why_this_works:
          "Support content proves usefulness before the invitation arrives.",
        hook_style: "practical reassurance",
        hooks: [
          `A calmer approach often works better than pushing harder.`,
          `Here are a few gentle shifts that can help.`,
          `You do not need a perfect plan to begin making progress.`,
        ],
        post_ideas: [
          "A practical steps post showing what people can try now.",
          "A reassuring post connecting common struggles to simple next steps.",
        ],
      },
      {
        phase: "Invitation",
        goal: "Invite the audience into the webinar with clarity and warmth.",
        why_this_works:
          "By this point the invitation feels earned because trust and relevance have already been built.",
        hook_style: "warm confident invitation",
        hooks: [
          `If you want help with this in a clearer way, I’m hosting something for you.`,
          `This webinar is designed to make the next step feel simpler.`,
          `Join me for a practical session built for real life, not perfection.`,
        ],
        post_ideas: [
          `A direct webinar invitation post linked to ${goal}.`,
          "A last-call invitation post with a calm reminder of the value.",
        ],
      },
    ];
  }

  if (template === "template_awareness_campaign") {
    return [
      {
        phase: "Awareness",
        goal: `Help ${audience} recognise the real issue behind ${name}.`,
        why_this_works:
          "Recognition comes before action. People need to feel understood first.",
        hook_style: "reflective recognition",
        hooks: [
          `Not every struggle looks dramatic from the outside.`,
          `A lot of people are coping more quietly than we think.`,
          `Sometimes what looks “fine” is actually someone getting through the day.`,
        ],
        post_ideas: [
          "A reflective post that names the hidden cost of the problem.",
          "A short post about why this topic deserves more open conversation.",
        ],
      },
      {
        phase: "Understanding",
        goal: "Add context, language, and clarity.",
        why_this_works:
          "When people understand the pattern, they are more open to solutions.",
        hook_style: "gentle explanation",
        hooks: [
          `Here is a simpler way to understand what is happening.`,
          `This is why the issue often gets missed.`,
          `What looks small on the surface can be bigger underneath.`,
        ],
        post_ideas: [
          "An explainer post with 3 misunderstandings and 3 truths.",
          "A post that reframes the issue in a more compassionate way.",
        ],
      },
      {
        phase: "Support",
        goal: "Offer emotionally safe next steps.",
        why_this_works:
          "Support makes the message useful, not just interesting.",
        hook_style: "kind practical support",
        hooks: [
          `A better next step is usually smaller than people expect.`,
          `Support can start with one honest shift.`,
          `You do not have to fix everything at once.`,
        ],
        post_ideas: [
          "A practical support post with small steps.",
          "A reassuring post on what progress can realistically look like.",
        ],
      },
      {
        phase: "Invitation",
        goal: `Invite the audience to learn more or take the next step toward ${goal}.`,
        why_this_works:
          "The invitation lands better after awareness, understanding, and support have been earned.",
        hook_style: "gentle call forward",
        hooks: [
          `If this resonates, there is a next step available.`,
          `If you want to explore this with more structure, here is where to begin.`,
          `When you are ready, support can look like this.`,
        ],
        post_ideas: [
          "A soft invitation post to a webinar, lead magnet, or consultation.",
          "A reminder post that turns trust into a clear next action.",
        ],
      },
    ];
  }

  if (template === "template_lead_magnet") {
    return [
      {
        phase: "Awareness",
        goal: `Help ${audience} feel the relevance of the lead magnet topic.`,
        why_this_works:
          "Lead magnets convert better when the audience sees the problem clearly first.",
        hook_style: "problem awareness",
        hooks: [
          `Most people wait too long before looking for clarity.`,
          `This issue tends to build quietly over time.`,
          `A lot of people are asking the wrong question first.`,
        ],
        post_ideas: [
          "A post naming the most common struggle that leads to the resource.",
          "A post showing why the issue keeps repeating for people.",
        ],
      },
      {
        phase: "Understanding",
        goal: "Make the topic easier to understand and more urgent.",
        why_this_works:
          "Clarity increases action because people can finally name what they are experiencing.",
        hook_style: "simple teaching",
        hooks: [
          `A clearer lens changes the next step.`,
          `This is often more common than people think.`,
          `The pattern makes more sense when you see it like this.`,
        ],
        post_ideas: [
          "A simple educational post with one strong framework.",
          "A post comparing common myths with a better truth.",
        ],
      },
      {
        phase: "Support",
        goal: "Show how the resource helps practically.",
        why_this_works:
          "Supportive framing turns the lead magnet into something useful rather than promotional.",
        hook_style: "useful practical value",
        hooks: [
          `A simple resource can take some pressure off.`,
          `Sometimes the right guide saves a lot of second-guessing.`,
          `You do not need more noise — you need something useful.`,
        ],
        post_ideas: [
          "A post explaining what the resource contains and who it helps.",
          "A post showing how the resource supports better decisions.",
        ],
      },
      {
        phase: "Invitation",
        goal: `Invite people to download the resource and move closer to ${goal}.`,
        why_this_works:
          "The invitation feels natural once need and usefulness are already established.",
        hook_style: "clear value invitation",
        hooks: [
          `If this would help, I made something for you.`,
          `Here is a practical next step you can keep.`,
          `If you want a clearer starting point, start here.`,
        ],
        post_ideas: [
          "A lead magnet invitation post with clear value.",
          "A reminder post encouraging download with less pressure.",
        ],
      },
    ];
  }

  if (template === "template_7_day_nurture") {
    return [
      {
        phase: "Awareness",
        goal: `Warm up ${audience} with emotional relevance around ${name}.`,
        why_this_works:
          "A nurture sequence works best when the early posts create familiarity and trust.",
        hook_style: "gentle emotional connection",
        hooks: [
          `You are not the only one navigating this.`,
          `A lot of people are carrying this quietly.`,
          `There is often more going on beneath the surface.`,
        ],
        post_ideas: [
          "Day 1 awareness post naming the problem.",
          "Day 2 post creating emotional recognition and trust.",
        ],
      },
      {
        phase: "Understanding",
        goal: "Build understanding over several posts.",
        why_this_works:
          "Repeated, simple education helps people feel safer and more ready to act.",
        hook_style: "teaching with warmth",
        hooks: [
          `Here is one part people often miss.`,
          `A simpler way to look at this.`,
          `This tends to make more sense when you see the pattern.`,
        ],
        post_ideas: [
          "Day 3 educational framework post.",
          "Day 4 myth versus truth post.",
        ],
      },
      {
        phase: "Support",
        goal: "Add practical support and confidence.",
        why_this_works:
          "Support content proves care and usefulness before any ask is made.",
        hook_style: "calm supportive action",
        hooks: [
          `Here is something small that can help.`,
          `Support does not have to be dramatic to matter.`,
          `Small shifts can change the whole feel of a week.`,
        ],
        post_ideas: [
          "Day 5 practical support post.",
          "Day 6 reassurance plus simple action post.",
        ],
      },
      {
        phase: "Invitation",
        goal: "Invite the audience into the main offer after trust is built.",
        why_this_works:
          "By the final stage the audience has context, trust, and momentum.",
        hook_style: "low-pressure invitation",
        hooks: [
          `If you want to take this further, here is the next step.`,
          `If this has been helpful, there is more support available.`,
          `When you are ready, here is where to go next.`,
        ],
        post_ideas: [
          "Day 7 invitation post to webinar, programme, or consultation.",
          "A follow-up invitation post with a gentle reminder.",
        ],
      },
    ];
  }

  return [
    {
      phase: "Awareness",
      goal: `Build attention around ${name} for ${audience}.`,
      why_this_works:
        "People engage first when the message reflects their real experience.",
      hook_style: "warm re-engagement",
      hooks: [
        `If you joined the workshop, this may sound familiar.`,
        `A useful conversation should not end when the session ends.`,
        `Sometimes the real progress starts after the event.`,
      ],
      post_ideas: [
        "A recap post of the workshop insight that landed best.",
        "A post naming the next question people often have after the session.",
      ],
    },
    {
      phase: "Understanding",
      goal: "Deepen clarity after the event.",
      why_this_works:
        "Follow-up content helps people retain what mattered and understand how to apply it.",
      hook_style: "post-event clarity",
      hooks: [
        `Here is the part worth revisiting.`,
        `This idea gets stronger when applied in real life.`,
        `A quick return to the key point from the workshop.`,
      ],
      post_ideas: [
        "A post revisiting the workshop's core framework.",
        "A post answering one likely follow-up question.",
      ],
    },
    {
      phase: "Support",
      goal: "Help the audience use what they learned.",
      why_this_works:
        "Support turns inspiration into practical momentum.",
      hook_style: "practical follow-up",
      hooks: [
        `Here is how to make the idea usable this week.`,
        `A simple next step matters more than a perfect plan.`,
        `Support works best when it is easy to apply.`,
      ],
      post_ideas: [
        "A practical implementation post for the days after the workshop.",
        "A post with one concrete action and one reflection question.",
      ],
    },
    {
      phase: "Invitation",
      goal: `Invite the audience toward ${goal}.`,
      why_this_works:
        "The invitation feels helpful rather than pushy because it follows clarity and support.",
      hook_style: "warm continuation",
      hooks: [
        `If you want to continue from here, there is a next step.`,
        `If this opened something useful, let’s keep going.`,
        `Here is where the conversation can continue.`,
      ],
      post_ideas: [
        "A follow-up invitation to a consultation, programme, or resource.",
        "A workshop continuation post with a clear next action.",
      ],
    },
  ];
}

export default function SequencesPage() {
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [notes, setNotes] = useState("");

  const [generatingMap, setGeneratingMap] = useState<GeneratingBySequence>({});
  const [generateErrors, setGenerateErrors] = useState<ErrorBySequence>({});
  const [archivedOpen, setArchivedOpen] = useState<ArchivedOpenBySequence>({});
  const [pathGeneratingMap, setPathGeneratingMap] = useState<PathGeneratingBySequence>({});
  const [pathErrors, setPathErrors] = useState<PathErrorsBySequence>({});
  const [webinarGeneratingMap, setWebinarGeneratingMap] = useState<WebinarGeneratingBySequence>({});
  const [webinarErrors, setWebinarErrors] = useState<WebinarErrorsBySequence>({});
  const [webinarSavingMap, setWebinarSavingMap] = useState<WebinarSavingBySequence>({});
  const [webinarSaveErrors, setWebinarSaveErrors] = useState<WebinarSaveErrorsBySequence>({});
  const [generatorChoice, setGeneratorChoice] = useState<Record<string, GeneratorKind>>({});
  const [sectionOpen, setSectionOpen] = useState<SectionOpenState>({});
  const [toast, setToast] = useState<string | null>(null);

  async function loadOrganisation() {
    try {
      const res = await tenantFetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data?.organisationId) {
        throw new Error(data?.error || "Failed to load organisation");
      }

      setOrganisationId(data.organisationId);
      return data.organisationId as string;
    } catch (e: any) {
      setErr(e?.message || "Failed to load organisation");
      return null;
    }
  }

  async function loadSequences(orgId?: string) {
    const id = orgId || organisationId;
    if (!id) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/sequences?organisationId=${id}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load campaigns");
      }

      setSequences(data.sequences || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      const org = await loadOrganisation();
      if (org) {
        loadSequences(org);
      }
    }
    init();
  }, []);

  useEffect(() => {
    setSectionOpen((prev) => {
      const next = { ...prev };

      for (const s of sequences) {
        if (next[s.id]) continue;

        const campaignPath = normaliseCampaignPath(s.generated_content?.campaignPath);
        const webinarOutline = normaliseWebinarOutline(s.generated_content?.webinarOutline);
        const ideas = normaliseIdeas(s.generated_content?.starterIdeas);

        next[s.id] = makeDefaultSections(
          campaignPath.length > 0,
          !!webinarOutline,
          ideas.length > 0
        );
      }

      return next;
    });
  }, [sequences]);

  function toggleSection(sequenceId: string, section: SectionKey) {
    setSectionOpen((prev) => ({
      ...prev,
      [sequenceId]: {
        generate: prev[sequenceId]?.generate ?? false,
        strategy: prev[sequenceId]?.strategy ?? false,
        assets: prev[sequenceId]?.assets ?? false,
        ideas: prev[sequenceId]?.ideas ?? false,
        [section]: !(prev[sequenceId]?.[section] ?? false),
      },
    }));
  }

  async function create() {
    if (!organisationId) return;

    setLoading(true);
    setErr(null);

    try {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Campaign name is required.");

      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          name: trimmed,
          goal: goal.trim() || null,
          audience: audience.trim() || null,
          notes: notes.trim() || null,
          status: "draft",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to create campaign");
      }

      setName("");
      setGoal("");
      setAudience("");
      setNotes("");

      await loadSequences();
      setToast("Campaign created ✅");
      setTimeout(() => setToast(null), 1800);
    } catch (e: any) {
      setErr(e?.message || "Failed to create campaign");
    } finally {
      setLoading(false);
    }
  }

  async function saveGeneratedContent(
    sequenceId: string,
    generatedContent: Sequence["generated_content"],
    nextStatus?: string
  ) {
    if (!organisationId) throw new Error("Organisation not loaded.");

    const res = await fetch("/api/sequences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organisationId,
        sequenceId,
        generatedContent,
        status: nextStatus,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error || "Failed to update campaign");
    }

    return data?.sequence as Sequence;
  }

  async function generateIdeasForSequence(s: Sequence) {
    const subject = [
      s.name || "",
      s.goal ? `Goal: ${s.goal}` : "",
      s.audience ? `Audience: ${s.audience}` : "",
      s.notes ? `Notes: ${s.notes}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    if (!subject.trim()) {
      setGenerateErrors((prev) => ({
        ...prev,
        [s.id]: "This campaign needs at least a name before ideas can be generated.",
      }));
      return;
    }

    setGeneratingMap((prev) => ({ ...prev, [s.id]: true }));
    setGenerateErrors((prev) => ({ ...prev, [s.id]: null }));

    try {
      const res = await tenantFetch("/api/ai/quick-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          tone: "calm",
          length: "medium",
          audience: s.audience || "clients",
          platforms: ["facebook", "linkedin", "instagram"],
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to generate starter ideas");
      }

      const variants = Array.isArray(data?.variants) ? data.variants : [];
      const storedIdeas: StoredStarterIdea[] = variants.map((v: AiVariant) => ({
        ...v,
        state: "active",
      }));

      const nextGeneratedContent = {
        ...(s.generated_content || {}),
        starterIdeas: storedIdeas,
        lastGeneratedAt: new Date().toISOString(),
      };

      await saveGeneratedContent(s.id, nextGeneratedContent, "draft");
      await loadSequences();

      setSectionOpen((prev) => ({
        ...prev,
        [s.id]: {
          ...(prev[s.id] || makeDefaultSections(false, false, false)),
          ideas: true,
        },
      }));

      setToast("Starter ideas saved ✅");
      setTimeout(() => setToast(null), 1800);
    } catch (e: any) {
      setGenerateErrors((prev) => ({
        ...prev,
        [s.id]: e?.message || "Failed to generate starter ideas",
      }));
    } finally {
      setGeneratingMap((prev) => ({ ...prev, [s.id]: false }));
    }
  }

  async function generateCampaignPath(s: Sequence) {
    setPathGeneratingMap((prev) => ({ ...prev, [s.id]: true }));
    setPathErrors((prev) => ({ ...prev, [s.id]: null }));

    try {
      const res = await tenantFetch("/api/ai/campaign-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s.name,
          goal: s.goal || "",
          audience: s.audience || "",
          notes: s.notes || "",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to generate campaign path");
      }

      const phases = normaliseCampaignPath(data?.phases).sort(
        (a, b) => getPhaseOrder(a.phase) - getPhaseOrder(b.phase)
      );

      const nextGeneratedContent = {
        ...(s.generated_content || {}),
        campaignPath: phases,
        campaignPathGeneratedAt: new Date().toISOString(),
      };

      await saveGeneratedContent(s.id, nextGeneratedContent, "draft");
      await loadSequences();

      setSectionOpen((prev) => ({
        ...prev,
        [s.id]: {
          ...(prev[s.id] || makeDefaultSections(false, false, false)),
          strategy: true,
        },
      }));

      setToast("Campaign path saved ✅");
      setTimeout(() => setToast(null), 1800);
    } catch (e: any) {
      setPathErrors((prev) => ({
        ...prev,
        [s.id]: e?.message || "Failed to generate campaign path",
      }));
    } finally {
      setPathGeneratingMap((prev) => ({ ...prev, [s.id]: false }));
    }
  }

  async function generateTemplateCampaignPath(
    s: Sequence,
    template: GeneratorKind
  ) {
    setPathGeneratingMap((prev) => ({ ...prev, [s.id]: true }));
    setPathErrors((prev) => ({ ...prev, [s.id]: null }));

    try {
      const phases = buildTemplateCampaignPath(template, s);

      const nextGeneratedContent = {
        ...(s.generated_content || {}),
        campaignPath: phases,
        campaignPathGeneratedAt: new Date().toISOString(),
      };

      await saveGeneratedContent(s.id, nextGeneratedContent, "draft");
      await loadSequences();

      setSectionOpen((prev) => ({
        ...prev,
        [s.id]: {
          ...(prev[s.id] || makeDefaultSections(false, false, false)),
          strategy: true,
        },
      }));

      setToast("Template campaign path loaded ✅");
      setTimeout(() => setToast(null), 1800);
    } catch (e: any) {
      setPathErrors((prev) => ({
        ...prev,
        [s.id]: e?.message || "Failed to apply template",
      }));
    } finally {
      setPathGeneratingMap((prev) => ({ ...prev, [s.id]: false }));
    }
  }

  async function generateWebinarOutline(s: Sequence) {
    setWebinarGeneratingMap((prev) => ({ ...prev, [s.id]: true }));
    setWebinarErrors((prev) => ({ ...prev, [s.id]: null }));

    try {
      const res = await tenantFetch("/api/ai/webinar-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s.name,
          goal: s.goal || "",
          audience: s.audience || "",
          notes: s.notes || "",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to generate webinar outline");
      }

      const outline = normaliseWebinarOutline(data?.outline);

      const nextGeneratedContent = {
        ...(s.generated_content || {}),
        webinarOutline: outline,
        webinarOutlineGeneratedAt: new Date().toISOString(),
      };

      await saveGeneratedContent(s.id, nextGeneratedContent, "draft");
      await loadSequences();

      setSectionOpen((prev) => ({
        ...prev,
        [s.id]: {
          ...(prev[s.id] || makeDefaultSections(false, false, false)),
          assets: true,
        },
      }));

      setToast("Webinar outline saved ✅");
      setTimeout(() => setToast(null), 1800);
    } catch (e: any) {
      setWebinarErrors((prev) => ({
        ...prev,
        [s.id]: e?.message || "Failed to generate webinar outline",
      }));
    } finally {
      setWebinarGeneratingMap((prev) => ({ ...prev, [s.id]: false }));
    }
  }

  async function saveWebinarToLibrary(s: Sequence) {
    const webinarOutline = normaliseWebinarOutline(s.generated_content?.webinarOutline);
    if (!organisationId || !webinarOutline) return;

    setWebinarSavingMap((prev) => ({ ...prev, [s.id]: true }));
    setWebinarSaveErrors((prev) => ({ ...prev, [s.id]: null }));

    try {
      const res = await fetch("/api/resource-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          sequenceId: s.id,
          title: webinarOutline.title || `${s.name} Webinar Outline`,
          resource_type: "webinar_outline",
          content: webinarOutline,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to save webinar to library");
      }

      setToast("Saved to Resource Library ✅");
      setTimeout(() => setToast(null), 1800);
    } catch (e: any) {
      setWebinarSaveErrors((prev) => ({
        ...prev,
        [s.id]: e?.message || "Failed to save webinar to library",
      }));
    } finally {
      setWebinarSavingMap((prev) => ({ ...prev, [s.id]: false }));
    }
  }

  async function runSelectedGenerator(s: Sequence) {
    const choice = generatorChoice[s.id] || "starter_ideas";

    if (choice === "starter_ideas") return generateIdeasForSequence(s);
    if (choice === "campaign_path") return generateCampaignPath(s);
    if (choice === "webinar_outline") return generateWebinarOutline(s);

    if (
      choice === "template_webinar_funnel" ||
      choice === "template_awareness_campaign" ||
      choice === "template_lead_magnet" ||
      choice === "template_7_day_nurture" ||
      choice === "template_workshop_follow_up"
    ) {
      return generateTemplateCampaignPath(s, choice);
    }
  }

  async function updateIdeaState(
    s: Sequence,
    ideaIndex: number,
    nextState: IdeaState
  ) {
    try {
      const existing = s.generated_content || {};
      const ideas = normaliseIdeas(existing.starterIdeas);
      if (!ideas[ideaIndex]) return;

      ideas[ideaIndex] = { ...ideas[ideaIndex], state: nextState };

      const nextGeneratedContent = {
        ...existing,
        starterIdeas: ideas,
      };

      await saveGeneratedContent(s.id, nextGeneratedContent, s.status || "draft");
      await loadSequences();

      const label =
        nextState === "used"
          ? "Idea marked as used ✅"
          : nextState === "archived"
          ? "Idea archived ✅"
          : "Idea updated ✅";

      setToast(label);
      setTimeout(() => setToast(null), 1400);
    } catch (e: any) {
      setGenerateErrors((prev) => ({
        ...prev,
        [s.id]: e?.message || "Failed to update idea",
      }));
    }
  }

  async function deleteIdea(s: Sequence, ideaIndex: number) {
    try {
      const existing = s.generated_content || {};
      const ideas = normaliseIdeas(existing.starterIdeas);
      if (!ideas[ideaIndex]) return;

      const nextIdeas = ideas.filter((_, idx) => idx !== ideaIndex);

      const nextGeneratedContent = {
        ...existing,
        starterIdeas: nextIdeas,
      };

      await saveGeneratedContent(s.id, nextGeneratedContent, s.status || "draft");
      await loadSequences();

      setToast("Idea deleted ✅");
      setTimeout(() => setToast(null), 1400);
    } catch (e: any) {
      setGenerateErrors((prev) => ({
        ...prev,
        [s.id]: e?.message || "Failed to delete idea",
      }));
    }
  }

  async function sendCampaignToBrainstorm(
    s: Sequence,
    variant?: StoredStarterIdea,
    ideaIndex?: number
  ) {
    const briefParts = [
      `Campaign: ${s.name}`,
      s.goal ? `Goal: ${s.goal}` : "",
      s.audience ? `Audience: ${s.audience}` : "",
      s.notes ? `Notes: ${s.notes}` : "",
      variant ? `Starter draft idea: ${joinVariant(variant)}` : "",
      "Please help me develop this into stronger social post ideas and polished drafts I can send to Quick Blast, Stories, or Scheduled.",
    ].filter(Boolean);

    try {
      const existing = s.generated_content || {};
      const brainstormSends = Array.isArray(existing.brainstormSends)
        ? existing.brainstormSends
        : [];
      const ideas = normaliseIdeas(existing.starterIdeas);

      if (typeof ideaIndex === "number" && ideas[ideaIndex]) {
        ideas[ideaIndex] = { ...ideas[ideaIndex], state: "used" };
      }

      const nextGeneratedContent = {
        ...existing,
        starterIdeas: ideas,
        brainstormSends: [
          {
            sentAt: new Date().toISOString(),
            variantTitle: variant?.title || null,
          },
          ...brainstormSends,
        ].slice(0, 20),
      };

      await saveGeneratedContent(s.id, nextGeneratedContent, "in_progress");
    } catch (e) {
      console.error("[sequences] failed to save brainstorm handoff", e);
    }

    const payload = {
      v: 1,
      createdAt: new Date().toISOString(),
      source: "growth_lab",
      organisationId: organisationId || s.organisation_id || null,
      experimentId: null,
      platform: "linkedin",
      title: s.name,
      hypothesis: s.goal || "",
      pattern_type: "campaign",
      format: "text",
      hook_style: "gentle authority",
      cta_style: "soft question",
      notes: s.notes || "",
      confidence: 80,
      brief: briefParts.join("\n"),
    };

    setLocalStorageMulti(GROWTH_SEED_KEYS, payload);
    window.location.href = "/dashboard/brainstorm";
  }

  function sendPhaseToBrainstorm(
    s: Sequence,
    phase: CampaignPathPhase,
    postIdea: string
  ) {
    const payload = {
      v: 1,
      createdAt: new Date().toISOString(),
      source: "growth_lab",
      organisationId: organisationId || s.organisation_id || null,
      experimentId: null,
      platform: "linkedin",
      title: `${s.name} — ${phase.phase}`,
      hypothesis: s.goal || "",
      pattern_type: phase.hook_style || "campaign_phase",
      format: "text",
      hook_style: phase.hook_style || "gentle authority",
      cta_style: "soft question",
      notes: s.notes || "",
      confidence: 85,
      brief: [
        `Campaign: ${s.name}`,
        `Phase: ${phase.phase}`,
        `Phase goal: ${phase.goal}`,
        phase.why_this_works ? `Why this works: ${phase.why_this_works}` : "",
        `Suggested hook style: ${phase.hook_style}`,
        phase.hooks?.length ? `Example hooks: ${phase.hooks.join(" | ")}` : "",
        `Develop this post idea: ${postIdea}`,
        "Please turn this into stronger hooks and polished post drafts I can send to Quick Blast, Stories, or Scheduled.",
      ]
        .filter(Boolean)
        .join("\n"),
    };

    setLocalStorageMulti(GROWTH_SEED_KEYS, payload);
    window.location.href = "/dashboard/brainstorm";
  }

  function handleCoachAction(s: Sequence, action: CoachSuggestion["action"]) {
    if (action === "generate_campaign_path") {
      return generateCampaignPath(s);
    }
    if (action === "generate_starter_ideas") {
      return generateIdeasForSequence(s);
    }
    if (action === "develop_brainstorm") {
      return sendCampaignToBrainstorm(s);
    }
    if (action === "generate_webinar_outline") {
      return generateWebinarOutline(s);
    }
    if (action === "save_webinar") {
      return saveWebinarToLibrary(s);
    }
    if (action === "open_library") {
      window.location.href = "/dashboard/resources";
    }
  }

  const progressPills = (campaignPath: CampaignPathPhase[]) => {
    const phases = campaignPath.map((p) => String(p.phase || "").trim().toLowerCase());
    const order = ["awareness", "understanding", "support", "invitation"];

    return (
      <div className="flex flex-wrap gap-2">
        {order.map((phase) => {
          const done = phases.includes(phase);
          return (
            <div
              key={phase}
              className={[
                "rounded-full border px-3 py-1 text-[10px] uppercase tracking-wide",
                done
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-700 bg-slate-900/60 text-slate-400",
              ].join(" ")}
            >
              {done ? "✓ " : ""}
              {phase}
            </div>
          );
        })}
      </div>
    );
  };

  const campaignSummary = useMemo(() => {
    return sequences.map((s) => {
      const campaignPath = normaliseCampaignPath(s.generated_content?.campaignPath).sort(
        (a, b) => getPhaseOrder(a.phase) - getPhaseOrder(b.phase)
      );
      const ideas = normaliseIdeas(s.generated_content?.starterIdeas);
      const webinar = normaliseWebinarOutline(s.generated_content?.webinarOutline);

      return {
        id: s.id,
        phaseCount: countCompletedPhases(campaignPath),
        activeIdeaCount: ideas.filter((i) => (i.state || "active") !== "archived").length,
        hasWebinar: !!webinar,
      };
    });
  }, [sequences]);

  function SectionCard(props: {
    sequenceId: string;
    section: SectionKey;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
  }) {
    const isOpen = sectionOpen[props.sequenceId]?.[props.section] ?? false;

    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
        <button
          type="button"
          onClick={() => toggleSection(props.sequenceId, props.section)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div>
            <div className="text-sm font-semibold text-slate-100">{props.title}</div>
            {props.subtitle ? (
              <div className="mt-1 text-[11px] text-slate-400">{props.subtitle}</div>
            ) : null}
          </div>

          <div className="text-slate-400 text-sm">{isOpen ? "−" : "+"}</div>
        </button>

        {isOpen ? <div className="border-t border-slate-800 p-4">{props.children}</div> : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Campaign Studio</h1>
            <p className="mt-1 text-sm text-slate-300">
              Build calm campaigns, generate guided assets, then develop them in Brainstorm.
            </p>
          </div>

          <span className="text-xs text-slate-400 border border-slate-700 bg-slate-900/80 rounded-2xl px-3 py-2">
            Org workspace
          </span>
        </header>

        {toast ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {toast}
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-4">
          <h2 className="text-base font-semibold">Create a campaign</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">Campaign name</label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "Workplace burnout awareness"'
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">Goal (optional)</label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Webinar signups"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">Audience (optional)</label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. HR leaders"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">Notes (optional)</label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal planning notes"
              />
            </div>
          </div>

          <button
            onClick={create}
            disabled={loading}
            className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? "Working…" : "Create campaign"}
          </button>

          {err && <div className="text-[11px] text-red-400">{err}</div>}
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Your campaigns</h2>
            <button onClick={() => loadSequences()} className="text-xs text-slate-300 hover:text-slate-100">
              Refresh
            </button>
          </div>

          {loading && <div className="text-sm text-slate-400">Loading…</div>}

          {!loading && sequences.length === 0 && (
            <div className="text-sm text-slate-400">
              No campaigns yet — create your first one above.
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {sequences.map((s) => {
              const allIdeas = normaliseIdeas(s.generated_content?.starterIdeas);
              const activeAndUsedIdeas = allIdeas.filter((v) => (v.state || "active") !== "archived");
              const archivedIdeas = allIdeas.filter((v) => (v.state || "active") === "archived");
              const campaignPath = normaliseCampaignPath(s.generated_content?.campaignPath).sort(
                (a, b) => getPhaseOrder(a.phase) - getPhaseOrder(b.phase)
              );
              const webinarOutline = normaliseWebinarOutline(s.generated_content?.webinarOutline);

              const generating = !!generatingMap[s.id];
              const generateError = generateErrors[s.id];
              const pathGenerating = !!pathGeneratingMap[s.id];
              const pathError = pathErrors[s.id];
              const webinarGenerating = !!webinarGeneratingMap[s.id];
              const webinarError = webinarErrors[s.id];
              const webinarSaving = !!webinarSavingMap[s.id];
              const webinarSaveError = webinarSaveErrors[s.id];
              const handoffCount = Array.isArray(s.generated_content?.brainstormSends)
                ? s.generated_content?.brainstormSends?.length || 0
                : 0;
              const currentChoice = generatorChoice[s.id] || "starter_ideas";

              const summary = campaignSummary.find((x) => x.id === s.id);
              const coach = getCoachSuggestion({
                campaignPath,
                ideas: allIdeas,
                webinarOutline,
                brainstormSends: handoffCount,
              });

              return (
                <div key={s.id} className="rounded-3xl border border-slate-700 bg-slate-950/60 p-5 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold text-slate-100 break-words">
                          {s.name}
                        </div>

                        {(s.goal || s.audience) && (
                          <div className="mt-2 text-[11px] text-slate-300 space-y-1">
                            {s.goal && <div>Goal: {s.goal}</div>}
                            {s.audience && <div>Audience: {s.audience}</div>}
                          </div>
                        )}

                        {s.notes ? (
                          <div className="mt-2 text-[11px] text-slate-400">{s.notes}</div>
                        ) : null}
                      </div>

                      <span
                        className={[
                          "shrink-0 rounded-full border px-3 py-1 text-[10px] uppercase tracking-wide",
                          statusTone(s.status),
                        ].join(" ")}
                      >
                        {s.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Phases</div>
                        <div className="mt-1 text-lg font-semibold text-slate-100">
                          {summary?.phaseCount ?? 0}/4
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Ideas</div>
                        <div className="mt-1 text-lg font-semibold text-slate-100">
                          {summary?.activeIdeaCount ?? 0}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Assets</div>
                        <div className="mt-1 text-lg font-semibold text-slate-100">
                          {summary?.hasWebinar ? "1" : "0"}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                        {coach.title}
                      </div>
                      <div className="mt-2 text-sm text-slate-200">{coach.body}</div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleCoachAction(s, coach.action)}
                          disabled={generating || pathGenerating || webinarGenerating || webinarSaving}
                          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                        >
                          {coach.cta}
                        </button>
                      </div>
                    </div>

                    {campaignPath.length > 0 ? (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                        <div className="text-[11px] font-semibold text-slate-300 mb-2">
                          Campaign progress
                        </div>
                        {progressPills(campaignPath)}
                      </div>
                    ) : null}

                    {(s.generated_content?.lastGeneratedAt ||
                      s.generated_content?.campaignPathGeneratedAt ||
                      s.generated_content?.webinarOutlineGeneratedAt ||
                      handoffCount > 0) && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3 text-[11px] text-slate-300 space-y-1">
                        {s.generated_content?.lastGeneratedAt && (
                          <div>Starter ideas: {new Date(s.generated_content.lastGeneratedAt).toLocaleString()}</div>
                        )}
                        {s.generated_content?.campaignPathGeneratedAt && (
                          <div>Campaign path: {new Date(s.generated_content.campaignPathGeneratedAt).toLocaleString()}</div>
                        )}
                        {s.generated_content?.webinarOutlineGeneratedAt && (
                          <div>Webinar outline: {new Date(s.generated_content.webinarOutlineGeneratedAt).toLocaleString()}</div>
                        )}
                        {handoffCount > 0 && <div>Sent to Brainstorm: {handoffCount} time(s)</div>}
                        <div>Created: {new Date(s.created_at).toLocaleString()}</div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => sendCampaignToBrainstorm(s)}
                        className="rounded-full border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 hover:bg-white/10"
                      >
                        Develop in Brainstorm
                      </button>
                    </div>

                    {generateError ? <div className="text-[11px] text-red-400">{generateError}</div> : null}
                    {pathError ? <div className="text-[11px] text-red-400">{pathError}</div> : null}
                    {webinarError ? <div className="text-[11px] text-red-400">{webinarError}</div> : null}
                    {webinarSaveError ? <div className="text-[11px] text-red-400">{webinarSaveError}</div> : null}
                  </div>

                  <SectionCard
                    sequenceId={s.id}
                    section="generate"
                    title="Generate"
                    subtitle="Pick what to create next"
                  >
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <select
                          value={currentChoice}
                          onChange={(e) =>
                            setGeneratorChoice((prev) => ({
                              ...prev,
                              [s.id]: e.target.value as GeneratorKind,
                            }))
                          }
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        >
                          <option value="starter_ideas">AI: Starter ideas</option>
                          <option value="campaign_path">AI: Campaign path</option>
                          <option value="webinar_outline">AI: Webinar / presentation outline</option>
                          <option value="template_webinar_funnel">Template: Webinar Funnel</option>
                          <option value="template_awareness_campaign">Template: Awareness Campaign</option>
                          <option value="template_lead_magnet">Template: Lead Magnet Campaign</option>
                          <option value="template_7_day_nurture">Template: 7-Day Nurture Sequence</option>
                          <option value="template_workshop_follow_up">Template: Workshop Follow-up</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => runSelectedGenerator(s)}
                          disabled={generating || pathGenerating || webinarGenerating}
                          className="rounded-full bg-violet-500 px-4 py-2 text-xs font-semibold text-slate-50 hover:bg-violet-400 disabled:opacity-60"
                        >
                          {generating || pathGenerating || webinarGenerating ? "Generating…" : "Generate"}
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-500">
                        Templates give non-marketers a safe starting point. AI options stay available when they want something custom.
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    sequenceId={s.id}
                    section="strategy"
                    title="Strategy"
                    subtitle={
                      campaignPath.length > 0
                        ? `${campaignPath.length} campaign phase${campaignPath.length === 1 ? "" : "s"} ready`
                        : "Campaign path, hooks, and phase-by-phase ideas"
                    }
                  >
                    {campaignPath.length === 0 ? (
                      <div className="text-sm text-slate-400">
                        No strategy generated yet. Use Generate above to create an AI path or apply a template.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {campaignPath.map((phase, phaseIdx) => (
                          <div
                            key={`${s.id}-phase-${phaseIdx}`}
                            className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-3"
                          >
                            <div>
                              <div className="text-sm font-semibold text-slate-100">{phase.phase}</div>
                              <div className="mt-1 text-[12px] text-slate-300">{phase.goal}</div>
                            </div>

                            {phase.why_this_works ? (
                              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[12px] text-slate-200">
                                <div className="font-semibold text-emerald-200">Why this works</div>
                                <div className="mt-1 text-slate-300">{phase.why_this_works}</div>
                              </div>
                            ) : null}

                            {phase.hook_style ? (
                              <div className="text-[12px] text-slate-300">
                                <span className="text-slate-400">Suggested hook style:</span>{" "}
                                <span className="font-semibold text-violet-200">{phase.hook_style}</span>
                              </div>
                            ) : null}

                            {phase.hooks.length > 0 ? (
                              <div>
                                <div className="text-[11px] font-semibold text-slate-300">Example hooks</div>
                                <div className="mt-2 space-y-1">
                                  {phase.hooks.map((hook, hookIdx) => (
                                    <div
                                      key={`${s.id}-phase-${phaseIdx}-hook-${hookIdx}`}
                                      className="text-[12px] text-slate-300"
                                    >
                                      • {hook}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {phase.post_ideas.length > 0 ? (
                              <div>
                                <div className="text-[11px] font-semibold text-slate-300">Suggested post ideas</div>
                                <div className="mt-2 space-y-2">
                                  {phase.post_ideas.map((postIdea, postIdx) => (
                                    <div
                                      key={`${s.id}-phase-${phaseIdx}-post-${postIdx}`}
                                      className="rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                                    >
                                      <div className="text-[12px] text-slate-300">{postIdea}</div>
                                      <div className="mt-2">
                                        <button
                                          type="button"
                                          onClick={() => sendPhaseToBrainstorm(s, phase, postIdea)}
                                          className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                                        >
                                          Develop in Brainstorm
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard
                    sequenceId={s.id}
                    section="assets"
                    title="Assets"
                    subtitle={
                      webinarOutline
                        ? "Webinar / presentation outline ready"
                        : "Long-form resources like webinar outlines"
                    }
                  >
                    {!webinarOutline ? (
                      <div className="text-sm text-slate-400">
                        No assets generated yet. Use Generate → AI: Webinar / presentation outline.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-amber-200">
                            Webinar / Presentation Outline
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => saveWebinarToLibrary(s)}
                              disabled={webinarSaving}
                              className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
                            >
                              {webinarSaving ? "Saving…" : "Save to Library"}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                window.location.href = "/dashboard/resources";
                              }}
                              className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                            >
                              Open Library
                            </button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-100">
                              {webinarOutline.title}
                            </div>
                            {webinarOutline.promise ? (
                              <div className="mt-1 text-[12px] text-slate-300">
                                {webinarOutline.promise}
                              </div>
                            ) : null}
                          </div>

                          {webinarOutline.audience_takeaway ? (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[12px] text-slate-200">
                              <div className="font-semibold text-emerald-200">Audience takeaway</div>
                              <div className="mt-1 text-slate-300">
                                {webinarOutline.audience_takeaway}
                              </div>
                            </div>
                          ) : null}

                          {webinarOutline.sections.length > 0 ? (
                            <div className="space-y-3">
                              {webinarOutline.sections.map((section, idx) => (
                                <div
                                  key={`${s.id}-webinar-section-${idx}`}
                                  className="rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                                >
                                  <div className="text-[12px] font-semibold text-slate-200">
                                    {idx + 1}. {section.title}
                                  </div>
                                  <div className="mt-2 space-y-1">
                                    {section.bullets.map((bullet, bulletIdx) => (
                                      <div
                                        key={`${s.id}-webinar-section-${idx}-bullet-${bulletIdx}`}
                                        className="text-[12px] text-slate-300"
                                      >
                                        • {bullet}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {webinarOutline.closing_invitation ? (
                            <div className="text-[12px] text-slate-300">
                              <span className="text-slate-400">Closing invitation:</span>{" "}
                              {webinarOutline.closing_invitation}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard
                    sequenceId={s.id}
                    section="ideas"
                    title="Ideas"
                    subtitle={
                      activeAndUsedIdeas.length > 0
                        ? `${activeAndUsedIdeas.length} starter idea${activeAndUsedIdeas.length === 1 ? "" : "s"}`
                        : "Generated starter ideas"
                    }
                  >
                    {activeAndUsedIdeas.length === 0 ? (
                      <div className="text-sm text-slate-400">
                        No ideas generated yet. Use Generate → AI: Starter ideas.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {allIdeas.map((v, idx) => {
                          const state = v.state || "active";
                          if (state === "archived") return null;

                          return (
                            <div
                              key={`${s.id}-${idx}`}
                              className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-semibold text-slate-100">
                                  {v.title || `Idea ${idx + 1}`}
                                </div>

                                <span
                                  className={[
                                    "text-[10px] uppercase tracking-wide px-2 py-1 rounded-full border",
                                    state === "used"
                                      ? "border-emerald-500/40 text-emerald-200 bg-emerald-500/10"
                                      : "border-slate-700 text-slate-300 bg-slate-900/60",
                                  ].join(" ")}
                                >
                                  {state}
                                </span>
                              </div>

                              <div className="text-[12px] text-slate-300 whitespace-pre-wrap">
                                {joinVariant(v)}
                              </div>

                              <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => sendCampaignToBrainstorm(s, v, idx)}
                                  className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                                >
                                  Develop this in Brainstorm
                                </button>

                                {state !== "used" && (
                                  <button
                                    type="button"
                                    onClick={() => updateIdeaState(s, idx, "used")}
                                    className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                                  >
                                    Mark as used
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => updateIdeaState(s, idx, "archived")}
                                  className="rounded-full border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                                >
                                  Archive
                                </button>

                                <button
                                  type="button"
                                  onClick={() => deleteIdea(s, idx)}
                                  className="rounded-full border border-red-500/40 bg-red-950/20 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/35"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {archivedIdeas.length > 0 && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                setArchivedOpen((prev) => ({
                                  ...prev,
                                  [s.id]: !prev[s.id],
                                }))
                              }
                              className="text-xs text-slate-300 hover:text-slate-100"
                            >
                              {archivedOpen[s.id]
                                ? `Hide archived ideas (${archivedIdeas.length})`
                                : `Show archived ideas (${archivedIdeas.length})`}
                            </button>

                            {archivedOpen[s.id] && (
                              <div className="mt-3 space-y-3">
                                {allIdeas.map((v, idx) => {
                                  const state = v.state || "active";
                                  if (state !== "archived") return null;

                                  return (
                                    <div
                                      key={`${s.id}-archived-${idx}`}
                                      className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-semibold text-slate-200">
                                          {v.title || `Idea ${idx + 1}`}
                                        </div>

                                        <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full border border-slate-700 text-slate-300 bg-slate-900/60">
                                          archived
                                        </span>
                                      </div>

                                      <div className="text-[12px] text-slate-400 whitespace-pre-wrap">
                                        {joinVariant(v)}
                                      </div>

                                      <div className="flex flex-wrap gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={() => updateIdeaState(s, idx, "active")}
                                          className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                                        >
                                          Restore
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => deleteIdea(s, idx)}
                                          className="rounded-full border border-red-500/40 bg-red-950/20 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/35"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </SectionCard>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
