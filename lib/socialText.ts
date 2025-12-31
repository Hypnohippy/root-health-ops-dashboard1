// lib/socialText.ts

export type VariationContext = {
  platform?: string; // "facebook" | "linkedin" | ...
  seriesPart?: number; // 1..N
  seriesTotal?: number; // N
  scheduledAtIso?: string; // optional
};

const MICRO_LINES = [
  "If this resonates, save it for later.",
  "If you’ve ever felt this, you’re not alone.",
  "Small steps. Real momentum.",
  "This is more common than people admit.",
  "Gentle reminder: you don’t have to do it all today.",
  "If you want Part 2, comment “next”.",
  "If you want more like this, follow along.",
  "If this helped, share it with someone who needs it.",
  "What would you add from your experience?",
  "Which part hit you most — A, B or C?",
];

const CTA_ROTATIONS = [
  "Comment “NEXT” and I’ll post the next part.",
  "Comment “MORE” and I’ll share the follow-up.",
  "If you want the next part, drop a ✅ below.",
  "Want the next one? Comment “PART 2”.",
  "If this landed, hit like so I know to continue.",
];

const EMOJI_ROTATIONS = ["✅", "🌿", "🧠", "💬", "✨", "🫶", "📌", "🔎", "🧩", "🌱"];

function pickDeterministic<T>(arr: T[], seed: number): T {
  const idx = Math.abs(seed) % arr.length;
  return arr[idx];
}

function seedFrom(context: VariationContext): number {
  // deterministic but not “trackable” to users
  const base =
    `${context.platform || ""}|${context.seriesPart || ""}|${context.seriesTotal || ""}|${context.scheduledAtIso || ""}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) | 0;
  return h;
}

export function applyAntiDuplicateVariation(
  message: string,
  context: VariationContext,
  opts?: {
    enabled?: boolean;
    includePartTag?: boolean; // adds "Part 1/3" style line
    includeMicroLine?: boolean;
    includeCtaRotation?: boolean;
  }
): string {
  const enabled = opts?.enabled !== false;
  if (!enabled) return message;

  const trimmed = (message || "").trim();
  if (!trimmed) return message;

  const seed = seedFrom(context);

  const emoji = pickDeterministic(EMOJI_ROTATIONS, seed);
  const micro = pickDeterministic(MICRO_LINES, seed + 7);
  const cta = pickDeterministic(CTA_ROTATIONS, seed + 13);

  const blocks: string[] = [trimmed];

  // Optional part tag (helps series posts feel intentional + unique)
  if (opts?.includePartTag !== false && context.seriesPart && context.seriesTotal) {
    blocks.push(`Part ${context.seriesPart}/${context.seriesTotal} ${emoji}`);
  } else if (opts?.includePartTag !== false) {
    // If not series, still add tiny variation without screaming “system”
    blocks.push(`${emoji}`);
  }

  // Optional micro line
  if (opts?.includeMicroLine !== false) blocks.push(micro);

  // Optional CTA rotation (only add if message doesn’t already end with a CTA-ish line)
  if (opts?.includeCtaRotation !== false) {
    const lower = trimmed.toLowerCase();
    const alreadyHasCTA =
      lower.includes("comment") || lower.includes("dm") || lower.includes("follow") || lower.includes("share");
    if (!alreadyHasCTA) blocks.push(cta);
  }

  return blocks.join("\n\n").trim();
}
