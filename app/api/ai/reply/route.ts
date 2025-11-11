import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const {
    sourceText,
    platform = "LinkedIn",
    style = "warm, human, founder of Root Health, practical",
  } = body;

  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_APIKEY ||
    process.env.NEXT_PUBLIC_OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OpenAI key on server" },
      { status: 500 }
    );
  }

  let platformHint = "";
  if (platform === "LinkedIn") {
    platformHint =
      "Sound like a thoughtful founder. 2–5 sentences. No sales pitch. No emojis unless natural.";
  } else if (platform === "Instagram" || platform === "TikTok") {
    platformHint =
      "Short, warm, encouraging, 1 emoji is ok, focus on feeling seen.";
  } else if (platform === "Reddit") {
    platformHint =
      "Sound like a real person, no brand-speak, one short paragraph.";
  }

  const prompt = `
You are writing as the founder of Root Health, a calm, grounded wellness product for people dealing with stress, burnout and loss of control.

User/context:
"""${sourceText || "The person is talking about stress and burnout."}"""

Write a reply suitable for ${platform}.

Rules:
- DO NOT start with "I'm sorry", "I'm sorry to hear", "Sorry that", or any apology.
- Start by recognising what's real for them (e.g. "That kind of burnout sneaks up on you..." or "What you're describing is really common when stress piles up...").
- Keep the tone human, not clinical. No corporate phrases.
- Offer ONE small, doable next step (breathing, 10-minute walk, journaling, naming stress).
- Gently point to taking back control, which is Root Health's vibe.
- Do NOT diagnose or promise outcomes.
- Keep it concise.

Tone to aim for: ${style}
Platform guidance: ${platformHint}

Now write ONE reply.
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
      temperature: 0.6,
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
