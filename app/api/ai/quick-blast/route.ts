import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const PROVIDERS = [
  "facebook",
  "instagram",
  "linkedin",
  "threads",
  "tiktok",
  "google",
  "email",
  "whatsapp",
] as const;

type ProviderId = (typeof PROVIDERS)[number];

function asProviderList(input: any): ProviderId[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => String(x || "").toLowerCase().trim())
    .filter((x) => PROVIDERS.includes(x as ProviderId)) as ProviderId[];
}

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
        { error: "Missing OPENAI_API_KEY in Vercel env." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const subject = String(body?.subject ?? "").trim();
    const tone = String(body?.tone ?? tenant.profile?.voice.tone ?? "clear and helpful").trim();
    const length = String(body?.length ?? "short").trim();
    const audience = String(body?.audience ?? tenant.profile?.customers.audience ?? "customers").trim();
    const platforms = asProviderList(body?.platforms);

    if (!subject) {
      return NextResponse.json(
        { error: "subject is required" },
        { status: 400 }
      );
    }

    const explicitConditionTopic =
      containsExplicitConditionLanguage(subject) ||
      containsExplicitConditionLanguage(audience);

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You write useful, engaging social posts for the business in the organisation context.",
      "Use the saved brand tone unless a different tone is explicitly requested.",
      "Follow the shared factual-claims and subject-specific safety rules.",

      explicitConditionTopic
        ? "The user has explicitly chosen a condition/topic. You may refer to that topic carefully, respectfully, and in broad educational language without sounding diagnostic or reductive."
        : "Stay within the supplied business context and requested subject; do not introduce unrelated topics.",

      "Use UK spelling.",
      "Return ONLY valid JSON that matches the provided schema.",
    ].join(" ");

    const platformHint =
      platforms.length > 0
        ? `Target platforms: ${platforms.join(", ")}.`
        : "Target platforms: facebook and instagram.";

    const lengthHint =
      length === "long"
        ? "Aim 220–420 words."
        : length === "medium"
          ? "Aim 120–220 words."
          : "Aim 60–120 words.";

    const prompt = [
      `Subject: ${subject}`,
      `Audience: ${audience}`,
      `Tone: ${tone}`,
      platformHint,
      lengthHint,
      explicitConditionTopic
        ? "Use the requested topic carefully, without over-labelling people."
        : "Keep the language relevant to the supplied business and audience.",
      "",
      "Generate 3 distinct variants:",
      "Honour the form and tone requested in the subject or creative brief for all variants. Otherwise choose genuinely different appropriate forms, not three marketing templates.",
      "Each variant has a title and complete text. A requested story needs scene, progression, tension and resolution.",
      "Do not force hooks, numbered steps, offers, product references or engagement endings.",
      "Use an empty cta string and empty hashtags array when they do not fit the requested form; otherwise use up to 6 relevant hashtags.",
    ].join("\n");

    const schema = {
      name: "business_quick_blast",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["variants"],
        properties: {
          variants: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "text", "hashtags", "cta"],
              properties: {
                title: { type: "string" },
                text: { type: "string" },
                cta: { type: "string" },
                hashtags: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 0,
                  maxItems: 6,
                },
              },
            },
          },
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
    let json: any = null;

    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error: "AI output was not valid JSON (unexpected).",
          raw: raw.slice(0, 2000),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        subject,
        tone,
        length,
        platforms,
        explicitConditionTopic,
        ...json,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[ai/quick-blast] error", e);
    return NextResponse.json(
      { error: e?.message || "AI generator failed" },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
