import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { prompt, tone, platform, mode } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const safeTone = tone || "open, honest, conversational";
    const safePlatform = platform || "LinkedIn and Facebook";
    const safeMode = mode === "single" ? "single" : "series";

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an expert B2B social content writer for LinkedIn and Facebook. " +
            "You ALWAYS respond with pure JSON (no extra commentary). " +
            'For mode = "single", respond as: {"type":"single","post":{"title":"...","body":"..."}}. ' +
            'For mode = "series", respond as: {"type":"series","posts":[{"title":"...","body":"..."},{"title":"...","body":"..."},{"title":"...","body":"..."}]}. ' +
            "The body should be ready-to-post copy: formatted with line breaks, not markdown.",
        },
        {
          role: "user",
          content: `
Platform: ${safePlatform}
Tone: ${safeTone}
Mode: ${safeMode}

User brief:
${prompt}

If mode = "series", create a 3-part narrative series:
- Part 1: hook + origin of the pain / story
- Part 2: deeper insight, turning point, what changed
- Part 3: resolution, key learnings, gentle invitation / call to action

Keep it:
- human
- vulnerable where appropriate
- not pushy, but with a clear sense of what the reader can do next (e.g. comment, DM, click through, start a conversation).
          `,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No content from AI" },
        { status: 500 }
      );
    }

    const parsed =
      typeof content === "string" ? JSON.parse(content) : JSON.parse(content[0].text);

    // Tiny sanity check so the frontend doesn't blow up if model misbehaves
    if (
      parsed.type === "series" &&
      Array.isArray(parsed.posts) &&
      parsed.posts.length > 0
    ) {
      return NextResponse.json(parsed);
    }

    if (parsed.type === "single" && parsed.post) {
      return NextResponse.json(parsed);
    }

    // Fallback: wrap in single post if format unexpected
    return NextResponse.json(
      {
        type: "single",
        post: {
          title: "Generated post",
          body: typeof content === "string" ? content : JSON.stringify(content),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Brainstorm API error:", error);
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}
