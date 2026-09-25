import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const pillars = [
  "Founder story (personal, reflective, non-salesy)",
  "Platform depth (explain the saved primary offer)",
  "Market insight (speak to the saved customer audience)",
];

function getPillar(day: number) {
  return pillars[day % pillars.length];
}

export const POST = withTenantRoute(async function POST(req: Request, tenant) {
  try {
    const { day = 1, target = tenant.profile?.customers.audience || "the saved audience" } = await req.json();

    const pillar = getPillar(day);

    const prompt = `
You are a world-class LinkedIn growth strategist.

Create a DAILY growth pack for a founder growing the supplied business.

RULES:
- Tone: human, reflective, intelligent, never salesy
- Audience: ${target}
- No hype, no cringe, no emojis
- Do not invent lived experience; label hypothetical examples
- Return valid JSON only
- No markdown
- No explanation outside JSON

JSON SHAPE:
{
  "linkedin_post": "string",
  "connection_messages": ["string"],
  "dm_message": "string",
  "follow_up_message": "string",
  "seo_article": {
    "title": "string",
    "outline": ["string"]
  }
}

CONTENT:
1. LinkedIn post based on: ${pillar}
2. 10 connection message variations under 300 characters
3. One post-connection DM
4. One soft follow-up
5. One SEO article title and outline
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      messages: [...tenant.messages,{ role: "user", content: prompt }],
    });

    const text = completion.choices[0].message?.content || "{}";

    let parsed: any;

    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "AI returned text that was not valid JSON.",
          raw: text,
        },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("growth_plans")
      .insert({
        organisation_id: tenant.organisationId,
        day_number: day,
        target,
        linkedin_post: parsed.linkedin_post || "",
        connection_messages: parsed.connection_messages || [],
        dm_message: parsed.dm_message || "",
        follow_up_message: parsed.follow_up_message || "",
        seo_article: parsed.seo_article || {},
        raw_output: parsed,
        status: "generated",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      data: parsed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
