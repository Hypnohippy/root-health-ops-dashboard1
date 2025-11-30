// app/api/ai/brainstorm/route.ts

import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type BrainstormRequest = {
  messages: ChatMessage[];
  industry?: string;
  platform?: string; // e.g. "LinkedIn", "Facebook", "Email"
  goal?: string;     // e.g. "leads", "appointments", "brand"
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BrainstormRequest;
    const { messages, industry, platform, goal } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Missing messages array" },
        { status: 400 }
      );
    }

    const systemMessage: ChatMessage = {
      role: "system",
      content: `
You are an expert marketing copywriter helping users create content for their own industry using the Root Health Ops Dashboard.

Goals:
- Brainstorm content *with* the user in a conversational way.
- Ask short clarifying questions rather than jumping straight to a final post.
- Help them create highly relevant, emotionally resonant posts for platforms like LinkedIn and Facebook.
- Optimise for 3 goals: engagement, leads, and appointments — but keep it human, honest and not "salesy".

Context:
- The app is called Root Health, but the user might be in any industry (finance, coaching, HR, tech, etc.).
- Adapt to their industry and voice.
- Offer to create: short hooks, medium posts, long story-style posts, and post series (A, B, C over time).

If the user sounds unsure, guide them with suggestions.
If they ask for a final polished post, give it to them in full, in their voice.
      `.trim(),
    };

    const contextMessage: ChatMessage = {
      role: "system",
      content: `
Extra context:
- Industry: ${industry || "not specified"}
- Platform: ${platform || "not specified"}
- Business goal: ${goal || "not specified"}

Adjust tone, length, and style based on platform and goal.
      `.trim(),
    };

    const completion = await client.chat.completions.create({
      // Use a cheaper model here
      model: "gpt-4o-mini",
      messages: [systemMessage, contextMessage, ...messages],
      temperature: 0.7,
      max_tokens: 700,
    });

    const reply = completion.choices[0]?.message;

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("Brainstorm error:", error);
    return NextResponse.json(
      { error: "Failed to generate brainstorm reply" },
      { status: 500 }
    );
  }
}
