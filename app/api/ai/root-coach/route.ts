import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { context, errorMessage, userAction } = await req.json(); 

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const prompt = `
You are Root Coach, an in-app assistant for Root Health Ops Dashboard.

Context: ${context}
User action: ${userAction}
Error message: ${errorMessage}

Give the user 2–4 specific, concrete steps to debug and fix this.
Mention environment variables or Make.com webhook checks if relevant.
Answer in friendly, plain English.
    `;

    const completionRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content: "You are a concise devops/debugging assistant.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 250,
        }),
      }
    );

    if (!completionRes.ok) {
      const text = await completionRes.text();
      return NextResponse.json(
        { error: `OpenAI call failed: ${text}` },
        { status: 500 }
      );
    }

    const completionJson = await completionRes.json();
    const coachMessage =
      completionJson.choices?.[0]?.message?.content ??
      "Something went wrong generating Root Coach guidance.";

    return NextResponse.json({ coachMessage });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unexpected Root Coach error" },
      { status: 500 }
    );
  }
}
