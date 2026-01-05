// app/api/ai/brainstorm/route.ts
import { NextRequest, NextResponse } from "next/server";

type DirectPost = {
  title: string;
  body: string;
  cta?: string;
  hashtags?: string[];
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// NOTE: We keep this endpoint "direct post" only.
// Stories/series are generated via /api/ai/story-series (already working).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const prompt: string | undefined = body?.prompt;
    const platform: string | undefined = body?.platform;
    const tone: string | undefined = body?.tone;
    const goal: string | undefined = body?.goal;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { success: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const safePlatform = typeof platform === "string" ? platform : "linkedin";
    const safeTone = typeof tone === "string" ? tone : "Professional & confident";
    const safeGoal = typeof goal === "string" ? goal : "Direct post to my audience";

    const system = `
You are a senior social copywriter for Root Health Ops.
Return ONLY valid JSON.
Do NOT wrap in markdown.
Do NOT include commentary outside JSON.

You are writing a DIRECT SOCIAL POST (not a story, not a case study, not a narrative arc unless explicitly requested).
The user wants something they could publish today.

JSON schema:
{
  "title": "string (optional but recommended)",
  "body": "string (the main post text)",
  "cta": "string (optional)",
  "hashtags": ["string", ...] (optional)
}

Rules:
- Keep it platform-appropriate for: ${safePlatform}
- Tone: ${safeTone}
- Goal: ${safeGoal}
- No fake stats. If you mention numbers, they must be framed as examples, not facts.
- Avoid repetitive lines.
- No mention of any third-party tools or providers.
`.trim();

    const user = `
Write a direct post based on this brief:

${prompt.trim()}
`.trim();

    // Use OpenAI Responses API format (works with fetch)
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const aiJson = await aiRes.json().catch(() => null);

    if (!aiRes.ok || !aiJson) {
      return NextResponse.json(
        {
          success: false,
          error: "AI request failed",
          details: aiJson,
        },
        { status: 500 }
      );
    }

    const content = aiJson?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { success: false, error: "AI response missing content" },
        { status: 500 }
      );
    }

    let parsed: DirectPost | null = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "AI response was not valid JSON. Try again or slightly shorten your brief.",
          raw: content,
        },
        { status: 200 }
      );
    }

    if (!parsed || typeof parsed.body !== "string" || !parsed.body.trim()) {
      return NextResponse.json(
        { success: false, error: "AI returned empty body" },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { success: true, post: parsed },
      { status: 200 }
    );
  } catch (err) {
    console.error("[ai/brainstorm] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error in /api/ai/brainstorm" },
      { status: 500 }
    );
  }
}
