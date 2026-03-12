import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

async function getHookPatterns() {
  const { data } = await supabaseAdmin
    .from("hook_patterns")
    .select("pattern_name, description, examples")
    .limit(10);

  return data || [];
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

    const hooks = await getHookPatterns();

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = `
You are Root Coach, a marketing strategist helping therapists and coaches.

You design gentle, ethical marketing journeys that do NOT feel salesy.

Your goal is to create a 4 phase campaign path:

1 Awareness
2 Understanding
3 Support
4 Invitation

Each phase should include:
- phase name
- goal
- suggested hook style
- 3 example hooks
- 2 suggested post ideas

Return ONLY JSON.
`;

    const prompt = `
Campaign name: ${campaignName}
Goal: ${goal}
Audience: ${audience}
Notes: ${notes}

Hook patterns available:
${JSON.stringify(hooks)}
`;

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    });

    const text = resp.output_text || "";

    let parsed = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "AI did not return valid JSON", raw: text.slice(0, 2000) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      campaign: campaignName,
      phases: parsed.phases || []
    });

  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Campaign path generation failed" },
      { status: 500 }
    );
  }
}
