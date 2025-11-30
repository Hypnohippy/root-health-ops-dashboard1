// app/api/ai/brainstorm/route.ts

import { NextRequest, NextResponse } from "next/server";

/**
 * Brainstorming Chat API
 *
 * POST /api/ai/brainstorm
 *
 * Body:
 * {
 *   "messages": [
 *     { "role": "user" | "assistant", "content": "..." },
 *     ...
 *   ],
 *   "platform": "LinkedIn" | "Facebook" | "Instagram"
 * }
 *
 * Returns:
 * {
 *   "reply": "assistant's conversational reply",
 *   "draft": "optional improved post draft"
 * }
 */

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/ai/brainstorm",
    usage:
      "POST a JSON body with { messages: [{ role, content }...], platform } to continue the brainstorm.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { messages, platform = "LinkedIn" } = body as {
      messages?: { role: string; content: string }[];
      platform?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages[] is required" },
        { status: 400 }
      );
    }

    const safePlatform =
      typeof platform === "string" && platform.trim().length > 0
        ? platform.trim()
        : "LinkedIn";

    const platformGuidance =
      safePlatform.toLowerCase() === "linkedin"
        ? "Lean a bit more professional and reflective – LinkedIn style."
        : safePlatform.toLowerCase() === "facebook"
        ? "Make it more conversational and human – Facebook Page style."
        : safePlatform.toLowerCase() === "instagram"
        ? "Shorter, more emotional, and visual – Instagram caption style."
        : "Neutral, works across LinkedIn and Facebook.";

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Build OpenAI chat messages
    const openAIMessages = [
      {
        role: "system",
        content: `
You are "Brainstorm Buddy", a conversational content strategist for Root Health Ops.

Job:
- Help David riff on ideas for posts for LinkedIn and Facebook (Fuel Geist).
- Stay very HUMAN, natural and collaborative – like this chat, not like a stiff copywriter.
- You are allowed to ask questions, suggest angles, and tweak wording over several turns.

Brand:
- Root Health / Root Cause Power: self-guided app that helps people map stress, patterns, and small steps.
- Founder has lived experience of trauma, burnout and rebuilding.
- No clinical claims, no medical advice, no overpromising. It's about insight, agency and gentle support.

Behaviour:
- You chat naturally: short paragraphs, no walls of text.
- When relevant, you can propose an improved post DRAFT based on the conversation so far.

VERY IMPORTANT OUTPUT FORMAT:
Always return ONLY valid JSON like:

{
  "reply": "what you want to say back to David in a conversational way",
  "draft": "optional suggested post as a single text block, or empty string if not needed yet"
}

Rules:
- "reply" is the chatty back-and-forth voice.
- "draft" is the more polished post text (can be empty until David asks for a draft).
- Never include markdown or emojis in the JSON structure itself (they are fine inside the strings).
- Do NOT wrap JSON in backticks or add any text around it.
- You're currently brainstorming for: ${safePlatform}.
${platformGuidance}
      `.trim(),
      },
      // Pass through the existing dialog
      ...messages.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content || ""),
      })),
      // Small extra nudge at the end
      {
        role: "user",
        content:
          "Please respond following the JSON schema with fields 'reply' and 'draft' only.",
      },
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: openAIMessages,
      }),
    });

    const raw = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: raw?.error?.message || "AI request failed" },
        { status: res.status }
      );
    }

    let payload: any;
    try {
      const content = raw.choices?.[0]?.message?.content || "{}";
      payload = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "AI returned non-JSON content" },
        { status: 500 }
      );
    }

    const reply = String(payload?.reply || "").trim();
    const draft = String(payload?.draft || "").trim();

    if (!reply) {
      return NextResponse.json(
        { error: "AI returned empty reply" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reply,
      draft,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
