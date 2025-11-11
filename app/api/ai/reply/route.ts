import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { sourceText, platform, style } = body;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  let platformHint = "";
  if (platform === "Reddit") {
    platformHint =
      "Sound like a real Reddit comment, friendly, no sales, short paragraph.";
  } else if (platform === "LinkedIn") {
    platformHint =
      "Professional but warm, 2-4 sentences, value-first, no hard sell.";
  } else if (platform === "Instagram" || platform === "TikTok") {
    platformHint = "Warm, encouraging, 1-2 emojis are ok.";
  }

  const prompt = `
Write a reply suitable for ${platform || "LinkedIn"}.
${platformHint}
Tone: ${style || "human, not salesy, Root Health founder vibe"}.
Reply to this content:
"""${sourceText || "User talking about stress/health"}"""
Return ONLY the reply text.
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
      temperature: 0.7,
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
