import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  logUsageForOrganisation,
  getMonthlyUsageForOrganisation,
  getPlanLimit,
  getCurrentOrganisationPlan,
} from "@/lib/usage";
export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
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

    const sectionTitle = String(body?.sectionTitle || "").trim();
    const sectionSummary = String(body?.sectionSummary || "").trim();
    const sectionBullets = Array.isArray(body?.sectionBullets)
      ? body.sectionBullets.map((x: any) => String(x || "").trim())
      : [];
    const mainPoints = String(body?.mainPoints || "").trim();
    const instructorNotes = String(body?.instructorNotes || "").trim();
    const facilitatorScript = String(body?.facilitatorScript || "").trim();
    const deliverySteps = String(body?.deliverySteps || "").trim();
    const exercise = String(body?.exercise || "").trim();
    const exerciseFacilitatorGuidance = String(
      body?.exerciseFacilitatorGuidance || ""
    ).trim();
    const reflectionPrompt = String(body?.reflectionPrompt || "").trim();

    if (!sectionTitle) {
      return NextResponse.json(
        { error: "sectionTitle is required" },
        { status: 400 }
      );
    }
const organisationId = tenant.organisationId;
const userPlan = await getCurrentOrganisationPlan(tenant.organisationId);

const usage = organisationId
  ? await getMonthlyUsageForOrganisation(organisationId)
  : 0;
const monthlyLimit = getPlanLimit(userPlan);
const cost = 1;

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
  "You are an expert UK educator for the subject, business and audience supplied.",
  "Write in UK English only.",
  "Never use American spelling.",

  "Your job is NOT to outline teaching.",
  "Your job is to SHOW the teacher exactly what to teach and say.",

  "You must eliminate all vague instructional language.",
  "Do NOT say 'introduce', 'discuss', 'cover', 'explore', or 'facilitate' unless you immediately provide the exact content.",

  "If a concept is mentioned, define it clearly in plain English as if the teacher has never heard it before.",

  "If a technique is mentioned, you MUST:",
  "- explain what it is",
  "- explain why it works",
  "- give a step-by-step breakdown",
  "- include EXACT wording where appropriate",

  "If an exercise is mentioned, you MUST:",
  "- explain exactly how to run it",
  "- give sample instructions to participants",
  "- explain what the teacher should observe",

  "If a script is relevant (e.g. hypnosis, coaching, communication), you MUST include realistic spoken wording the teacher can actually say.",

  "If context or variation is mentioned, explain HOW the teacher adapts in different situations.",

  "You must assume the teacher is NOT an expert.",
  "Your output should allow them to teach confidently without guessing.",

  "Avoid generic filler sentences.",
  "Avoid repeating the input.",
  "Every section must contain real teaching value.",

  "Be practical, concrete, and specific.",
  "Return only valid JSON.",
].join(" ");
    const userPrompt = [
      `Course title: ${courseTitle || "Not specified"}`,
      `Course audience: ${courseAudience || "Not specified"}`,
      `Course summary: ${courseSummary || "Not specified"}`,
      "",
      `Module title: ${sectionTitle}`,
      `Module summary: ${sectionSummary || "Not specified"}`,
      `Teaching bullets: ${sectionBullets.join(" | ") || "None"}`,
      `Main points: ${mainPoints || "None"}`,
      `Instructor notes: ${instructorNotes || "None"}`,
      `Facilitator script: ${facilitatorScript || "None"}`,
      `Delivery steps: ${deliverySteps || "None"}`,
      `Exercise: ${exercise || "None"}`,
      `Exercise facilitator guidance: ${exerciseFacilitatorGuidance || "None"}`,
      `Reflection prompt: ${reflectionPrompt || "None"}`,
      "",
      "Create deep facilitator teaching notes for this one module.",
      "",
      "Return these sections:",
      "- concept_teaching_notes",
      "- step_by_step_delivery",
      "- exact_wording_examples",
      "- worked_example",
      "- common_pitfalls",
      "- debrief_guide",
      "",
      "Requirements:",
      "- concept_teaching_notes must explain the actual ideas the teacher needs to teach.",
      "- step_by_step_delivery must tell the teacher what to do in sequence.",
      "- exact_wording_examples must include sample wording where relevant.",
      "- worked_example must include a realistic example or mini case.",
      "- common_pitfalls must warn the teacher about likely mistakes or misunderstandings.",
      "- debrief_guide must explain what questions to ask afterwards and what learning to draw out.",
      "- Make it practical, teachable, and ready to print.",
    ].join("\n");

    const schema = {
      name: "deep_teach_section",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "concept_teaching_notes",
          "step_by_step_delivery",
          "exact_wording_examples",
          "worked_example",
          "common_pitfalls",
          "debrief_guide",
        ],
        properties: {
          concept_teaching_notes: { type: "string" },
          step_by_step_delivery: { type: "string" },
          exact_wording_examples: { type: "string" },
          worked_example: { type: "string" },
          common_pitfalls: { type: "string" },
          debrief_guide: { type: "string" },
        },
      },
    } as const;

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [...tenant.messages,
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
        { error: "AI did not return valid JSON", raw: raw.slice(0, 2000) },
        { status: 500 }
      );
    }

    const deepTeachNotes = [
      "Concept teaching notes",
      String(parsed?.concept_teaching_notes || "").trim(),
      "",
      "Step-by-step delivery",
      String(parsed?.step_by_step_delivery || "").trim(),
      "",
      "Exact wording examples",
      String(parsed?.exact_wording_examples || "").trim(),
      "",
      "Worked example",
      String(parsed?.worked_example || "").trim(),
      "",
      "Common pitfalls",
      String(parsed?.common_pitfalls || "").trim(),
      "",
      "Debrief guide",
      String(parsed?.debrief_guide || "").trim(),
    ].join("\n\n");
if (organisationId) {
  await logUsageForOrganisation(organisationId, "deep_teach");
}
    return NextResponse.json({
      success: true,
      deepTeachNotes,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Deep teach failed" },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
