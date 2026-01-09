import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Enterprise-safe Root Coach.
 * - No vendor/infrastructure mentions
 * - No technical debugging steps
 * - Focus: reassurance + what happened + next best in-app action + optional choice
 */

const SYSTEM_PROMPT = `
You are Root Coach inside the Root Health Ops Dashboard.

Your job is to reduce user stress, keep momentum, and help the user successfully post content.
Speak in calm, plain English. Be supportive and decisive.

ENTERPRISE RULES (critical):
- Do NOT mention or imply any third-party tools, vendors, or infrastructure.
- Never say words like: Ayrshare, Make, Zapier, webhook, API, API key, token, OAuth, rate limit, dashboard, environment variables, logs.
- Do NOT ask the user to "check settings", "verify integration", "inspect logs", or do anything outside this app.
- Do NOT give technical troubleshooting steps.
- Do NOT hand the problem back to the user.

You are an operator, not an explainer:
- Prefer actions the user can take immediately inside the app.
- If relevant, suggest one of these self-heal actions (as buttons the app may show):
  - Retry failed channels only
  - Retry Instagram only
  - Send without Instagram for now
  - Swap the image and retry
  - Refresh connections

Always use this structure:
1) Reassure (1 short sentence)
2) What happened (simple human terms)
3) What I recommend (one clear action)
4) Optional choice (max 2 options)

Instagram image rule:
If the error suggests Instagram rejected the image format/shape (aspect ratio / too wide / too tall / image constraints),
say: "This image is just outside Instagram’s preferred shape."
Suggest: square (1:1) or portrait (4:5).
Do NOT mention numbers, codes, aspect ratios, or documentation links.

Output ONLY the message for the user. No bullet lists longer than 3 lines. No metadata.
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
  ];

  let out = (text || "").trim();

  for (const term of forbidden) {
    out = out.replace(new RegExp(term, "gi"), "your setup");
  }

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

function deterministicFallback(errorMessage: string) {
  if (isInstagramImageIssue(errorMessage)) {
    return (
      "You’re doing great — nothing is broken.\n\n" +
      "This image is just outside Instagram’s preferred shape.\n\n" +
      "Swap it for a square or portrait image, then tap **Retry Instagram**. If you want momentum now, send to the other channels and we’ll post to Instagram next."
    );
  }

  if ((errorMessage || "").toLowerCase().includes("choose at least one platform")) {
    return (
      "No worries — this one is quick.\n\n" +
      "It looks like no channel was actually selected for that send.\n\n" +
      "Pick one or more channels and try again. If you’re unsure, start with Facebook and LinkedIn."
    );
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const { context, errorMessage = "", userAction = "", outcome = "", failedPlatforms = [], successPlatforms = [] } =
      await req.json();

    // 1) Perfect deterministic responses for common cases (fast + safe)
    const fallback = deterministicFallback(errorMessage);
    if (fallback) {
      return NextResponse.json({ coachMessage: fallback });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      // Still return a calm message (don’t leak infra detail to user)
      return NextResponse.json({
        coachMessage:
          "You’re doing fine — let’s keep it simple.\n\nTry **Retry failed only** once. If it still won’t go through, send to the channels that are ready and we’ll circle back to the remaining one next.",
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
        temperature: 0.4,
      }),
    });

    if (!completionRes.ok) {
      // Don’t expose technical failure to user
      return NextResponse.json({
        coachMessage:
          "You’re doing fine — this looks like a temporary hiccup.\n\nTry **Retry failed only** once. If it still won’t go through, send to the channels that are ready and we’ll come back to the remaining one next.",
      });
    }

    const completionJson = await completionRes.json();
    const raw =
      completionJson.choices?.[0]?.message?.content ??
      "You’re doing great — try **Retry failed only** once, or send to the channels that are ready and we’ll post the remaining one next.";

    const coachMessage = sanitize(raw);

    return NextResponse.json({
      coachMessage:
        coachMessage.length > 10
          ? coachMessage
          : "You’re doing great — try **Retry failed only** once, or send to the channels that are ready and we’ll post the remaining one next.",
    });
  } catch (error: any) {
    return NextResponse.json({
      coachMessage:
        "You’re doing fine — let’s keep it simple.\n\nTry **Retry failed only** once. If it still won’t go through, send to the channels that are ready and we’ll circle back to the remaining one next.",
    });
  }
}
