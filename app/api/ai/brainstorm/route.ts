import { NextResponse } from "next/server";

export const runtime = "edge"; // safe + fast on Vercel

type BrainstormMode = "single_post" | "series" | "ad_variants";

type BrainstormRequestBody = {
  messages: { role: "user" | "assistant"; content: string }[];
  mode: BrainstormMode;
  brandContext?: string;
};

const MODE_INSTRUCTIONS: Record<BrainstormMode, string> = {
  single_post: `
Write ONE highly engaging LinkedIn/Facebook post.

- Tone: human, open, not-salesy, but with a clear invitation or next step.
- Format: short paragraphs, plenty of white space.
- Include a gentle, conversational "why" behind Root Health / the work.
- End with a soft call-to-action (e.g. invite conversation, connection, or to learn more).
`,

  series: `
Write a SERIES of 3 posts that logically follow each other.

- Post 1: story + context (the vulnerability / the "why").
- Post 2: the insight, what changed, what you learned.
- Post 3: the invitation, what you're building now, and how it helps.

Output format:
[Post 1]
...text...

[Post 2]
...text...

[Post 3]
...text...

Keep it human, honest, and not too salesy.
`,

  ad_variants: `
Write 3 short ad-style variations for LinkedIn or Facebook.

- Each variation 2–5 short lines.
- Clear hook in line 1.
- One clear benefit or outcome for the reader.
- One clear CTA (book a call / learn more / message me).

Output format:
[Variant 1]
...

[Variant 2]
...

[Variant 3]
...
`,
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BrainstormRequestBody;

    const { messages, mode, brandContext } = body;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable" },
        { status: 500 }
      );
    }

    const systemPrompt = `
You are an expert marketing and storytelling assistant embedded inside the Root Health Ops dashboard.

Your job:
- Brainstorm and refine content for LinkedIn & Facebook posts.
- Help the user sound open, vulnerable, and human — not corporate.
- Always keep posts practical and grounded, not fluffy.

Brand context (if provided):
${brandContext || "No extra context provided."}

Mode instructions:
${MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.single_post}
    `.trim();

    const openAIMessages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: openAIMessages,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate content" },
        { status: 500 }
      );
    }

    const json = await response.json();
    const reply =
      json.choices?.[0]?.message?.content ||
      "Sorry, I couldn't generate a response.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Brainstorm API error:", error);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
