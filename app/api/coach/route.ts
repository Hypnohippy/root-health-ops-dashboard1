// app/api/coach/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // ensures server execution

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      mode = "unknown",
      stepId = "none",
      orgName = "",
      platform = "",
      errorMessage = "",
      recentStats = {},
    } = body;

    const prompt = `
You are ROOT COACH — a warm, encouraging, highly practical AI mentor inside a marketing automation app.
The user may be overwhelmed, confused, or frustrated. You NEVER blame the user.  
You ALWAYS reassure, simplify, and suggest one tiny next step.

Context of this situation:
- Mode: ${mode}
- Step: ${stepId}
- Organisation: ${orgName || "unknown org"}
- Platform: ${platform}
- Error message: ${errorMessage}
- Recent stats: ${JSON.stringify(recentStats)}

Your job:
1. Calm the user with reassurance.
2. Translate the error into human language.
3. Give ONE simple next step to fix it.
4. Encourage them with a very human, gentle tone.

Write your response in 3 short paragraphs. No technical jargon unless necessary.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 220,
      temperature: 0.7,
    });

    const message =
      completion.choices?.[0]?.message?.content ??
      "I'm here with you — let's take the next tiny step together.";

    return NextResponse.json({ message }, { status: 200 });
  } catch (err) {
    console.error("[coach] API error", err);
    return NextResponse.json(
      {
        message:
          "I couldn't load personalised coaching, but you're doing fine — try the last action again, and if it still glitches, refresh the page and we’ll take it step by step.",
      },
      { status: 200 }
    );
  }
}
