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
    "hypnosis",
    "hypnotherapy",
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
      "You are Root Coach, an expert course creator and practitioner trainer.",
      "You create FULLY TEACHABLE course content, not outlines.",
      "The course must be usable by a therapist, coach, practitioner, or facilitator without extra preparation.",
      "Write as if the instructor will read this and deliver it directly in a real session, workshop, or class.",
      "Use UK spelling.",
      "Do not make diagnosis, treatment, cure, or recovery claims.",
      explicitConditionTopic
        ? "The user has explicitly chosen a condition/topic. You may refer to that topic carefully, respectfully, and in broad educational language without sounding reductive."
        : "Do not assume any diagnosis, condition, neurotype, disorder, or label unless the user explicitly asked for that topic.",
      "Each module must include real teaching detail.",
      "Explain techniques in plain language.",
      "Explain why the technique or concept works.",
      "Provide concrete examples.",
      "Provide wording the instructor can actually say where useful.",
      "Include mini scripts where appropriate.",
      "Include step-by-step delivery guidance.",
      "Include structured practice guidance.",
      "Instructor notes must help the therapist deliver confidently.",
      "Delivery steps must be specific, practical, and teachable.",
      "Exercises must clearly describe what the instructor does and what the learner/client does.",
      "Do not be vague, generic, or blog-like.",
      "Return only valid JSON matching the schema.",
    ].join(" ");

    const userPrompt = [
      `Topic: ${topic}`,
      `Goal: ${goal || "Not specified"}`,
      `Audience: ${audience || "Not specified"}`,
      `Notes: ${notes || "None"}`,
      `Tone: ${tone}`,
      `Fill level: ${fillLevel}`,
      "",
      "Create a professional short course with substantial teaching content.",
      "",
      "Return:",
      "- title",
      "- summary",
      "- intended_reader",
      "- 4 learning_outcomes",
      "- 4 modules",
      "- closing_encouragement",
      "",
      "Each module must include:",
      "- title",
      "- summary",
      "- 3 to 5 teaching bullets",
      "- instructor_notes",
      "- delivery_steps",
      "- exercise",
      "- reflection_prompt",
      "",
      "Quality requirements:",
      "- The summary for each module must explain the concept in a way the instructor can quickly understand.",
      "- instructor_notes must include guidance, cautions, emphasis, and delivery advice.",
      "- delivery_steps must include a step-by-step teaching flow.",
      "- exercise must feel like a real practice activity, not a placeholder.",
      "- reflection_prompt must help consolidate learning.",
      "- The whole course should feel like material a professional could actually deliver.",
      "",
      "If the topic involves a specific technique, method, or process, include explanation of how it works, why it works, and examples of how to teach it.",
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
        { role: "user", content: userPrompt },
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
      title: String(parsed?.title || topic).trim(),
      summary: String(parsed?.summary || "").trim(),
      intended_reader: String(parsed?.intended_reader || "").trim(),
      learning_outcomes: Array.isArray(parsed?.learning_outcomes)
        ? parsed.learning_outcomes.map((x: any) => String(x || "").trim())
        : [],
      sections: Array.isArray(parsed?.modules)
        ? parsed.modules.map((m: any) => ({
            title: String(m?.title || "").trim(),
            summary: String(m?.summary || "").trim(),
            bullets: Array.isArray(m?.bullets)
              ? m.bullets.map((x: any) => String(x || "").trim())
              : [],
            instructor_notes: String(m?.instructor_notes || "").trim(),
            delivery_steps: String(m?.delivery_steps || "").trim(),
            exercise: String(m?.exercise || "").trim(),
            reflection_prompt: String(m?.reflection_prompt || "").trim(),
          }))
        : [],
      closing_encouragement: String(parsed?.closing_encouragement || "").trim(),
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
