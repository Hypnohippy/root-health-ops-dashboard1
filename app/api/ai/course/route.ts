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

    const system = `
You are an expert therapist, trainer, and course creator.

You create FULLY TEACHABLE course content — not outlines.

For every module and delivery step, you MUST expand into detailed teaching content.

Each module MUST include:

- Module summary (clear explanation of the topic)
- Detailed teaching content (NOT bullet points)
- Instructor notes (how to explain it in a session)
- Delivery steps (step-by-step teaching flow)
- Real-world examples (practical therapy or coaching examples)
- Suggested wording or scripts (what the instructor can say out loud)
- Practical exercise (clear activity for participants)
- Reflection prompt (question to deepen understanding)

CRITICAL RULES:

- DO NOT produce shallow bullet lists
- DO NOT repeat headings as content
- EVERY section must include explanation + example + application
- Write as if the instructor has NO prior knowledge
- Make it detailed enough to run a real class from

Return structured JSON that matches the required schema.
`;

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
      "  - instructor_notes",
      "  - delivery_steps",
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
                "instructor_notes",
                "delivery_steps",
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
                instructor_notes: { type: "string" },
                delivery_steps: { type: "string" },
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
            instructor_notes: String(m?.instructor_notes || "").trim(),
            delivery_steps: String(m?.delivery_steps || "").trim(),
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
