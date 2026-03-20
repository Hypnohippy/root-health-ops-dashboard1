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
    const tone = String(body?.tone || "supportive and practical").trim();
    const fillLevel = String(body?.fillLevel || "draft").trim();

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
      "You are Root Coach, a gentle educator and course designer for therapists, coaches, and wellbeing brands.",
      "Create a calm, ethical, practical short course that feels substantial and genuinely teachable.",
      "Do not make diagnosis, treatment, cure, or recovery claims.",
      explicitConditionTopic
        ? "The user has explicitly chosen a condition/topic. You may refer to that topic carefully, respectfully, and in broad educational language without sounding diagnostic or reductive."
        : "Do not assume any diagnosis, condition, neurotype, disorder, or label unless the user explicitly asked for that topic. Default to broad, non-diagnostic language such as stress, overwhelm, focus, confidence, emotional wellbeing, work pressure, resilience, or support.",
      "Use UK spelling.",
      "Make the course feel real, usable, and content-rich.",
      "Each module must contain teaching content, not just headings.",
      "Bullets should be practical and specific.",
      "Lesson summaries should read like short teaching paragraphs, not labels.",
      "Exercises and reflection prompts should feel helpful and realistic.",
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
      "Create a short professional course that includes:",
      "- title",
      "- summary",
      "- intended_reader",
      "- 4 learning outcomes",
      "- 4 modules",
      "- each module must include:",
      "  - title",
      "  - summary",
      "  - 3 to 5 teaching bullets",
      "  - 1 practical exercise",
      "  - 1 reflection prompt",
      "- closing encouragement",
      "",
      "The structure should be suitable for turning into a downloadable or teachable course pack.",
      "Each module should feel like a real lesson/module, not just a heading.",
      "The bullets should include actual teaching points.",
      "The summary inside each module should explain what the learner will understand or practise.",
      "",
      "If fill level is skeleton, keep it lighter but still useful.",
      "If fill level is draft, provide meaningful substance.",
      "If fill level is ready, make it polished and delivery-ready.",
    ].join("\n");

    const schema = {
      name: "root_coach_course_outline",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "summary",
          "intended_reader",
          "learning_outcomes",
          "modules",
          "closing_encouragement",
        ],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          intended_reader: { type: "string" },
          learning_outcomes: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "string" },
          },
          modules: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "title",
                "summary",
                "bullets",
                "exercise",
                "reflection_prompt",
              ],
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                bullets: {
                  type: "array",
                  minItems: 3,
                  maxItems: 5,
                  items: { type: "string" },
                },
                exercise: { type: "string" },
                reflection_prompt: { type: "string" },
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

    const normalised = {
      title: parsed?.title || topic,
      summary: parsed?.summary || "",
      intended_reader: parsed?.intended_reader || "",
      learning_outcomes: Array.isArray(parsed?.learning_outcomes)
        ? parsed.learning_outcomes
        : [],
      sections: Array.isArray(parsed?.modules)
        ? parsed.modules.map((m: any) => ({
            title: String(m?.title || "").trim(),
            bullets: Array.isArray(m?.bullets) ? m.bullets : [],
            summary: String(m?.summary || "").trim(),
            exercise: String(m?.exercise || "").trim(),
            reflection_prompt: String(m?.reflection_prompt || "").trim(),
          }))
        : [],
      closing_encouragement: parsed?.closing_encouragement || "",
    };

    return NextResponse.json({
      success: true,
      explicitConditionTopic,
      course: normalised,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Course generation failed" },
      { status: 500 }
    );
  }
}
