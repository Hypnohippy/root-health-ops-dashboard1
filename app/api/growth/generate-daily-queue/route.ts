import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isGrowthTargetDue } from "@/lib/growthOutreach";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const GET = withTenantRoute(async function GET(req: Request, tenant) {
  try {
    const { data: targets, error } = await supabaseAdmin
      .from("growth_targets")
      .select("*").eq("organisation_id", tenant.organisationId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const dueTargets = (targets || [])
  .filter(isGrowthTargetDue)
  .filter((t) =>
    !t.lead_quality ||
    t.lead_quality === "unreviewed" ||
    t.lead_quality === "valid"
  )
  .slice(0, 10);

    const results = [];

    for (const target of dueTargets) {
      const prompt = `
You are the business’s calm, intelligent B2B outreach assistant for the supplied business.

Create the next best outreach message for this LinkedIn target.

TARGET:
Name: ${target.target_name}
Company: ${target.company || "Unknown"}
Role: ${target.role_title || "Unknown"}
Notes: ${target.notes || "None"}
Reply status: ${target.reply_status || "no_reply"}
Reply notes: ${target.reply_notes || "None"}
Outreach stage: ${target.stage || "connection"}
Deal stage: ${target.deal_stage || "lead"}

RULES:
- UK tone
- Warm, professional, non-pushy
- No hype
- No emojis
- Do not mention AI
- Do not invent facts
- Ground the opener in the supplied role, company or notes when available
- Never use vague defaults such as “I noticed your work in your field”
- Do not default to a generic “thanks for connecting” pitch
- Use their first name naturally
- If stage is connection, keep under 300 characters
- If stage is later, keep concise and natural

Return only the finished message.
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.3-chat-latest",
        messages: [...tenant.messages,{ role: "user", content: prompt }],
      });

      results.push({
        id: target.id,
        target_name: target.target_name,
        company: target.company,
        role_title: target.role_title,
        linkedin_url: target.linkedin_url,
        stage: target.stage,
        message: completion.choices[0].message?.content || "",
      });
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to generate queue." }, { status: 500 });
  }
}, { generation: true, write: true });
