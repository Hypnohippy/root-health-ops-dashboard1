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

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const topic = String(body?.topic || body?.name || "").trim();
    const goal = String(body?.goal || "").trim();
    const audience = String(body?.audience || "").trim();
    const notes = String(body?.notes || "").trim();
    const duration = String(body?.duration || "30 mins").trim();
    const tone = String(body?.tone || "calm and professional").trim();
    const fillLevel = String(body?.fillLevel || "draft").trim(); // skeleton | draft | ready

    if (!topic) {
      return NextResponse.json(
        { error: "topic or name is required." },
        { status: 400 }
      );
    }

    const explicitConditionTopic =
      containsExplicitConditionLanguage(topic) ||
      containsExplicitConditionLanguage(goal) ||
      containsExplicitConditionLanguage(audience) ||
      containsExplicitConditionLanguage(notes);

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You are Root Coach, a gentle educator and marketing strategist for therapists, coaches, and wellbeing brands.",
      "Create a calm, ethical presentation outline that feels supportive, useful, and non-salesy.",
      "Do not make diagnosis, treatment, cure, or recovery claims.",
      explicitConditionTopic
        ? "The user has explicitly chosen a condition/topic. You may refer to that topic carefully, respectfully, and in broad educational language without sounding diagnostic or reductive."
        : "Do not assume any diagnosis, condition, neurotype, disorder, or label unless the user explicitly asked for that topic. Default to broad, non-diagnostic language such as stress, overwhelm, focus, confidence, emotional wellbeing, work pressure, resilience, or support.",
      "Use UK spelling.",
      "Return only valid JSON matching the schema.",
    ].join(" ");

    const prompt = [
      `Topic: ${topic}`,
      `Goal: ${goal || "Not specified"}`,
      `Audience: ${audience || "Not specified"}`,
      `Notes: ${notes || "None"}`,
      `Duration: ${duration}`,
      `Tone: ${tone}`,
      `Fill level: ${fillLevel}`,
      "",
      "Create a presentation outline that includes:",
      "- title",
      "- objective",
      "- audience_takeaway",
      "- 8 slides",
      "- each slide should have a slide_title and 2-4 bullet points",
      "- a closing invitation",
      "",
      "If fill level is skeleton, keep bullets shorter and more structural.",
      "If fill level is draft, provide useful speaker-ready bullets.",
      "If fill level is ready, provide polished, delivery-ready bullets.",
    ].join("\n");

    const schema = {
      name: "root_coach_presentation_outline",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "objective", "audience_takeaway", "slides", "closing_invitation"],
        properties: {
          title: { type: "string" },
          objective: { type: "string" },
          audience_takeaway: { type: "string" },
          slides: {
            type: "array",
            minItems: 8,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["slide_title", "bullets"],
              properties: {
                slide_title: { type: "string" },
                bullets: {
                  type: "array",
                  minItems: 2,
                  maxItems: 4,
                  items: { type: "string" },
                },
              },
            },
          },
          closing_invitation: { type: "string" },
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
      explicitConditionTopic,
      presentation: parsed,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Presentation outline generation failed" },
      { status: 500 }
    );
  }
}
