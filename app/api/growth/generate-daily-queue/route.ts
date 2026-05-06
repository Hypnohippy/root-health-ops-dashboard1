import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function daysSince(date: string | null) {
  if (!date) return 999;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

function isDue(target: any) {
  const days = daysSince(target.last_action_at);

  if (target.stage === "connection") return true;
  if (target.stage === "day3_dm") return days >= 3;
  if (target.stage === "day10_insight") return days >= 7;
  if (target.stage === "day17_followup") return days >= 7;

  return false;
}

export async function GET() {
  try {
    const { data: targets, error } = await supabaseAdmin
      .from("growth_targets")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const dueTargets = (targets || [])
  .filter(isDue)
  .filter((t) =>
    !t.lead_quality ||
    t.lead_quality === "unreviewed" ||
    t.lead_quality === "valid"
  )
  .slice(0, 10);

    const results = [];

    for (const target of dueTargets) {
      const prompt = `
You are David Prince's calm, intelligent B2B outreach assistant for Root Health Ops.

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
- Use their first name naturally
- If stage is connection, keep under 300 characters
- If stage is later, keep concise and natural

Return only the finished message.
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.3-chat-latest",
        messages: [{ role: "user", content: prompt }],
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
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
