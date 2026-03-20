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

function cleanSlides(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input.map((slide: any) => ({
    slide_title: safe(slide?.slide_title),
    slide_goal: safe(slide?.slide_goal),
    bullets: cleanBullets(slide?.bullets).slice(0, 4),
    speaker_notes: safe(slide?.speaker_notes),
    audience_prompt: safe(slide?.audience_prompt),
    visual_direction: safe(slide?.visual_direction),
    image_prompt: safe(slide?.image_prompt),
    artwork_label: safe(slide?.artwork_label),
    artwork_chip: safe(slide?.artwork_chip),
  }));
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

    const title = safe(body?.title);
    const objective = safe(body?.objective);
    const promise = safe(body?.promise);
    const audienceTakeaway = safe(body?.audience_takeaway);
    const presentationStyle = safe(body?.presentation_style);
    const closingInvitation = safe(body?.closing_invitation);
    const instruction = safe(body?.instruction);
    const slides = cleanSlides(body?.slides);

    if (!instruction) {
      return NextResponse.json(
        { error: "instruction is required." },
        { status: 400 }
      );
    }

    if (!slides.length) {
      return NextResponse.json(
        { error: "slides are required." },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You are Root Coach, a calm and thoughtful presentation editor.",
      "Your job is to improve an entire presentation draft.",
      "You must preserve the core topic unless the instruction clearly asks to change it.",
      "Make the presentation more useful, polished, and delivery-ready.",
      "Use UK spelling.",
      "Do not make diagnosis, treatment, cure, or medical claims.",
      "Keep the tone supportive, professional, and educational.",
      "Bullets should be concise and clear for slides.",
      "Speaker notes should be practical and fuller than bullets.",
      "Audience prompts should be gentle and optional.",
      "visual_direction should stay short and design-focused.",
      "image_prompt should stay short and suitable for tasteful non-photorealistic presentation artwork.",
      "Keep the same number of slides.",
      "Return only valid JSON matching the schema.",
    ].join(" ");

    const prompt = [
      title ? `Title: ${title}` : "",
      objective ? `Objective: ${objective}` : "",
      promise ? `Promise: ${promise}` : "",
      audienceTakeaway ? `Audience takeaway: ${audienceTakeaway}` : "",
      presentationStyle ? `Presentation style: ${presentationStyle}` : "",
      closingInvitation ? `Closing invitation: ${closingInvitation}` : "",
      "",
      `Improve this entire presentation using this instruction: ${instruction}`,
      "",
      "Current slides:",
      JSON.stringify(slides, null, 2),
      "",
      "Important rules:",
      "- Return a full updated presentation, not partial fields.",
      "- Keep the same number of slides.",
      "- Keep each slide with 2 to 4 bullets.",
      "- Keep the overall flow coherent across the whole deck.",
      "- If the instruction changes tone or audience, reflect that across all slides.",
      "- If the instruction changes the visual direction, update visual_direction and image_prompt on each relevant slide.",
      "- Keep artwork_label short.",
      "- Keep artwork_chip short.",
    ]
      .filter(Boolean)
      .join("\n");

    const schema = {
      name: "root_coach_improved_presentation",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "objective",
          "audience_takeaway",
          "presentation_style",
          "slides",
          "closing_invitation",
        ],
        properties: {
          title: { type: "string" },
          objective: { type: "string" },
          audience_takeaway: { type: "string" },
          presentation_style: { type: "string" },
          closing_invitation: { type: "string" },
          slides: {
            type: "array",
            minItems: 1,
            items: {
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
      presentation: parsed,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Presentation improvement failed" },
      { status: 500 }
    );
  }
}
