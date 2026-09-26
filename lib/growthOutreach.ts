import type { GenerationProfile } from "@/lib/tenantGeneration";

export const outreachStages = [
  "connection",
  "day3_dm",
  "day10_insight",
  "day17_followup",
  "parked",
] as const;

export type OutreachStage = typeof outreachStages[number];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function growthFollowUpDueAt(target: {
  stage?: string | null;
  last_action_at?: string | null;
}) {
  if (
    !["day3_dm", "day10_insight", "day17_followup"].includes(
      target.stage || ""
    )
  ) {
    return null;
  }

  const last = Date.parse(target.last_action_at || "");

  if (!Number.isFinite(last)) {
    return null;
  }

  return new Date(last + WEEK_MS).toISOString();
}

export function isGrowthTargetDue(
  target: {
    stage?: string | null;
    last_action_at?: string | null;
    reply_status?: string | null;
  },
  now = Date.now()
) {
  const replyStatus = String(target.reply_status || "")
    .trim()
    .toLowerCase();

  // Once somebody has genuinely responded, the silent-contact
  // sequence must stop. The conversation now needs its own next step.
  if (
    replyStatus &&
    replyStatus !== "no_reply"
  ) {
    return false;
  }

  // A brand-new contact is available for its first reviewed touch.
  if (target.stage === "connection") {
    return true;
  }

  const dueAt = growthFollowUpDueAt(target);

  return (
    dueAt !== null &&
    now >= Date.parse(dueAt)
  );
}

export function nextGrowthStage(
  stage: string
): OutreachStage {
  if (stage === "connection") {
    return "day3_dm";
  }

  if (stage === "day3_dm") {
    return "day10_insight";
  }

  if (stage === "day10_insight") {
    return "day17_followup";
  }

  return "parked";
}

export function contextualOutreachDraft(
  target: {
    target_name: string;
    company?: string | null;
    role_title?: string | null;
    stage?: string | null;
  },
  profile: GenerationProfile
) {
  const first =
    target.target_name.trim().split(/\s+/)[0] ||
    target.target_name;

  if (target.stage === "connection") {
    return `Hi ${first}, I spend most of my time around workplace wellbeing, stress and recovery, so it felt right to say hello. No brochure today 😆 just saying hello properly.`;
  }

  if (target.stage === "day3_dm") {
    return `Hi ${first}, keeping my promise — still no brochure 😆 Hope you've had a decent week.`;
  }

  if (target.stage === "day10_insight") {
    return `Hi ${first}, thought I'd say hello again before LinkedIn turns us into two people who connected and never actually spoke 😆`;
  }

  if (target.stage === "day17_followup") {
    return `Hi ${first}, one thing I've been thinking about lately is how often workplace wellbeing gets treated separately from how work is actually designed. I suspect that's where some of the real answers are found.`;
  }

  return "";
}

export function canonicalLinkedInProfile(
  value: string
) {
  try {
    const url = new URL(value);

    return `${url.hostname
      .toLowerCase()
      .replace(/^www\./, "")}${url.pathname
      .replace(/\/$/, "")
      .toLowerCase()}`;
  } catch {
    return value
      .trim()
      .toLowerCase()
      .split(/[?#]/)[0]
      .replace(/\/$/, "");
  }
}
