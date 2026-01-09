// app/api/ai/root-coach/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Enterprise-safe Root Coach (conversational).
 * - No vendor/infrastructure mentions
 * - No technical debugging steps
 * - Focus: reassurance + plain-English explanation + best next action + 2 options
 */

const SYSTEM_PROMPT = `
You are Root Coach inside the Root Health Ops Dashboard.

Your job is to reduce user stress, keep momentum, and help the user successfully post content.
Be warm, conversational, and human — like a calm teammate sitting next to them.

ENTERPRISE DISCLOSURE RULES (critical):
- Do NOT mention or imply any third-party tools, vendors, or infrastructure.
- Never say words like: Ayrshare, Make, Zapier, webhook, API, API key, token, OAuth, rate limit, dashboard, environment variables, logs.
- Do NOT ask the user to do technical troubleshooting or leave the app to fix things.
- Do NOT provide debugging steps. Do NOT “hand back” the problem.
- Do NOT include links.

STYLE:
- Conversational, friendly, reassuring.
- Short. No long explanations.
- Avoid jargon. Use everyday language.
- Do not mention internal systems.

OUTPUT FORMAT (must follow):
1) A reassuring opener (1 sentence, friendly).
2) A simple “what happened” (1–2 sentences, plain English).
3) The best next action (1 sentence).
4) Two button-like choices the user can take in the app (exactly 2 options).

Do not ask questions. Instead present choices like:
Option A: ...
Option B: ...

SELF-HEAL ACTIONS YOU MAY OFFER (only these):
- Retry failed channels only
- Post to other channels now (skip Instagram for now)
- Retry Instagram after swapping the image
- Save for later
- Refresh connections

SPECIAL CASE: Instagram image rejected
If the error suggests the image format/shape is rejected:
- Say: “This image is just outside Instagram’s preferred shape.”
- Suggest: square or portrait image.
- Recommend: swap image then retry Instagram.
- Do NOT mention aspect ratios, error codes, or documentation.

SPECIAL CASE: posting allowance reached
If the error suggests posting allowance is exceeded:
- Say: “You’ve reached this month’s posting allowance for that channel.”
- Recommend: post to other channels now + save for later.
- Do NOT mention vendors, pricing pages, or quotas by provider.

Return ONLY the message shown to the user. No metadata. Keep it short.
`.trim();

function sanitize(text: string) {
  const forbidden = [
    "ayrshare",
    "make.com",
    "make",
    "zapier",
    "webhook",
    "api key",
    "apikey",
    "api",
    "token",
    "oauth",
    "rate limit",
    "dashboard",
    "environment variable",
    "env var",
    "logs",
    "integration",
    "pricing",
    "upgrade plans",
    "openai",
  ];

  let out = (text || "").trim();

  for (const term of forbidden) {
    out = out.replace(new RegExp(term, "gi"), "your setup");
  }

  // Keep it tidy
  return out.trim();
}

function isInstagramImageIssue(msg: string) {
  const s = (msg || "").toLowerCase();
  return (
    s.includes("instagram") &&
    (s.includes("image") ||
      s.includes("aspect ratio") ||
      s.includes("ratio") ||
      s.includes("preferred") ||
      s.includes("must be between") ||
      s.includes("format") ||
      s.includes("shape"))
  );
}

function isQuotaIssue(msg: string) {
  const s = (msg || "").toLowerCase();
  return (
    s.includes("quota") ||
    s.includes("exceeded") ||
    s.includes("allowance") ||
    s.includes("too many") ||
    s.includes("limit for the month")
  );
}

function deterministicFallback(input: {
  errorMessage: string;
  outcome?: string;
  failedPlatforms?: unknown;
  successPlatforms?: unknown;
}) {
  const errorMessage = input.errorMessage || "";

  // Instagram image shape issues
  if (isInstagramImageIssue(errorMessage)) {
    return (
      "Got you — nothing’s broken.\n" +
      "Instagram is just picky about image shape, and this one is slightly outside what it accepts.\n" +
      "Swap the image for a square or portrait one, then retry Instagram.\n" +
      "Option A: Retry Instagram after swapping the image\n" +
      "Option B: Post to the other channels now and save Instagram for later"
    );
  }

  // Posting allowance / quota issues (429 / monthly cap etc.)
  if (isQuotaIssue(errorMessage)) {
    return (
      "All good — you didn’t do anything wrong.\n" +
      "You’ve reached this month’s posting allowance for that channel.\n" +
      "Let’s keep momentum by posting to the channels that are ready.\n" +
      "Option A: Post to other channels now (skip this one for now)\n" +
      "Option B: Save for later and we’ll resume when posting is available again"
    );
  }

  // No platforms selected
  if (errorMessage.toLowerCase().includes("choose at least one platform")) {
    return (
      "No stress — easy fix.\n" +
      "It looks like nothing was selected to send to.\n" +
      "Select one or more channels and try again.\n" +
      "Option A: Retry failed channels only\n" +
      "Option B: Save for later"
    );
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const {
      context,
      errorMessage = "",
      userAction = "",
      outcome = "",
      failedPlatforms = [],
      successPlatforms = [],
    } = await req.json();

    // 1) Deterministic responses for common cases (fast + safe)
    const fallback = deterministicFallback({
      errorMessage,
      outcome,
      failedPlatforms,
      successPlatforms,
    });

    if (fallback) {
      return NextResponse.json({ coachMessage: fallback });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      // Still return a calm message (don’t leak infra detail)
      return NextResponse.json({
        coachMessage:
          "I’ve got you — we’ll keep this simple.\n" +
          "Something didn’t go through this time.\n" +
          "Try a quick retry for the failed channels.\n" +
          "Option A: Retry failed channels only\n" +
          "Option B: Save for later",
      });
    }

    // 2) Build safe context for the model (no vendor names)
    const safeContext = `
Context: ${String(context || "general")}
User action: ${String(userAction || "took an action")}
Outcome: ${String(outcome || "unknown")}
Successful channels: ${Array.isArray(successPlatforms) ? successPlatforms.join(", ") : ""}
Failed channels: ${Array.isArray(failedPlatforms) ? failedPlatforms.join(", ") : ""}
What happened (raw): ${String(errorMessage || "No details provided")}
`.trim();

    // 3) Call OpenAI (chat completions)
    const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: safeContext },
        ],
        max_tokens: 220,
        temperature: 0.55, // conversational but still controlled
      }),
    });

    if (!completionRes.ok) {
      return NextResponse.json({
        coachMessage:
          "No worries — we’ll keep moving.\n" +
          "That one didn’t go through this time.\n" +
          "Try a quick retry for the channels that failed.\n" +
          "Option A: Retry failed channels only\n" +
          "Option B: Save for later",
      });
    }

    const completionJson = await completionRes.json();
    const raw =
      completionJson.choices?.[0]?.message?.content ??
      "I’ve got you.\nSomething didn’t go through.\nLet’s retry what failed.\nOption A: Retry failed channels only\nOption B: Save for later";

    const coachMessage = sanitize(raw);

    return NextResponse.json({
      coachMessage:
        coachMessage.length > 10
          ? coachMessage
          : "I’ve got you.\nSomething didn’t go through.\nLet’s retry what failed.\nOption A: Retry failed channels only\nOption B: Save for later",
    });
  } catch (error: any) {
    return NextResponse.json({
      coachMessage:
        "I’ve got you — no stress.\n" +
        "Something didn’t go through this time.\n" +
        "Let’s try again in the simplest way.\n" +
        "Option A: Retry failed channels only\n" +
        "Option B: Save for later",
    });
  }
}
