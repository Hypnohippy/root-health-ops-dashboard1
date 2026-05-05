import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const pillars = [
  "Founder story (personal, reflective, non-salesy)",
  "Platform depth (show what Root Health Ops does)",
  "Market insight (speak to HR / wellbeing decision makers)"
];

function getPillar(day: number) {
  return pillars[day % pillars.length];
}

export async function POST(req: Request) {
  try {
    const { day = 1, target = "HR Directors UK" } = await req.json();

    const pillar = getPillar(day);

    const prompt = `
You are a world-class LinkedIn growth strategist.

Create a DAILY growth pack for a founder building a mental health platform (Root Health Ops).

RULES:
- Tone: human, reflective, intelligent, never salesy
- Audience: ${target}
- No hype, no cringe, no emojis
- Feels like lived experience, not marketing

OUTPUT:

1. LINKEDIN POST
- Based on: ${pillar}
- 150–250 words
- Strong hook
- Natural ending (no CTA push, just reflection)

2. CONNECTION MESSAGE (10 variations)
- Under 300 characters
- Personal, observational
- No selling

3. DM MESSAGE (post-connection)
- Ask a thoughtful question about their current wellbeing / EAP setup
- No pitch

4. FOLLOW-UP MESSAGE
- Soft nudge
- Very short

5. OPTIONAL SEO ARTICLE
- Title + outline only
- Topic relevant to mental health / workplace wellbeing

Return clean JSON only.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.3-chat-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const text = completion.choices[0].message?.content || "{}";

    return NextResponse.json({ success: true, data: text });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
