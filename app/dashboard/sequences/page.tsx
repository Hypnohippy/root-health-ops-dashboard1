"use client";

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
type GeneratorKind = "starter_ideas" | "campaign_path" | "webinar_outline";

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
  const [generatorChoice, setGeneratorChoice] = useState<Record<string, GeneratorKind>>({});
  const [toast, setToast] = useState<string | null>(null);

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
      const res = await fetch("/api/ai/quick-blast", {
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
      const res = await fetch("/api/ai/campaign-path", {
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

  async function generateWebinarOutline(s: Sequence) {
    setWebinarGeneratingMap((prev) => ({ ...prev, [s.id]: true }));
    setWebinarErrors((prev) => ({ ...prev, [s.id]: null }));

    try {
      const res = await fetch("/api/ai/webinar-outline", {
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

  async function runSelectedGenerator(s: Sequence) {
    const choice = generatorChoice[s.id] || "starter_ideas";

    if (choice === "starter_ideas") return generateIdeasForSequence(s);
    if (choice === "campaign_path") return generateCampaignPath(s);
    if (choice === "webinar_outline") return generateWebinarOutline(s);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Campaign Studio</h1>
            <p className="mt-1 text-sm text-slate-300">
              Create a campaign shell, generate guided assets, then develop them in Brainstorm.
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

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
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

          <div className="grid md:grid-cols-2 gap-3">
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
              const handoffCount = Array.isArray(s.generated_content?.brainstormSends)
                ? s.generated_content?.brainstormSends?.length || 0
                : 0;
              const currentChoice = generatorChoice[s.id] || "starter_ideas";

              return (
                <div key={s.id} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{s.name}</div>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                      {s.status}
                    </span>
                  </div>

                  {(s.goal || s.audience) && (
                    <div className="text-[11px] text-slate-300 space-y-1">
                      {s.goal && <div>Goal: {s.goal}</div>}
                      {s.audience && <div>Audience: {s.audience}</div>}
                    </div>
                  )}

                  {s.notes && <div className="text-[11px] text-slate-400">{s.notes}</div>}

                  {/* Progress */}
                  {campaignPath.length > 0 ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-300">Campaign progress</div>
                      {progressPills(campaignPath)}
                    </div>
                  ) : null}

                  {/* Generator selector */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-3">
                    <div className="text-[11px] font-semibold text-slate-300">Generator</div>

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
                        <option value="starter_ideas">Starter ideas</option>
                        <option value="campaign_path">Campaign path</option>
                        <option value="webinar_outline">Webinar / presentation outline</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => runSelectedGenerator(s)}
                        disabled={generating || pathGenerating || webinarGenerating}
                        className="rounded-full bg-violet-500 px-4 py-2 text-xs font-semibold text-slate-50 hover:bg-violet-400 disabled:opacity-60"
                      >
                        {generating || pathGenerating || webinarGenerating
                          ? "Generating…"
                          : "Generate"}
                      </button>
                    </div>

                    <div className="text-[11px] text-slate-500">
                      Next up later: email ideas, Pinterest ideas, course outline.
                    </div>
                  </div>

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

                  {(s.generated_content?.lastGeneratedAt ||
                    s.generated_content?.campaignPathGeneratedAt ||
                    s.generated_content?.webinarOutlineGeneratedAt ||
                    handoffCount > 0) && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-300 space-y-1">
                      {s.generated_content?.lastGeneratedAt && (
                        <div>Starter ideas: {new Date(s.generated_content.lastGeneratedAt).toLocaleString()}</div>
                      )}
                      {s.generated_content?.campaignPathGeneratedAt && (
                        <div>Campaign path: {new Date(s.generated_content.campaignPathGeneratedAt).toLocaleString()}</div>
                      )}
                      {s.generated_content?.webinarOutlineGeneratedAt && (
                        <div>
                          Webinar outline: {new Date(s.generated_content.webinarOutlineGeneratedAt).toLocaleString()}
                        </div>
                      )}
                      {handoffCount > 0 && <div>Sent to Brainstorm: {handoffCount} time(s)</div>}
                    </div>
                  )}

                  {/* Campaign path */}
                  {campaignPath.length > 0 ? (
                    <div className="space-y-3 rounded-2xl border border-violet-900/40 bg-violet-950/10 p-3">
                      <div className="text-xs font-semibold text-violet-200">Root Coach Campaign Path</div>

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
                  ) : null}

                  {/* Webinar outline */}
                  {webinarOutline ? (
                    <div className="space-y-3 rounded-2xl border border-amber-900/40 bg-amber-950/10 p-3">
                      <div className="text-xs font-semibold text-amber-200">
                        Webinar / Presentation Outline
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
                  ) : null}

                  {/* Starter ideas */}
                  {activeAndUsedIdeas.length > 0 ? (
                    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
                      <div className="text-xs font-semibold text-slate-200">Starter ideas</div>

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
                  ) : null}

                  <div className="text-[10px] text-slate-500">
                    Created: {new Date(s.created_at).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
