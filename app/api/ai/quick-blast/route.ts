// app/api/ai/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads";

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Missing OPENAI_API_KEY in environment variables (Vercel → Project → Settings → Environment Variables).",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const message = String(body?.message ?? "").trim();
    const platforms: ProviderId[] = Array.isArray(body?.platforms)
      ? body.platforms
          .map((p: any) => String(p || "").toLowerCase().trim())
          .filter(Boolean)
      : [];

    const tone = String(body?.tone ?? "calm").trim();
    const goal = String(body?.goal ?? "awareness").trim();
    const length = String(body?.length ?? "short").trim(); // short | medium | long
    const includeCta = Boolean(body?.includeCta ?? true);
    const includeHashtags = Boolean(body?.includeHashtags ?? true);

    // Optional: if you want a consistent brand voice without wiring more tables yet
    const brandName = String(body?.brandName ?? "Root Health").trim();

    if (!platforms.length) {
      return NextResponse.json(
        { error: "No platforms provided (platforms[] is required)." },
        { status: 400 }
      );
    }

    // We can generate even if message is empty (e.g. user wants AI to draft from scratch)
    const platformHints = platforms.includes("instagram")
      ? "Instagram note: keep line breaks, include a short hook line, and avoid links in the main body."
      : "";

    const lengthRules =
      length === "short"
        ? "Aim for 50–120 characters."
        : length === "medium"
          ? "Aim for 120–240 characters."
          : "Aim for 240–450 characters.";

    // We ask for STRICT JSON so the UI can present 3 variants cleanly.
    const prompt = `
You are a copywriter for a therapist-friendly marketing platform called ${brandName} Ops.
Write 3 quick-blast post variants for: ${platforms.join(", ")}.

Tone: ${tone}
Goal: ${goal}
${lengthRules}
${includeCta ? "Include a gentle CTA." : "No CTA."}
${includeHashtags ? "Include 3–8 relevant hashtags." : "No hashtags."}
${platformHints}

If the user provided a draft, improve it. If it's empty, create from scratch.
User draft:
"""${message}"""

Return ONLY valid JSON with this exact shape:
{
  "variants": [
    { "title": "Variant 1 short label", "text": "..." },
    { "title": "Variant 2 short label", "text": "..." },
    { "title": "Variant 3 short label", "text": "..." }
  ]
}
`.trim();

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        reasoning: { effort: "low" },
        input: prompt,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "OpenAI request failed",
          status: res.status,
          details: json,
        },
        { status: 500 }
      );
    }

    const outputText = String(json?.output_text ?? "").trim();
    const parsed = safeJsonParse<{ variants: { title: string; text: string }[] }>(
      outputText
    );

    if (!parsed?.variants || !Array.isArray(parsed.variants)) {
      return NextResponse.json(
        {
          error:
            "AI output was not valid JSON. (This is rare; click Generate again.)",
          raw: outputText.slice(0, 2000),
        },
        { status: 500 }
      );
    }

    // Basic cleanup
    const variants = parsed.variants
      .slice(0, 3)
      .map((v, idx) => ({
        title: String(v?.title ?? `Variant ${idx + 1}`).slice(0, 60),
        text: String(v?.text ?? "").trim(),
      }))
      .filter((v) => v.text.length > 0);

    return NextResponse.json(
      { variants },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
