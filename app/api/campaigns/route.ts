import { NextRequest, NextResponse } from "next/server";

/**
 * Strict ad-copy generator for campaigns.
 * Always returns JSON: { variants: [{ primary_text, headline }] }
 * Guardrails to prevent "support reply" tone.
 */
export async function POST(req: NextRequest) {
  try {
    const { platform, objective, url, audienceKeywords, brandVoice = "Root Health founder" } = await req.json();

    const prompt = `
You are a senior performance marketing copywriter writing for ${brandVoice}.
Task: Generate ${3} distinct ad variants for ${platform} with objective ${objective}.
Audience: people navigating stress, burnout, overwhelm; they want practical, hopeful help.
Style: punchy, specific, motivating; never apologetic; never clinical; no therapist-style replies.
CTA: clear, action-oriented; suitable for ads (e.g., "Start today", "Discover how", "Try Root Health").

Rules (very important):
- DO NOT write supportive replies or acknowledgements like "I'm sorry you're feeling..." or "What you're experiencing..."
- DO NOT ask reflective questions; this is not a comment reply.
- Keep PRIMARY_TEXT to 2–4 short sentences (skimmable, hook first).
- HEADLINE must be 4–8 words, scroll-stopping, not vapid.
- Use second person ("you") or outcome framing.
- Include ONE clear benefit and ONE CTA in PRIMARY_TEXT.
- Align the objective:
  - Leads: urgency + value + trust ("Get your plan")
  - Traffic: curiosity + benefit + soft CTA ("Learn more")
  - Awareness: bold promise + identity ("Feel like yourself again")

Landing page: ${url}
Audience keywords: ${audienceKeywords}

Return ONLY valid JSON with this shape:
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
          { role: "system", content: "You write high-converting ad copy. You never produce therapy-like replies. You output strictly JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: json.error?.message || "AI request failed" }, { status: res.status });
    }

    // Parse the JSON content safely
    let payload: any;
    try {
      const content = json.choices?.[0]?.message?.content || "{}";
      payload = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "AI returned non-JSON content" }, { status: 500 });
    }

    // Basic validation
    if (!payload?.variants || !Array.isArray(payload.variants) || payload.variants.length === 0) {
      return NextResponse.json({ error: "AI returned no variants" }, { status: 500 });
    }

    // Trim fields
    const variants = payload.variants.map((v: any) => ({
      primary_text: String(v.primary_text || "").trim(),
      headline: String(v.headline || "").trim(),
    }));

    return NextResponse.json({ variants });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
