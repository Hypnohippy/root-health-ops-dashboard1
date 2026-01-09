// app/api/coach/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // ensures server execution

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const ROOT_COACH_SYSTEM_PROMPT = `
You are Root Coach inside the Root Health Ops Dashboard.

Your job is to reduce user stress, maintain momentum, and help them succeed with posting.
Speak in plain English. Be calm, supportive, and decisive.

CRITICAL ENTERPRISE RULES:
- Do NOT mention or imply any third-party tools, vendors, or infrastructure.
- Never say words like: Ayrshare, Make, Zapier, webhook, API, API key, token, OAuth, rate limit, dashboard, environment variable.
- Do NOT ask the user to check logs, settings, integrations, keys, or external accounts.
- Do NOT give technical troubleshooting steps.
- Do NOT “hand back” the problem.

You are an operator, not an explainer:
- Prefer the next best action the user can do right now in the app.
- If the app offers self-heal actions, suggest one of these:
  1) Retry failed channels only
  2) Send without Instagram for now
  3) Retry Instagram with a better image
  4) Save a follow-up and continue
  5) Refresh connections / Sync connection record (only if the UI offers it)

Always follow this structure:
1) Reassure (1 sentence)
2) What happened (simple human terms)
3) What I recommend (one clear action)
4) Optional choice (max 2 options)

Never use long lists. Avoid numbers unless essential.

Special handling: Instagram image issues
If the error suggests Instagram rejected the image format/shape, say:
- "This image is just outside Instagram’s preferred shape."
- Suggest: square (1:1) or portrait (4:5).
- Encourage: swap the image and retry Instagram.
Do NOT mention aspect ratios, codes, or documentation links.

Output ONLY the message to show the user. No metadata.
`.trim();

/**
 * Lightweight safety filter: prevents accidental vendor leaks.
 * If the model outputs forbidden words, we replace with neutral phrasing.
 */
function sanitizeCoachText(text: string) {
  const forbidden = [
    "ayrshare",
    "make.com",
    "make",
    "zapier",
    "webhook",
    "api key",
    "apikey",
    "token",
    "oauth",
    "rate limit",
    "dashboard",
    "environment variable",
    "env var",
    "logs",
    "integration",
  ];

  let out = text || "";
  for (const w of forbidden) {
    const re = new RegExp(w, "gi");
    out = out.replace(re, "your setup");
  }

  // Keep it short and clean
  return out.trim();
}

/**
 * Optional: add a simple deterministic fallback for common known errors.
 * This ensures a perfect enterprise message even if the model misfires.
 */
function deterministicFallback(input: {
  platform?: string;
  errorMessage?: string;
}) {
  const platform = (input.platform || "").toLowerCase();
  const msg = (input.errorMessage || "").toLowerCase();

  // Instagram image shape / aspect ratio-ish errors
  if (
    platform.includes("instagram") &&
    (msg.includes("aspect ratio") ||
      msg.includes("image") ||
      msg.includes("ratio") ||
      msg.includes("preferred shape") ||
      msg.includes("must be between"))
  ) {
    return (
      "You’re doing great — nothing is broken.\n\n" +
      "This image is just outside Instagram’s preferred shape.\n\n" +
      "Swap it for a square (1:1) or portrait (4:5) image, then hit **Retry Instagram**. If you want momentum now, send to the other channels and we’ll post to Instagram next."
    );
  }

  // Platform not selected
  if (msg.includes("choose at least one platform") || msg.includes("at least one platform")) {
    return (
      "No worries — this one is quick.\n\n" +
      "It looks like no channel was actually selected for that send.\n\n" +
      "Pick one or more channels and try again — if you’re unsure, start with Facebook and LinkedIn."
    );
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const {
      mode = "unknown",
      stepId = "none",
      orgName = "",
      platform = "",
      errorMessage = "",
      recentStats = {},
      // Optional fields if you decide to send them later (won't break anything now):
      outcome = "",
      failedPlatforms = [],
      successPlatforms = [],
    } = body;

    // If we can handle perfectly with deterministic fallback, do it.
    const fallback = deterministicFallback({ platform, errorMessage });
    if (fallback) {
      return NextResponse.json({ message: fallback }, { status: 200 });
    }

    const userContext = `
Context:
- Situation: ${mode}
- Step: ${stepId}
- Organisation: ${orgName || "your workspace"}
- Platform: ${platform || "the selected channel(s)"}
- Outcome: ${outcome || "unknown"}
- Success channels: ${Array.isArray(successPlatforms) ? successPlatforms.join(", ") : ""}
- Failed channels: ${Array.isArray(failedPlatforms) ? failedPlatforms.join(", ") : ""}
- What happened (raw): ${errorMessage || "No error message provided"}
- Recent signals: ${safeJsonForPrompt(recentStats)}

Remember: speak to the user in plain English and recommend an in-app next action.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ROOT_COACH_SYSTEM_PROMPT },
        { role: "user", content: userContext },
      ],
      max_tokens: 220,
      temperature: 0.4, // lower = more consistent + less rambling
    });

    const raw =
      completion.choices?.[0]?.message?.content ??
      "You’re doing fine — we’ll get this out smoothly. Try the simplest option: send to the channels that are ready, then we can retry the remaining one.";

    const message = sanitizeCoachText(raw);

    // Final safety net: if sanitizing accidentally nuked the message, provide a calm default.
    const finalMessage =
      message.length > 10
        ? message
        : "You’re doing great — let’s keep it simple. Try **Retry failed only**, or send to the channels that are ready and we’ll post the remaining one next.";

    return NextResponse.json({ message: finalMessage }, { status: 200 });
  } catch (err) {
    console.error("[coach] API error", err);
    return NextResponse.json(
      {
        message:
          "You’re doing fine — this looks like a temporary hiccup.\n\nTry **Retry failed only** once. If it still doesn’t go through, send to the channels that are ready and we’ll come back to the remaining one next.",
      },
      { status: 200 }
    );
  }
}

function safeJsonForPrompt(v: any) {
  try {
    const s = JSON.stringify(v);
    // keep prompts small
    if (s.length > 800) return s.slice(0, 800) + "…";
    return s;
  } catch {
    return String(v);
  }
}
