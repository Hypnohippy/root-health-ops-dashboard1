// app/api/ai/improve-slide/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

function safe(value: unknown): string {
  return String(value || "").trim();
}

function cleanBullets(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x) => safe(x)).filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const presentationTitle = safe(body?.presentationTitle);
    const presentationObjective = safe(body?.presentationObjective);
    const presentationPromise = safe(body?.presentationPromise);
    const presentationAudienceTakeaway = safe(
      body?.presentationAudienceTakeaway
    );
    const presentationStyle = safe(body?.presentationStyle);
    const instruction = safe(body?.instruction);

    const slide = body?.slide || {};
    const slideTitle = safe(slide?.slide_title);
    const slideGoal = safe(slide?.slide_goal);
    const bullets = cleanBullets(slide?.bullets);
    const speakerNotes = safe(slide?.speaker_notes);
    const audiencePrompt = safe(slide?.audience_prompt);
    const visualDirection = safe(slide?.visual_direction);
    const imagePrompt = safe(slide?.image_prompt);
    const artworkLabel = safe(slide?.artwork_label);
    const artworkChip = safe(slide?.artwork_chip);

    if (!instruction) {
      return NextResponse.json(
        { error: "instruction is required." },
        { status: 400 }
      );
    }

    if (!slideTitle && !slideGoal && bullets.length === 0) {
      return NextResponse.json(
        { error: "A valid slide is required." },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You are Root Coach, a calm and thoughtful presentation editor.",
      "Your job is to improve ONE slide inside an existing presentation.",
      "You must preserve the core meaning unless the instruction clearly asks to change it.",
      "Make the slide more useful, polished, and presentation-ready.",
      "Use UK spelling.",
      "Do not make diagnosis, treatment, cure, or medical claims.",
      "Keep the slide supportive, professional, and educational.",
      "Bullets should be concise and clear for on-slide display.",
      "Speaker notes should be fuller than bullets but still practical and usable.",
      "Audience prompts should be gentle, optional, and non-intrusive.",
      "visual_direction should stay short and design-focused.",
      "image_prompt should stay short and suitable for tasteful non-photorealistic presentation artwork.",
      "Return only valid JSON matching the schema.",
    ].join(" ");

    const prompt = [
      presentationTitle ? `Presentation title: ${presentationTitle}` : "",
      presentationObjective
        ? `Presentation objective: ${presentationObjective}`
        : "",
      presentationPromise ? `Presentation promise: ${presentationPromise}` : "",
      presentationAudienceTakeaway
        ? `Audience takeaway: ${presentationAudienceTakeaway}`
        : "",
      presentationStyle ? `Presentation style: ${presentationStyle}` : "",
      "",
      "Current slide:",
      slideTitle ? `slide_title: ${slideTitle}` : "",
      slideGoal ? `slide_goal: ${slideGoal}` : "",
      bullets.length ? `bullets: ${bullets.join(" | ")}` : "",
      speakerNotes ? `speaker_notes: ${speakerNotes}` : "",
      audiencePrompt ? `audience_prompt: ${audiencePrompt}` : "",
      visualDirection ? `visual_direction: ${visualDirection}` : "",
      imagePrompt ? `image_prompt: ${imagePrompt}` : "",
      artworkLabel ? `artwork_label: ${artworkLabel}` : "",
      artworkChip ? `artwork_chip: ${artworkChip}` : "",
      "",
      `Improve this slide using this instruction: ${instruction}`,
      "",
      "Important rules:",
      "- Return a full updated slide, not partial fields.",
      "- Keep 2 to 4 bullets.",
      "- Keep the slide aligned with the whole presentation.",
      "- If the instruction changes tone or audience, reflect that clearly.",
      "- If the instruction changes the visual direction, update visual_direction and image_prompt too.",
      "- Keep artwork_label short.",
      "- Keep artwork_chip short.",
    ]
      .filter(Boolean)
      .join("\n");

    const schema = {
      name: "root_coach_improved_slide",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "slide_title",
          "slide_goal",
          "bullets",
          "speaker_notes",
          "audience_prompt",
          "visual_direction",
          "image_prompt",
          "artwork_label",
          "artwork_chip",
        ],
        properties: {
          slide_title: { type: "string" },
          slide_goal: { type: "string" },
          bullets: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: { type: "string" },
          },
          speaker_notes: { type: "string" },
          audience_prompt: { type: "string" },
          visual_direction: { type: "string" },
          image_prompt: { type: "string" },
          artwork_label: { type: "string" },
          artwork_chip: { type: "string" },
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
      slide: parsed,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Slide improvement failed" },
      { status: 500 }
    );
  }
}
