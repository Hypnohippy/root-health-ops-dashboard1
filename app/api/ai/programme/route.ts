import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

function extractJsonObject(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // keep going
  }

  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // keep going
    }
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // keep going
    }
  }

  return null;
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
    const instructorType = String(body?.instructorType || "therapist").trim();
    const learnerAudience = String(
      body?.learnerAudience || "companies or workplace teams"
    ).trim();
    const deliveryContext = String(
      body?.deliveryContext || "workplace session"
    ).trim();
    const notes = String(body?.notes || "").trim();
    const tone = String(body?.tone || "calm and professional").trim();
    const fillLevel = String(body?.fillLevel || "draft").trim();

    if (!topic) {
      return NextResponse.json(
        { error: "topic or name is required." },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You are Root Coach, an expert workplace wellbeing programme designer.",
      "Write in UK English only.",
      "Never use American spelling.",
      "Create practical, professional, well-structured workplace programmes.",
      "The output must be suitable for therapists, coaches, lifestyle coaches, and workplace trainers.",
      "Do not assume therapist-to-therapist teaching.",
      "Tailor the material to the specified instructor type, learner audience, and delivery context.",
      "For company audiences, use practical workplace language and examples.",
      "For public audiences, use accessible and non-jargon language.",
      "Avoid clinical claims, diagnosis language, or statements implying treatment or cure.",
      "Make it useful for HR, managers, wellbeing leads, and external facilitators.",
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
      "Create a 4-session programme that can be sold or delivered as a structured package.",
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
      "Rules:",
      "- Provide exactly 4 sessions/modules.",
      "- Make it feel like a coherent programme rather than unrelated lessons.",
      "- Include progression across the 4 sessions.",
      "- Make it useful for business, workplace wellbeing, and organisational delivery where relevant.",
      "- Keep it practical and delivery-ready.",
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
      title: String(parsed?.title || `${topic} Programme`).trim(),
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
          error: "AI returned incomplete programme JSON",
          raw: raw.slice(0, 3000),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      programme: normalised,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Programme generation failed" },
      { status: 500 }
    );
  }
}
