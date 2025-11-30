import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Mode = "single" | "series";

export async function POST(req: Request) {
  try {
    const { idea, tone, platform, mode }: {
      idea: string;
      tone?: string;
      platform?: string;
      mode?: Mode;
    } = await req.json();

    const safeMode: Mode = mode === "series" ? "series" : "single";

    const systemPrompt = `
You are an expert LinkedIn and Facebook content strategist.
You help a founder brainstorm vulnerable, honest, story-driven posts
that gently lead to Root Health without sounding salesy or pushy.

Always respond ONLY as raw JSON, no extra text.
Use this exact shape:

{
  "mode": "single" | "series",
  "posts": [
    {
      "title": "string",
      "body": "string",
      "call_to_action": "string"
    }
  ]
}
`.trim();

    const userPrompt = `
Idea: ${idea}

Tone: ${tone || "open, vulnerable, hopeful, warm, not salesy"}

Platform: ${platform || "LinkedIn and Facebook"}

Mode: ${safeMode.toUpperCase()}.

If mode is "single":
- Write ONE strong post (1 title + 1 body + 1 gentle CTA).

If mode is "series":
- Write a 3-PART series (3 posts) that:
  - Feels like a connected narrative.
  - Post 1: sets the scene and problem.
  - Post 2: goes deeper into the struggle and insight.
  - Post 3: resolution, Root Health, and an invite to talk.

IMPORTANT:
- Return strictly valid JSON.
- No markdown, no explanations, no extra keys.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0].message.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // In case the model adds text around JSON, try to salvage it.
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } else {
        throw e;
      }
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Brainstorm API error:", err);
    return NextResponse.json(
      { error: "Failed to generate brainstorm content" },
      { status: 500 }
    );
  }
}
