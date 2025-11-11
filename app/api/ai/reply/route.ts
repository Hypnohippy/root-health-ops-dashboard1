import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const {
    sourceText,
    platform = "LinkedIn",
    style = "warm, human, not salesy",
  } = body;

  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_APIKEY ||
    process.env.NEXT_PUBLIC_OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing OpenAI key on server",
      },
      { status: 500 }
    );
  }

  // make the model stick to what YOU wrote
  let platformHint = "";
  if (platform === "LinkedIn") {
    platformHint =
      "Keep it professional but warm, 2-5 sentences, no hard sell. End with a gentle invitation or reflection.";
  } else if (platform === "Instagram" || platform === "TikTok") {
    platformHint = "Warmer, shorter, 1 emoji is ok.";
  } else if (platform === "Reddit") {
    platformHint =
      "Sound like a real person, no sales language, 1 short paragraph.";
  }

  const prompt = `
You are writing AS the founder of Root Health, a self-directed health/wellbeing platform.

User wrote this and wants to reply or post about it:
"""${sourceText || "no user text was provided"}"""

Your job:
1. Stay ON the topic above. Do NOT invent a different topic.
2. Acknowledge their situation (stress, health, burnout, small steps, control).
3. Offer 1 practical, doable step.
4. Speak as a human, not a marketer.
5. Do NOT diagnose, just encourage self-management and seeking help if needed.
6. Keep it suitable for ${platform}.

Style: ${style}
Platform guidance: ${platformHint}

Now write ONE reply/post.
  `.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6, // a bit tighter so it doesn't drift
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: "LLM call failed", detail: err },
      { status: 500 }
    );
  }

  const json = await res.json();
  const draft = json.choices?.[0]?.message?.content?.trim() ?? "";

  return NextResponse.json({ draft });
}
