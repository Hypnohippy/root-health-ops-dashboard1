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
    const tone = String(body?.tone || "supportive and clear").trim();
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
      "You are Root Coach, a gentle educator and content strategist for therapists, coaches, and wellbeing brands.",
      "Create a calm, ethical educational guide that feels supportive, practical, and non-salesy.",
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
      `Tone: ${tone}`,
      `Fill level: ${fillLevel}`,
      "",
      "Create a guide that includes:",
      "- title",
      "- summary",
      "- intended_reader",
      "- 5 sections",
      "- each section should have a heading and 2-4 bullet points",
      "- a closing encouragement",
      "",
      "If fill level is skeleton, keep it structural.",
      "If fill level is draft, make it useful and substantial.",
      "If fill level is ready, make it polished and ready for readers.",
    ].join("\n");

    const schema = {
      name: "root_coach_guide",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "intended_reader", "sections", "closing_encouragement"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          intended_reader: { type: "string" },
          sections: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["heading", "bullets"],
              properties: {
                heading: { type: "string" },
                bullets: {
                  type: "array",
                  minItems: 2,
                  maxItems: 4,
                  items: { type: "string" },
                },
              },
            },
          },
          closing_encouragement: { type: "string" },
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
      guide: parsed,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Guide generation failed" },
      { status: 500 }
    );
  }
}
