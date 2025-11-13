import { NextRequest, NextResponse } from "next/server";

/** Healthcheck: visit /api/ai/campaign to confirm the route exists */
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai/campaign" });
}

/** Strict ad-copy generator: returns JSON { variants: [{primary_text, headline}, ...] } */
export async function POST(req: NextRequest) {
  try {
    const { platform, objective, url, audienceKeywords, brandVoice = "Root Health founder" } = await req.json();

    const prompt = `
You are a senior PERFORMANCE MARKETING copywriter for ${brandVoice}.
Task: Generate 3 DISTINCT ad variants for ${platform} with objective ${objective}.
Audience: people navigating stress/burnout who want practical, hopeful help.
Style: punchy, specific, motivating; NEVER apologetic; NEVER clinical; NOT a therapist reply.
CTA: clear, action-oriented; suitable for ads.

VERY IMPORTANT RULES:
- DO NOT write supportive replies like "I'm sorry you're feeling..." or "What you're experiencing..."
- DO NOT ask reflective questions; this is not a comment reply.
- Keep PRIMARY_TEXT to 2–4 short sentences (hook first).
- HEADLINE: 4–8 words, scroll-stopping.
- Include ONE clear benefit + ONE CTA in PRIMARY_TEXT.
- Align to objective:
  - Leads: urgency + value + trust ("Get your plan")
  - Traffic: curiosity + benefit + soft CTA ("Learn more")
  - Awareness: bold promise + identity ("Feel like yourself again")

Landing page: ${url}
Audience keywords: ${audienceKeywords}

Return ONLY valid JSON with exactly this shape:
{
  "variants": [
    { "primary_text": "...", "headline": "..." },
    { "primary_text": "...", "headline": "..." },
    { "primary_text": "...", "headline": "..." }
  ]
}
    `.trim();

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You write high-converting ad copy. NEVER produce therapy-style replies. Output strictly JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const raw = await res.json();
    if (!res.ok) return NextResponse.json({ error: raw.error?.message || "AI request failed" }, { status: res.status });

    let payload: any;
    try {
      const content = raw.choices?.[0]?.message?.content || "{}";
      payload = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "AI returned non-JSON content" }, { status: 500 });
    }

    if (!payload?.variants || !Array.isArray(payload.variants) || payload.variants.length === 0) {
      return NextResponse.json({ error: "AI returned no variants" }, { status: 500 });
    }

    const variants = payload.variants.slice(0,3).map((v: any) => ({
      primary_text: String(v.primary_text || "").trim(),
      headline: String(v.headline || "").trim(),
    }));

    return NextResponse.json({ variants });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
