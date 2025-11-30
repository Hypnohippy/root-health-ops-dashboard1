import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, mode } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      mode?: "chat" | "series";
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 }
      );
    }

    const isSeriesMode = mode === "series";

    const systemPrompt = isSeriesMode
      ? `
You are an expert marketing copywriter embedded inside the Root Health Ops dashboard.

The user and you have been brainstorming a vulnerable, human story about burnout, anxiety, recovery and why the Root Health / Fuel Geist platform exists.

Your job now is to turn the WHOLE conversation into a clear 3-part social media SERIES for LinkedIn or Facebook.

Each post should:
- Have a short, scroll-stopping TITLE.
- Be written as a STORY, not a sales pitch.
- Be open, honest, and grounded – professional but very human.
- End with **one gentle call to action** (e.g. comment, reflect, or connect).

CRITICAL:
Return ONLY valid JSON in this exact shape:

{
  "series": [
    { "title": "Post 1 title", "story": "Full text of post 1" },
    { "title": "Post 2 title", "story": "Full text of post 2" },
    { "title": "Post 3 title", "story": "Full text of post 3" }
  ]
}

Do not add markdown, backticks or explanation.
`
      : `
You are an embedded AI assistant inside the Root Health Ops dashboard.

Your job is to brainstorm with the founder about:
- burnout, anxiety, PTSD
- why Root Health / Fuel Geist exists
- how to tell vulnerable but safe stories
- how to invite people towards the app and support,
  without feeling salesy or pushy.

Reply as a warm, intelligent conversation partner.
Be concise but human. Avoid jargon.
`;

    const openaiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages,
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: openaiMessages,
    });

    const content = completion.choices[0]?.message?.content || "";

    if (!isSeriesMode) {
      // Normal chat reply
      return NextResponse.json({ reply: content });
    }

    // Series mode – we expect JSON
    try {
      const parsed = JSON.parse(content);
      if (
        !parsed ||
        !Array.isArray(parsed.series) ||
        parsed.series.length === 0
      ) {
        return NextResponse.json(
          { error: "AI did not return a valid series object" },
          { status: 500 }
        );
      }

      return NextResponse.json(parsed);
    } catch (err) {
      console.error("Failed to parse series JSON:", err, content);
      return NextResponse.json(
        { error: "Failed to parse AI response for series" },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("Brainstorm API error:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected error in brainstorm API" },
      { status: 500 }
    );
  }
}
