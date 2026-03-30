import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  logUsageForOrganisation,
  getMonthlyUsageForOrganisation,
  getPlanLimit,
  getCurrentOrganisationPlan,
  getCurrentOrganisationId,
} from "@/lib/usage";
export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const courseTitle = String(body?.courseTitle || "").trim();
    const courseAudience = String(body?.courseAudience || "").trim();
    const courseSummary = String(body?.courseSummary || "").trim();
    const learnerAudience = String(body?.learnerAudience || "").trim();
    const deliveryContext = String(body?.deliveryContext || "").trim();

    const sectionTitle = String(body?.sectionTitle || "").trim();
    const sectionSummary = String(body?.sectionSummary || "").trim();
    const sectionBullets = Array.isArray(body?.sectionBullets)
      ? body.sectionBullets.map((x: any) => String(x || "").trim())
      : [];
    const keyConceptsExplained = String(
      body?.keyConceptsExplained || ""
    ).trim();
    const mainPoints = String(body?.mainPoints || "").trim();
    const workedExamples = String(body?.workedExamples || "").trim();
    const instructorNotes = String(body?.instructorNotes || "").trim();
    const facilitatorScript = String(body?.facilitatorScript || "").trim();
    const deliverySteps = String(body?.deliverySteps || "").trim();
    const exercise = String(body?.exercise || "").trim();
    const selfAssessmentActivity = String(
      body?.selfAssessmentActivity || ""
    ).trim();
    const exerciseFacilitatorGuidance = String(
      body?.exerciseFacilitatorGuidance || ""
    ).trim();
    const debriefNotes = String(body?.debriefNotes || "").trim();
    const reflectionPrompt = String(body?.reflectionPrompt || "").trim();

    if (!sectionTitle) {
      return NextResponse.json(
        { error: "sectionTitle is required" },
        { status: 400 }
      );
    }
const organisationId = await getCurrentOrganisationId();
const userPlan = await getCurrentOrganisationPlan();

const usage = organisationId
  ? await getMonthlyUsageForOrganisation(organisationId)
  : 0;
const monthlyLimit = getPlanLimit(userPlan);
const cost = 3;

if (usage + cost > monthlyLimit) {
  return NextResponse.json(
    {
      error:
        "You’ve reached your monthly creation allowance. Upgrade to continue now, or wait until your allowance resets next month.",
    },
    { status: 403 }
  );
}
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You are an expert UK CPD facilitator, trainer, and subject-matter expert.",
      "Write in UK English only.",
      "Never use American spelling.",
      "Your job is to create elite facilitator notes that can be taken directly into class.",
      "Be concrete, specific, and practical.",
      "Do not be vague.",
      "Do not say 'introduce the concept' unless you then explain exactly what the concept is.",
      "Do not say 'discuss the technique' unless you then explain exactly how the technique works.",
      "If scripting is relevant, include realistic spoken wording the facilitator can actually say aloud.",
      "If the topic includes methods, techniques, or frameworks, explain what they are, why they work, when to use them, and common mistakes.",
      "If an exercise is mentioned, explain exactly how to set it up, run it, and debrief it.",
      "Adapt the teaching style to the learner audience and delivery context.",
      "If audience is public, use plain reassuring language.",
      "If audience is workplace teams, use practical workplace language.",
      "If audience is therapists or practitioners, use CPD-style facilitation depth.",
      "If audience is peer groups, use supportive and non-hierarchical language.",
      "Return only valid JSON.",
    ].join(" ");

    const userPrompt = [
      `Course title: ${courseTitle || "Not specified"}`,
      `Course audience: ${courseAudience || "Not specified"}`,
      `Course summary: ${courseSummary || "Not specified"}`,
      `Learner audience: ${learnerAudience || "Not specified"}`,
      `Delivery context: ${deliveryContext || "Not specified"}`,
      "",
      `Module title: ${sectionTitle}`,
      `Module summary: ${sectionSummary || "Not specified"}`,
      `Teaching bullets: ${sectionBullets.join(" | ") || "None"}`,
      `Key concepts explained: ${keyConceptsExplained || "None"}`,
      `Main points: ${mainPoints || "None"}`,
      `Worked examples: ${workedExamples || "None"}`,
      `Instructor notes: ${instructorNotes || "None"}`,
      `Facilitator script: ${facilitatorScript || "None"}`,
      `Delivery steps: ${deliverySteps || "None"}`,
      `Exercise: ${exercise || "None"}`,
      `Self-assessment activity: ${selfAssessmentActivity || "None"}`,
      `Exercise facilitator guidance: ${exerciseFacilitatorGuidance || "None"}`,
      `Debrief notes: ${debriefNotes || "None"}`,
      `Reflection prompt: ${reflectionPrompt || "None"}`,
      "",
      "Create elite facilitator notes for this one module.",
      "",
      "Return these sections:",
      "- teaching_purpose",
      "- opening_script",
      "- step_by_step_delivery_script",
      "- audience_adaptation_notes",
      "- if_participants_struggle",
      "- common_mistakes_to_avoid",
      "- short_version",
      "- extended_version",
      "- debrief_questions",
      "- take_home_message",
      "",
      "Requirements:",
      "- teaching_purpose must explain the purpose of the module in practical terms.",
      "- opening_script must contain wording the facilitator can actually say to open the module.",
      "- step_by_step_delivery_script must explain what to say and do in sequence.",
      "- audience_adaptation_notes must explain how to adjust delivery for the intended audience.",
      "- if_participants_struggle must explain what to do if engagement drops, confusion appears, or emotion surfaces.",
      "- common_mistakes_to_avoid must help the facilitator avoid poor delivery.",
      "- short_version must explain how to teach this module quickly if time is limited.",
      "- extended_version must explain how to go deeper if more time is available.",
      "- debrief_questions must include practical debrief prompts.",
      "- take_home_message must be the key message the facilitator wants participants to leave with.",
      "- Make it printable, usable, and delivery-ready.",
    ].join("\n");

    const schema = {
      name: "elite_deep_teach_section",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "teaching_purpose",
          "opening_script",
          "step_by_step_delivery_script",
          "audience_adaptation_notes",
          "if_participants_struggle",
          "common_mistakes_to_avoid",
          "short_version",
          "extended_version",
          "debrief_questions",
          "take_home_message",
        ],
        properties: {
          teaching_purpose: { type: "string" },
          opening_script: { type: "string" },
          step_by_step_delivery_script: { type: "string" },
          audience_adaptation_notes: { type: "string" },
          if_participants_struggle: { type: "string" },
          common_mistakes_to_avoid: { type: "string" },
          short_version: { type: "string" },
          extended_version: { type: "string" },
          debrief_questions: { type: "string" },
          take_home_message: { type: "string" },
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

    const eliteDeepTeachNotes = [
      "Teaching purpose",
      String(parsed?.teaching_purpose || "").trim(),
      "",
      "Opening script",
      String(parsed?.opening_script || "").trim(),
      "",
      "Step-by-step delivery script",
      String(parsed?.step_by_step_delivery_script || "").trim(),
      "",
      "Audience adaptation notes",
      String(parsed?.audience_adaptation_notes || "").trim(),
      "",
      "If participants struggle",
      String(parsed?.if_participants_struggle || "").trim(),
      "",
      "Common mistakes to avoid",
      String(parsed?.common_mistakes_to_avoid || "").trim(),
      "",
      "Short version",
      String(parsed?.short_version || "").trim(),
      "",
      "Extended version",
      String(parsed?.extended_version || "").trim(),
      "",
      "Debrief questions",
      String(parsed?.debrief_questions || "").trim(),
      "",
      "Take-home message",
      String(parsed?.take_home_message || "").trim(),
    ].join("\n\n");
if (organisationId) {
  await logUsageForOrganisation(organisationId, "elite_deep_teach");
}
    return NextResponse.json({
      success: true,
      eliteDeepTeachNotes,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Elite deep teach failed" },
      { status: 500 }
    );
  }
}
