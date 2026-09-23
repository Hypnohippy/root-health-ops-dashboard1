import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

function containsExplicitConditionLanguage(text: string) {
  const s = String(text || "").toLowerCase();
  const keywords = [
    "adhd",
    "anxiety",
    "autism",
    "asd",
    "depression",
    "trauma",
    "ptsd",
    "ocd",
    "burnout",
    "panic",
    "neurodivergent",
    "diagnosis",
    "diagnosed",
    "mental health condition",
  ];
  return keywords.some((k) => s.includes(k));
}

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const presentationTitle = String(body?.presentationTitle || "").trim();
    const presentationObjective = String(body?.presentationObjective || "").trim();
    const presentationPromise = String(body?.presentationPromise || "").trim();
    const slideTitle = String(body?.slideTitle || "").trim();
    const slideGoal = String(body?.slideGoal || "").trim();
    const bullets = Array.isArray(body?.bullets)
      ? body.bullets.map((b: any) => String(b || "").trim()).filter(Boolean)
      : [];
    const audience = String(body?.audience || "").trim();
    const tone = String(body?.tone || "calm and professional").trim();

    if (!slideTitle) {
      return NextResponse.json(
        { error: "slideTitle is required." },
        { status: 400 }
      );
    }

    const combined = [
      presentationTitle,
      presentationObjective,
      presentationPromise,
      slideTitle,
      slideGoal,
      audience,
      bullets.join(" "),
    ].join(" ");

    const explicitConditionTopic = containsExplicitConditionLanguage(combined);

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You create tasteful slide artwork direction for the supplied business and subject.",
      "Return visual design guidance for ONE slide.",
      "Keep the artwork calm, premium, human, and presentation-friendly.",
      "Avoid anything sensational, chaotic, childish, or cluttered.",
      "Do not create misleading claims or demeaning imagery.",
      explicitConditionTopic
        ? "The chosen topic may mention a condition explicitly. Keep the imagery respectful, non-clinical, and broadly educational."
        : "Keep imagery relevant to the supplied business and subject.",
      "The result must help a designer or image generator create a clean background visual for the slide.",
      "Use UK spelling.",
      "Return only valid JSON matching the schema.",
    ].join(" ");

    const prompt = [
      `Presentation title: ${presentationTitle || "Not specified"}`,
      `Presentation objective: ${presentationObjective || "Not specified"}`,
      `Presentation promise: ${presentationPromise || "Not specified"}`,
      `Audience: ${audience || "Not specified"}`,
      `Tone: ${tone}`,
      `Slide title: ${slideTitle}`,
      `Slide goal: ${slideGoal || "Not specified"}`,
      `Slide bullets: ${bullets.length ? bullets.join(" | ") : "None"}`,
      "",
      "Create slide artwork guidance with:",
      "- artwork_label: very short label for the visual style",
      "- artwork_chip: short subtitle",
      "- visual_direction: concise design direction for the slide background",
      "- image_prompt: a richer prompt suitable for later image generation",
      "",
      "The design should work behind readable presentation text.",
      "Prefer soft gradients, abstract forms, calm shapes, subtle human-centred symbolism, or clean subject-appropriate visual language where suitable.",
    ].join("\n");

    const schema = {
      name: "root_slide_art",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "artwork_label",
          "artwork_chip",
          "visual_direction",
          "image_prompt",
        ],
        properties: {
          artwork_label: { type: "string" },
          artwork_chip: { type: "string" },
          visual_direction: { type: "string" },
          image_prompt: { type: "string" },
        },
      },
    } as const;

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [...tenant.messages,
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

    let parsed: any = null;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error: "AI did not return valid JSON",
          raw: raw.slice(0, 2000),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      artwork: parsed,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Slide artwork generation failed" },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
