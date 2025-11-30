import { NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: Request) {
  try {
    if (!OPENAI_API_KEY) {
      console.error("❌ Missing OPENAI_API_KEY in environment");
      return NextResponse.json(
        { error: "Server misconfigured: missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { messages, tone } = body;

    // messages should be an array of { role: "user" | "assistant", content: string }
    // coming from your Brainstorm UI
    const systemMessage = {
      role: "system",
      content:
        "You are a collaborative copywriting and storytelling assistant helping a founder brainstorm LinkedIn and Facebook posts. " +
        "You write in a human, vulnerable, honest voice, not salesy or hype. " +
        "You help shape series of posts that connect emotionally and gently guide people toward Root Health and its benefits.",
    };

    const conversation = [
      systemMessage,
      ...(Array.isArray(messages) ? messages : []),
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini", // or whatever model you're using elsewhere
        messages: conversation,
        temperature: tone === "bold" ? 0.9 : tone === "soft" ? 0.5 : 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Error from AI service" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Brainstorm endpoint error:", error);
    return NextResponse.json(
      { error: "Unexpected error in brainstorm endpoint" },
      { status: 500 }
    );
  }
}
