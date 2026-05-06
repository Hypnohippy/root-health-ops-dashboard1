import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { targetId, messageType = "next_best_message" } = await req.json();

    if (!targetId) {
      return NextResponse.json(
        { success: false, error: "Missing target id." },
        { status: 400 }
      );
    }

    const { data: target, error } = await supabaseAdmin
      .from("growth_targets")
      .select("*")
      .eq("id", targetId)
      .single();

    if (error || !target) {
      return NextResponse.json(
        { success: false, error: error?.message || "Target not found." },
        { status: 404 }
      );
    }

    const prompt = `
You are David Prince's calm, intelligent B2B outreach assistant for Root Health Ops.

Create a client-specific message.

TARGET:
Name: ${target.target_name}
Company: ${target.company || "Unknown"}
Role: ${target.role_title || "Unknown"}
Notes: ${target.notes || "None"}
Reply status: ${target.reply_status || "no_reply"}
Reply notes: ${target.reply_notes || "None"}
Outreach stage: ${target.stage || "connection"}
Deal stage: ${target.deal_stage || "lead"}
Call date: ${target.call_date || "None"}

MESSAGE TYPE:
${messageType}

RULES:
- UK tone
- Warm, professional, non-pushy
- No hype
- No emojis
- Make it feel written by David
- Use the person's first name naturally
- Keep it concise
- If it is an email, include subject line and body
- If it is LinkedIn, keep it short enough for LinkedIn
- Do not mention AI
- Do not invent facts

Return only the finished message.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.3-chat-latest",
      messages: [{ role: "user", content: prompt }],
    });

    const message = completion.choices[0].message?.content || "";

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
