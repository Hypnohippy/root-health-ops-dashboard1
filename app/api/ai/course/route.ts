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
      "You are Root Coach, an expert course creator, facilitator trainer, and CPD-style learning designer.",
      "Write in UK English only.",
      "Never use American spelling.",
      "Use a professional UK CPD tone.",
      "Be facilitator-ready.",
      "Include practical examples.",
      "Include reflective learning.",
      "Use clear professional language.",
      "Be assessment-ready.",
      "Include estimated learning time.",
      "State practitioner level clearly.",
      "Include review questions.",
      "Include follow-up practice tasks.",
      "You create FULLY TEACHABLE, IN-DEPTH course content for instructors who may have limited prior knowledge.",
      "You do NOT create outlines.",
      "You create COMPLETE LESSON MATERIAL.",
      "Do not make diagnosis, treatment, cure, or recovery claims.",
      explicitConditionTopic
        ? "The user has explicitly chosen a condition or topic. You may refer to that topic carefully, respectfully, and in broad educational language."
        : "Do not assume any diagnosis, condition, neurotype, disorder, or label unless the user explicitly asked for that topic.",
      "Every module must help the teacher teach confidently.",
      "Never tell the teacher to discuss or explain a concept unless you also provide the actual content they should teach.",
      "If delivery steps say discuss, explain, demonstrate, summarise, compare, or teach, then main_points and facilitator_script must provide the material needed.",
      "Main points must contain the real teaching content, not placeholders.",
      "Facilitator script must contain natural wording the teacher can actually say aloud.",
      "Exercise facilitator guidance must tell the teacher how to run the exercise, what to look for, and how to debrief it.",
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
      "- estimated_learning_time",
      "- practitioner_level",
      "- 4 learning_outcomes",
      "- 4 modules",
      "- closing_encouragement",
      "",
      "Each module must include:",
      "- title",
      "- summary",
      "- 3 to 5 teaching bullets",
      "- main_points",
      "- instructor_notes",
      "- facilitator_script",
      "- delivery_steps",
      "- exercise",
      "- exercise_facilitator_guidance",
      "- reflection_prompt",
      "- review_questions",
      "- follow_up_practice",
      "",
      "Quality requirements:",
      "- main_points must clearly explain what the teacher should cover.",
      "- instructor_notes must include emphasis, cautions, timing, and guidance.",
      "- facilitator_script must give wording the teacher can use in class.",
      "- delivery_steps must be practical and sequenced.",
      "- exercise must describe the participant task.",
      "- exercise_facilitator_guidance must explain how the teacher runs and debriefs the exercise.",
      "- review_questions must be useful for recap, assessment, or discussion.",
      "- follow_up_practice must describe what the learner should do after the session.",
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
          "estimated_learning_time",
          "practitioner_level",
          "learning_outcomes",
          "modules",
          "closing_encouragement",
        ],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          intended_reader: { type: "string" },
          estimated_learning_time: { type: "string" },
          practitioner_level: { type: "string" },
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
                "main_points",
                "instructor_notes",
                "facilitator_script",
                "delivery_steps",
                "exercise",
                "exercise_facilitator_guidance",
                "reflection_prompt",
                "review_questions",
                "follow_up_practice",
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
                main_points: { type: "string" },
                instructor_notes: { type: "string" },
                facilitator_script: { type: "string" },
                delivery_steps: { type: "string" },
                exercise: { type: "string" },
                exercise_facilitator_guidance: { type: "string" },
                reflection_prompt: { type: "string" },
                review_questions: {
                  type: "array",
                  minItems: 2,
                  maxItems: 5,
                  items: { type: "string" },
                },
                follow_up_practice: { type: "string" },
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
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: userPrompt,
        },
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
      estimated_learning_time: String(
        parsed?.estimated_learning_time || ""
      ).trim(),
      practitioner_level: String(parsed?.practitioner_level || "").trim(),
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
            main_points: String(m?.main_points || "").trim(),
            instructor_notes: String(m?.instructor_notes || "").trim(),
            facilitator_script: String(m?.facilitator_script || "").trim(),
            delivery_steps: String(m?.delivery_steps || "").trim(),
            exercise: String(m?.exercise || "").trim(),
            exercise_facilitator_guidance: String(
              m?.exercise_facilitator_guidance || ""
            ).trim(),
            reflection_prompt: String(m?.reflection_prompt || "").trim(),
            review_questions: Array.isArray(m?.review_questions)
              ? m.review_questions.map((x: any) => String(x || "").trim())
              : [],
            follow_up_practice: String(m?.follow_up_practice || "").trim(),
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
