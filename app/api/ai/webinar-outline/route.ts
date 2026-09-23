import { withTenantRoute } from "@/lib/tenantRoute.server";
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

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const campaignName = String(body?.name || "").trim();
    const goal = String(body?.goal || "").trim();
    const audience = String(body?.audience || "").trim();
    const notes = String(body?.notes || "").trim();

    if (!campaignName) {
      return NextResponse.json(
        { error: "Campaign name is required." },
        { status: 400 }
      );
    }

    const explicitConditionTopic =
      containsExplicitConditionLanguage(campaignName) ||
      containsExplicitConditionLanguage(goal) ||
      containsExplicitConditionLanguage(audience) ||
      containsExplicitConditionLanguage(notes);

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You are an educator and marketing strategist for the supplied business and audience.",
      "Create a calm, ethical webinar or presentation outline that feels supportive, useful, and non-salesy.",
      "Follow the shared factual-claims and subject-specific safety rules.",
      explicitConditionTopic
        ? "The user has explicitly chosen a condition/topic. You may refer to that topic carefully, respectfully, and in broad educational language without sounding diagnostic or reductive."
        : "Stay within the supplied business context and requested subject; do not introduce unrelated topics.",
      "The output should suit the business and audience in the supplied context.",
      "Use UK spelling.",
      "Return only valid JSON matching the schema.",
    ].join(" ");

    const prompt = [
      `Campaign name: ${campaignName}`,
      `Goal: ${goal || "Not specified"}`,
      `Audience: ${audience || "Not specified"}`,
      `Notes: ${notes || "None"}`,
      "",
      "Create a webinar / presentation outline that includes:",
      "- title",
      "- promise",
      "- audience_takeaway",
      "- 5 sections",
      "- each section should have a title and 2 bullet points",
      "- a gentle closing invitation",
    ].join("\n");

    const schema = {
      name: "business_webinar_outline",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "promise", "audience_takeaway", "sections", "closing_invitation"],
        properties: {
          title: { type: "string" },
          promise: { type: "string" },
          audience_takeaway: { type: "string" },
          sections: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "bullets"],
              properties: {
                title: { type: "string" },
                bullets: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: { type: "string" },
                },
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

    return NextResponse.json({
      success: true,
      explicitConditionTopic,
      outline: parsed,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Webinar outline generation failed" },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
