import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

async function getHookPatterns() {
  const { data, error } = await supabaseAdmin
    .from("hook_patterns")
    .select("name, description, psychology, best_phase, examples")
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const campaignName = String(body?.name || "").trim();
    const goal = String(body?.goal || "").trim();
    const audience = String(body?.audience || "").trim();
    const notes = String(body?.notes || "").trim();

    if (!campaignName) {
      return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
    }

    const explicitConditionTopic =
      containsExplicitConditionLanguage(campaignName) ||
      containsExplicitConditionLanguage(goal) ||
      containsExplicitConditionLanguage(audience) ||
      containsExplicitConditionLanguage(notes);

    const hooks = await getHookPatterns();
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You are Root Coach, a gentle marketing strategist for therapists, coaches, and health brands.",
      "You create calm, ethical campaign journeys that do not feel salesy.",
      "Design a 4 phase campaign path using these phases exactly:",
      "1. Awareness",
      "2. Understanding",
      "3. Support",
      "4. Invitation",
      "Each phase must include:",
      "- phase",
      "- goal",
      "- why_this_works (one short plain-English explanation for non-marketers)",
      "- hook_style",
      "- hooks (3 examples)",
      "- post_ideas (2 examples)",
      "Use the supplied hook pattern library where relevant.",
      explicitConditionTopic
        ? "The user has explicitly chosen a condition/topic. You may refer to that topic carefully, respectfully, and in broad educational language without sounding diagnostic or reductive."
        : "Do not assume any diagnosis, condition, neurotype, disorder, or label unless the user explicitly asked for that topic. Default to broad, non-diagnostic language such as stress, overwhelm, focus, confidence, emotional wellbeing, work pressure, resilience, or support.",
      "Avoid writing as if all readers share the same diagnosis or label.",
      "Use UK spelling.",
      "Return only valid JSON matching the schema.",
    ].join(" ");

    const prompt = [
      `Campaign name: ${campaignName}`,
      `Goal: ${goal || "Not specified"}`,
      `Audience: ${audience || "Not specified"}`,
      `Notes: ${notes || "None"}`,
      explicitConditionTopic
        ? "Use the requested topic carefully and respectfully."
        : "Keep the campaign broad, inclusive, and non-diagnostic unless the user clearly requested otherwise.",
      "",
      "Hook pattern library:",
      JSON.stringify(hooks, null, 2),
    ].join("\n");

    const schema = {
      name: "root_coach_campaign_path",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["phases"],
        properties: {
          phases: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["phase", "goal", "why_this_works", "hook_style", "hooks", "post_ideas"],
              properties: {
                phase: { type: "string" },
                goal: { type: "string" },
                why_this_works: { type: "string" },
                hook_style: { type: "string" },
                hooks: {
                  type: "array",
                  minItems: 3,
                  maxItems: 3,
                  items: { type: "string" },
                },
                post_ideas: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: { type: "string" },
                },
              },
            },
          },
        },
      },
    } as const;

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
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
        { error: "AI did not return valid JSON", raw: raw.slice(0, 2000) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      campaign: campaignName,
      explicitConditionTopic,
      phases: Array.isArray(parsed?.phases) ? parsed.phases : [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Campaign path generation failed" },
      { status: 500 }
    );
  }
}
