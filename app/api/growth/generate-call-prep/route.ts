import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const POST = withTenantRoute(async function POST(req: Request, tenant) {
  try {
    const { targetId } = await req.json();

    if (!targetId) {
      return NextResponse.json(
        { success: false, error: "Missing target id." },
        { status: 400 }
      );
    }

    const { data: target, error } = await supabaseAdmin
      .from("growth_targets")
      .select("*").eq("organisation_id", tenant.organisationId)
      .eq("id", targetId)
      .single();

    if (error || !target) {
      return NextResponse.json(
        { success: false, error: error?.message || "Target not found." },
        { status: 404 }
      );
    }

    const prompt = `
You are the business’s B2B sales call preparation assistant for the supplied business.

Create a concise call prep sheet.

TARGET:
Name: ${target.target_name}
Company: ${target.company || "Unknown"}
Role: ${target.role_title || "Unknown"}
Notes: ${target.notes || "None"}
Reply notes: ${target.reply_notes || "None"}
Lead quality: ${target.lead_quality || "unreviewed"}
Reply status: ${target.reply_status || "no_reply"}
Deal stage: ${target.deal_stage || "lead"}
Deal value: £${target.deal_value ?? "Not supplied"}
Call date: ${target.call_date || "Not set"}

RULES:
- UK tone
- Practical, calm, commercially useful
- No hype
- Do not invent facts
- Do not mention AI
- Focus on the saved primary offer, customer problems and desired outcomes; frame assumptions as questions

OUTPUT FORMAT:

CALL OBJECTIVE:
...

WHAT THEY MAY CARE ABOUT:
...

DISCOVERY QUESTIONS:
1.
2.
3.
4.
5.

BUSINESS ANGLE:
...

OFFER POSITIONING:
...

RISKS / OBJECTIONS:
...

SOFT CLOSE:
...
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.3-chat-latest",
      messages: [...tenant.messages,{ role: "user", content: prompt }],
    });

    return NextResponse.json({
      success: true,
      prep: completion.choices[0].message?.content || "",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
