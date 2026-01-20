// app/api/ai/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

type Platform = "facebook" | "instagram";

function clampLen(s: string, max: number) {
  const t = String(s || "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in environment variables." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const platform = (String(body?.platform || "facebook").toLowerCase() ||
      "facebook") as Platform;

    const objective = clampLen(body?.objective ?? "", 240);
    const context = clampLen(body?.context ?? "", 1200);
    const audience = clampLen(body?.audience ?? "", 240);
    const tone = clampLen(body?.tone ?? "warm, confident, human", 120);
    const length = clampLen(body?.length ?? "short", 40); // short | medium | long
    const includeCta = Boolean(body?.includeCta ?? true);

    if (!objective) {
      return NextResponse.json(
        { error: "objective is required" },
        { status: 400 }
      );
    }

    const system = `
You write short marketing posts for a mental health / wellbeing brand.
You must be ethical, non-triggering, non-medical, and avoid diagnosing.
No claims like "cure" or "guarantee". Encourage seeking professional support when appropriate.
Write in British English.

Return STRICT JSON only (no markdown), matching this schema:
{
  "variants": [
    { "title": "Variant A", "text": "..." },
    { "title": "Variant B", "text": "..." },
    { "title": "Variant C", "text": "..." }
  ]
}
`;

    const platformNotes =
      platform === "instagram"
        ? `Instagram style:
- Slightly punchier, line breaks ok
- Up to 8 relevant hashtags at the end (optional)
- Emojis allowed but not excessive`
        : `Facebook style:
- Slightly more conversational
- No hashtags (or max 2)`;

    const user = `
Objective: ${objective}
Platform: ${platform}
Tone: ${tone}
Length: ${length}
Audience: ${audience || "(not specified)"}
Include CTA: ${includeCta ? "yes" : "no"}

Context / details to include (optional):
${context || "(none)"}

Rules:
- Give 3 distinct variants
- Keep it human, not salesy
- If CTA is included: keep it gentle (e.g., “If you’d like, DM…” / “Learn more…”)
- Avoid medical advice
- Do not mention OpenAI or AI
- Do not output anything except the JSON object
${platformNotes}
`.trim();

    // Call OpenAI Responses API
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.8,
      }),
    });

    const raw = await r.json().catch(() => null);

    if (!r.ok) {
      return NextResponse.json(
        {
          error: "AI generation failed",
          status: r.status,
          details: raw,
        },
        { status: 500 }
      );
    }

    const text =
      raw?.output?.[0]?.content?.[0]?.text ||
      raw?.output_text ||
      raw?.response?.output_text ||
      "";

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // fallback: sometimes the model returns a JSON object directly in another field
      parsed = null;
    }

    if (!parsed?.variants || !Array.isArray(parsed.variants)) {
      return NextResponse.json(
        {
          error: "AI returned unexpected format",
          rawText: text?.slice?.(0, 2000) || text,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { variants: parsed.variants },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[ai/quick-blast] unexpected", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
