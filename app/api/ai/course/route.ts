import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { logUsage, getMonthlyUsage, getPlanLimit } from "@/lib/usage";
import { getCurrentUserId } from "@/lib/supabaseServer";

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

function extractJsonObject(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // continue
    }
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
   const userId = await getCurrentUserId();
const userPlan = "solo";

const usage = userId ? await getMonthlyUsage(userId) : 0;
const monthlyLimit = getPlanLimit(userPlan);
const cost = 2;

if (usage + cost > monthlyLimit) {
  return NextResponse.json(
    { error: "Monthly AI limit reached. Upgrade to continue." },
    { status: 403 }
  );
}
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
const instructorType = String(body?.instructorType || "therapist").trim();
const learnerAudience = String(
  body?.learnerAudience || "members of the public"
).trim();
const deliveryContext = String(body?.deliveryContext || "workshop").trim();
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
      "You are Root Coach, an expert course creator for therapists, coaches, and lifestyle practitioners, including CBT therapists, integrative therapists, counsellors, coaches, and lifestyle coaches.",
      "Write in UK English only.",
      "Never use American spelling.",
      "Use a professional UK CPD tone.",
      "Create fully teachable lesson material for therapists, coaches, and lifestyle practitioners who may not already know the topic well.",
      "Tailor the material to the specified instructor type, learner audience, and delivery context. Do not assume therapist-to-therapist teaching unless explicitly requested.",
      "Do not create vague outlines.",
      "Do not say 'introduce', 'discuss', 'cover', or 'explore' unless you also provide the actual teaching content.",
      "If a concept is mentioned, define it clearly.",
      "If a technique is mentioned, explain what it is, why it works, and how to teach it.",
      "If an activity is mentioned, explain exactly how to run it.",
      "If scripting is relevant, include wording the teacher can actually say.",
      "If context or variation is mentioned, explain how it changes practice.",
      "Assume the teacher is not already an expert.",
      "Do not make diagnosis, treatment, cure, or recovery claims.",
      explicitConditionTopic
        ? "The user has explicitly chosen a condition or topic. You may refer to that topic carefully and respectfully."
        : "Do not assume any diagnosis, condition, neurotype, disorder, or label unless the user explicitly asked for that topic.",
      "Return JSON only. No markdown fences. No commentary.",
    ].join(" ");

    const userPrompt = [
      `Topic: ${topic}`,
`Goal: ${goal || "Not specified"}`,
`Audience: ${audience || "Not specified"}`,
`Instructor type: ${instructorType}`,
`Learner audience: ${learnerAudience}`,
`Delivery context: ${deliveryContext}`,
`Notes: ${notes || "None"}`,
`Tone: ${tone}`,
`Fill level: ${fillLevel}`,
      "",
      "Create a professional short course with substantial teaching content tailored to the specified instructor type, learner audience, and delivery context.",
      "The content must match the learner audience appropriately.",
"If the learner audience is public, use accessible and non-jargon language.",
"If the learner audience is companies or workplace teams, use practical workplace language and examples.",
"If the learner audience is therapists or practitioners, use CPD-style practitioner language.",
"If the learner audience is clients or sufferers or peer groups, use supportive, respectful, empowering language.",
      "",
      "Return exactly this JSON shape:",
      "{",
      '  "title": "string",',
      '  "summary": "string",',
      '  "intended_reader": "string",',
      '  "estimated_learning_time": "string",',
      '  "practitioner_level": "string",',
      '  "learning_outcomes": ["string", "string", "string", "string"],',
      '  "modules": [',
      "    {",
      '      "title": "string",',
      '      "summary": "string",',
      '      "bullets": ["string", "string", "string"],',
      '      "key_concepts_explained": "string",',
      '      "main_points": "string",',
      '      "worked_examples": "string",',
      '      "instructor_notes": "string",',
      '      "facilitator_script": "string",',
      '      "delivery_steps": "string",',
      '      "exercise": "string",',
      '      "self_assessment_activity": "string",',
      '      "exercise_facilitator_guidance": "string",',
      '      "debrief_notes": "string",',
      '      "reflection_prompt": "string",',
      '      "review_questions": ["string", "string"],',
      '      "follow_up_practice": "string"',
      "    }",
      "  ],",
      '  "closing_encouragement": "string"',
      "}",
      "",
      "Requirements:",
      "- Provide exactly 4 modules.",
      "- Provide exactly 4 learning outcomes.",
      "- review_questions must be an array of 2 to 5 strings.",
      "- bullets must be an array of 3 to 5 strings.",
      "- Use UK English throughout.",
      "- Make the course practical and teachable.",
      "- Return JSON only.",
    ].join("\n");

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = response.output_text || "";
    const parsed = extractJsonObject(raw);

    if (!parsed) {
      return NextResponse.json(
        {
          error: "AI did not return valid JSON",
          raw: raw.slice(0, 3000),
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
        ? parsed.learning_outcomes
            .map((x: any) => String(x || "").trim())
            .filter(Boolean)
            .slice(0, 4)
        : [],
      sections: Array.isArray(parsed?.modules)
        ? parsed.modules.slice(0, 4).map((m: any) => ({
            title: String(m?.title || "").trim(),
            summary: String(m?.summary || "").trim(),
            bullets: Array.isArray(m?.bullets)
              ? m.bullets
                  .map((x: any) => String(x || "").trim())
                  .filter(Boolean)
                  .slice(0, 5)
              : [],
            key_concepts_explained: String(
              m?.key_concepts_explained || ""
            ).trim(),
            main_points: String(m?.main_points || "").trim(),
            worked_examples: String(m?.worked_examples || "").trim(),
            instructor_notes: String(m?.instructor_notes || "").trim(),
            facilitator_script: String(m?.facilitator_script || "").trim(),
            delivery_steps: String(m?.delivery_steps || "").trim(),
            exercise: String(m?.exercise || "").trim(),
            self_assessment_activity: String(
              m?.self_assessment_activity || ""
            ).trim(),
            exercise_facilitator_guidance: String(
              m?.exercise_facilitator_guidance || ""
            ).trim(),
            debrief_notes: String(m?.debrief_notes || "").trim(),
            reflection_prompt: String(m?.reflection_prompt || "").trim(),
            review_questions: Array.isArray(m?.review_questions)
              ? m.review_questions
                  .map((x: any) => String(x || "").trim())
                  .filter(Boolean)
                  .slice(0, 5)
              : [],
            follow_up_practice: String(m?.follow_up_practice || "").trim(),
          }))
        : [],
      closing_encouragement: String(parsed?.closing_encouragement || "").trim(),
    };

    if (
      !normalised.title ||
      normalised.learning_outcomes.length === 0 ||
      normalised.sections.length === 0
    ) {
      return NextResponse.json(
        {
          error: "AI returned incomplete course JSON",
          raw: raw.slice(0, 3000),
        },
        { status: 500 }
      );
    }
if (userId) {
  await logUsage(userId, "course_generation");
}
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
