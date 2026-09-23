import { withTenantRoute } from "@/lib/tenantRoute.server";
// app/api/ai/story-series/route.ts
import { NextRequest, NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment variables");
}

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "OPENAI_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = await req.json();

    const {
      idea,
      storyType = "Problem → Solution → Success",
      tone = "Inspirational & human",
      seriesLength = 3,
      platform = "linkedin",
      ctaStyle = "Comment for more / next part",
    } = body || {};

    if (!idea || typeof idea !== "string" || idea.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "idea is required" },
        { status: 400 }
      );
    }

    const n =
      typeof seriesLength === "number"
        ? Math.max(1, Math.min(10, seriesLength))
        : 3;

    const prompt = `
You are a specialist in social storytelling for the supplied business and audience.
Create a high-impact story series for social media.

Inputs:
- Story type: ${storyType}
- Tone: ${tone}
- Target platform: ${platform}
- CTA style: ${ctaStyle}
- Series length: ${n}
- Seed idea / brief: ${idea.trim()}

Rules:
- Produce exactly ${n} posts as a coherent series.
- Each post must feel like a distinct "episode" (no repetition).
- Strong hook. Real human language.
- Platform-aware formatting (LinkedIn = structured & punchy, Facebook = conversational).
- Use the saved CTA/destination where appropriate; otherwise use a relevant question or leave cta empty.
- Optional: include a simple, realistic image concept.

Return STRICT JSON ONLY in this format:

{
  "posts": [
    {
      "title": "short compelling title",
      "body": "full post text with line breaks",
      "platformSuggestion": "linkedin | facebook | instagram | etc.",
      "cta": "one short CTA",
      "imagePrompt": "optional short image idea"
    }
  ]
}
`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [...tenant.messages,
          {
            role: "system",
            content:
              "You are an expert social storyteller and you output strictly valid JSON with no extra text.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.85,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("OpenAI error:", aiRes.status, errText);
      return NextResponse.json(
        { success: false, error: "AI generation failed.", details: errText },
        { status: 500 }
      );
    }

    const aiJson: any = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content?.trim() || "";

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("AI returned non-JSON:", content);
      return NextResponse.json(
        {
          success: false,
          error:
            "AI response was not valid JSON. Try again or adjust your prompt.",
        },
        { status: 500 }
      );
    }

    if (!parsed || !Array.isArray(parsed.posts)) {
      return NextResponse.json(
        { success: false, error: "AI did not return a posts array." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, posts: parsed.posts },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/ai/story-series:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
