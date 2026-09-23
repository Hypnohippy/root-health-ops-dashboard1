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

    const topic = String(body?.topic || body?.name || "").trim();
    const goal = String(body?.goal || "").trim();
    const audience = String(body?.audience || "").trim();
    const notes = String(body?.notes || "").trim();
    const tone = String(body?.tone || "gentle and practical").trim();
    const fillLevel = String(body?.fillLevel || "draft").trim(); // skeleton | draft | ready

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
      "You create useful worksheets for the supplied business and audience.",
      "Create a calm, ethical worksheet that feels supportive, practical, and easy to use.",
      "Follow the shared factual-claims and subject-specific safety rules.",
      explicitConditionTopic
        ? "The user has explicitly chosen a condition/topic. You may refer to that topic carefully, respectfully, and in broad educational language without sounding diagnostic or reductive."
        : "Stay within the supplied business context and requested subject; do not introduce unrelated topics.",
      "Use UK spelling.",
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
      "Create a worksheet that includes:",
      "- title",
      "- purpose",
      "- instructions",
      "- 5 reflection prompts",
      "- 3 practical action prompts",
      "- a gentle closing note",
      "",
      "If fill level is skeleton, keep it simple and structural.",
      "If fill level is draft, make it usable.",
      "If fill level is ready, make it polished and client-ready.",
    ].join("\n");

    const schema = {
      name: "business_worksheet",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "purpose",
          "instructions",
          "reflection_prompts",
          "action_prompts",
          "closing_note",
        ],
        properties: {
          title: { type: "string" },
          purpose: { type: "string" },
          instructions: { type: "string" },
          reflection_prompts: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            items: { type: "string" },
          },
          action_prompts: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: { type: "string" },
          },
          closing_note: { type: "string" },
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
      worksheet: parsed,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Worksheet generation failed" },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
