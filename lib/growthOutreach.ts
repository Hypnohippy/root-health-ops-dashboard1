import type { GenerationProfile } from "@/lib/tenantGeneration";

export const outreachStages = [
  "connection",
  "day3_dm",
  "day10_insight",
  "day17_followup",
  "week5_view",
  "week6_relevance",
  "week7_close",
  "parked",
] as const;

export type OutreachStage = typeof outreachStages[number];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const WEEKLY_FOLLOW_UP_STAGES = new Set([
  "day3_dm",
  "day10_insight",
  "day17_followup",
  "week5_view",
  "week6_relevance",
  "week7_close",
]);

export function growthFollowUpDueAt(target: {
  stage?: string | null;
  last_action_at?: string | null;
}) {
  if (!WEEKLY_FOLLOW_UP_STAGES.has(target.stage || "")) {
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

  // A genuine reply stops the silent relationship sequence.
  if (replyStatus && replyStatus !== "no_reply") {
    return false;
  }

  if (target.stage === "connection") {
    return true;
  }

  const dueAt = growthFollowUpDueAt(target);

  return dueAt !== null && now >= Date.parse(dueAt);
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

  if (stage === "day17_followup") {
    return "week5_view";
  }

  if (stage === "week5_view") {
    return "week6_relevance";
  }

  if (stage === "week6_relevance") {
    return "week7_close";
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

  if (target.stage === "week5_view") {
    return `Hi ${first}, I'd be interested in your take on something when you have a minute — do you think organisations are getting better at wellbeing, or just better at talking about it?`;
  }

  if (target.stage === "week6_relevance") {
    const business = profile.business.name || "Root";

    return `Hi ${first}, this is actually part of what we've been working on at ${business} — trying to make workplace wellbeing more practical without turning it into another corporate exercise. Happy to tell you more if it's ever useful.`;
  }

  if (target.stage === "week7_close") {
    return `Hi ${first}, I'll stop haunting your messages after this one 😆 If there's ever a useful reason for us to talk properly, the door's open.`;
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
