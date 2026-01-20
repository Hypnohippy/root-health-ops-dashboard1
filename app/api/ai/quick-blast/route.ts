// app/api/ai/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const PROVIDERS = [
  "facebook",
  "instagram",
  "linkedin",
  "threads",
  "tiktok",
  "google",
  "email",
  "whatsapp",
] as const;

type ProviderId = (typeof PROVIDERS)[number];

function asProviderList(input: any): ProviderId[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => String(x || "").toLowerCase().trim())
    .filter((x) => PROVIDERS.includes(x as ProviderId)) as ProviderId[];
}

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in Vercel env." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const subject = String(body?.subject ?? "").trim();
    const tone = String(body?.tone ?? "calm").trim();
    const length = String(body?.length ?? "short").trim(); // short | medium | long
    const audience = String(body?.audience ?? "clients").trim();
    const platforms = asProviderList(body?.platforms);

    if (!subject) {
      return NextResponse.json(
        { error: "subject is required" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Keep outputs safe + therapist-friendly by default
    const system = [
      "You write concise, warm, premium social posts for a mental health brand called Root Health.",
      "The tone must be supportive, human, non-salesy, non-medical (no diagnosis or treatment claims).",
      "Avoid absolute promises. Avoid crisis advice. Encourage gentle self-compassion.",
      "Use UK spelling.",
      "Return ONLY valid JSON that matches the provided schema.",
    ].join(" ");

    const platformHint =
      platforms.length > 0
        ? `Target platforms: ${platforms.join(", ")}.`
        : "Target platforms: facebook and instagram.";

    const lengthHint =
      length === "long"
        ? "Aim 220–420 words."
        : length === "medium"
          ? "Aim 120–220 words."
          : "Aim 60–120 words.";

    const prompt = [
      `Subject: ${subject}`,
      `Audience: ${audience}`,
      `Tone: ${tone}`,
      platformHint,
      lengthHint,
      "",
      "Generate 3 distinct variants:",
      "- Variant 1: reflective / philosophical",
      "- Variant 2: practical / grounded (simple steps)",
      "- Variant 3: story-style (short personal tone, but not oversharing)",
      "",
      "Each variant must include:",
      "- a strong first line hook",
      "- the main post text",
      "- a gentle CTA question at the end",
      "- 0–6 relevant hashtags (no spam, no cringe)",
    ].join("\n");

    const schema = {
      name: "root_health_quick_blast",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["variants"],
        properties: {
          variants: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "text", "hashtags", "cta"],
              properties: {
                title: { type: "string" },
                text: { type: "string" },
                cta: { type: "string" },
                hashtags: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 0,
                  maxItems: 6,
                },
              },
            },
          },
        },
      },
    } as const;

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      text: {
        format: {
          type: "json_schema",
          ...schema,
        },
      },
    });

    const raw = resp.output_text || "";
    let json: any = null;

    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error: "AI output was not valid JSON (unexpected).",
          raw: raw.slice(0, 2000),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        subject,
        tone,
        length,
        platforms,
        ...json,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[ai/quick-blast] error", e);
    return NextResponse.json(
      { error: e?.message || "AI generator failed" },
      { status: 500 }
    );
  }
}
