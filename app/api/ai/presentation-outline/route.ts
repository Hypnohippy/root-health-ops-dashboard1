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

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
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
    const deliveryMode = String(body?.deliveryMode || "online").trim(); // online | in_person | hybrid

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

const organisationId = tenant.organisationId;
const userPlan = await getCurrentOrganisationPlan(tenant.organisationId);

const usage = organisationId
  ? await getMonthlyUsageForOrganisation(organisationId)
  : 0;
const monthlyLimit = getPlanLimit(userPlan);
const cost = 2;

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
      "You are an educator and marketing strategist for the business in the organisation context.",
      "Create a calm, ethical teaching-ready presentation that feels supportive, useful, and non-salesy.",
      "Follow the shared factual-claims and subject-specific safety rules.",
      explicitConditionTopic
        ? "The user has explicitly chosen a condition/topic. You may refer to that topic carefully, respectfully, and in broad educational language without sounding diagnostic or reductive."
        : "Stay within the supplied business context and requested subject; do not introduce unrelated topics.",
      "Make the content genuinely educational, not just headings.",
      "Each slide must include practical teaching content that a speaker could actually use.",
      "Speaker notes should be fuller than the on-slide bullets, but still concise and usable.",
      "Audience prompts should be gentle and optional, never intrusive.",
      "Also provide simple visual direction for each slide so the presentation can feel designed.",
      "The visual direction should be abstract, tasteful, calm, and editable.",
      "The image prompt should describe non-photorealistic background artwork or conceptual illustration, not branded assets, not copyrighted characters, and not text-heavy posters.",
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
      `Delivery mode: ${deliveryMode}`,
      "",
      "Create a teaching-ready presentation that includes:",
      "- title",
      "- objective",
      "- audience_takeaway",
      "- presentation_style",
      "- 8 slides",
      "- each slide must include:",
      "  - slide_title",
      "  - slide_goal",
      "  - 2-4 on-slide bullets",
      "  - speaker_notes",
      "  - audience_prompt",
      "  - visual_direction",
      "  - image_prompt",
      "- a closing invitation",
      "",
      "The content should contain actual educational substance, not just thin labels.",
      "For example, if the topic is anxiety, include useful broad education such as what it can look like, common pressures, supportive responses, practical next steps, and how to talk about it sensitively.",
      "",
      "If fill level is skeleton, keep speaker_notes shorter and structural.",
      "If fill level is draft, provide useful teaching content and speaker notes.",
      "If fill level is ready, provide polished, delivery-ready teaching content.",
      "",
      "If delivery mode is online, make the slides slightly lighter and include audience prompts suitable for chat or reflection.",
      "If delivery mode is in_person, allow slightly richer facilitation and discussion prompts.",
      "If delivery mode is hybrid, balance both.",
      "",
      "presentation_style should be a short phrase describing the overall visual mood, such as:",
      "- calm professional",
      "- warm supportive",
      "- grounded workplace",
      "- reflective learning",
      "",
      "visual_direction should be a short design cue for that slide, such as:",
      "- soft layered circles and calming blue-green gradient",
      "- structured workplace panels with clean corporate spacing",
      "- warm abstract shapes suggesting recovery and steadiness",
      "",
      "image_prompt should be a short prompt for tasteful slide artwork that matches the slide topic.",
    ].join("\n");

    const schema = {
      name: "business_presentation_outline",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "objective",
          "audience_takeaway",
          "presentation_style",
          "slides",
          "closing_invitation",
        ],
        properties: {
          title: { type: "string" },
          objective: { type: "string" },
          audience_takeaway: { type: "string" },
          presentation_style: { type: "string" },
          slides: {
            type: "array",
            minItems: 8,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "slide_title",
                "slide_goal",
                "bullets",
                "speaker_notes",
                "audience_prompt",
                "visual_direction",
                "image_prompt",
              ],
              properties: {
                slide_title: { type: "string" },
                slide_goal: { type: "string" },
                bullets: {
                  type: "array",
                  minItems: 2,
                  maxItems: 4,
                  items: { type: "string" },
                },
                speaker_notes: { type: "string" },
                audience_prompt: { type: "string" },
                visual_direction: { type: "string" },
                image_prompt: { type: "string" },
              },
            },
          },
          closing_invitation: { type: "string" },
        },
      },
    } as const;

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [...tenant.messages,
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

if (organisationId) {
  await logUsageForOrganisation(organisationId, "presentation_generation");
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
}, { generation: true, write: true });
