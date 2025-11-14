import { NextRequest, NextResponse } from "next/server";

/** Healthcheck */
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai/campaign/structured" });
}

/**
 * Returns JSON with sections for long-form ads:
 * {
 *   "hook": "...",
 *   "before": ["...", "..."],
 *   "after": ["...", "..."],
 *   "explainer": "...",
 *   "ctas": ["...", "..."],
 *   "button": { "label": "Find out more", "url": "https://..." }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { platform, objective, url, audienceKeywords, brandVoice = "Root Health founder" } = await req.json();

    const prompt = `
You are a senior DIRECT-RESPONSE copywriter for ${brandVoice}.
Create a STRUCTURED long-form ad for ${platform} with objective ${objective}.
Audience: people facing stress/burnout; want practical, hopeful steps.
Style: precise, motivating, benefit-led; NOT a therapist reply; no apologies.

Sections required (RETURN STRICT JSON ONLY):
- hook: 1-2 punchy lines to stop scroll.
- before: 8-10 bullet points (short) describing the "before Root Health" experience. Use crisp fragments.
- after: 8-10 bullet points (short) describing the "after Root Health" benefits/outcomes.
- explainer: 3-5 sentences explaining how Root Health works (question → discover → act), why it’s simple, and why it works.
- ctas: 2-3 concise CTA lines. Examples: "Start your plan today", "Get your personalised steps".
- button: { "label": "Find out more", "url": "${url}" }

Constraints:
- No clinical phrasing; no "I'm sorry you..." or "what you're experiencing..."
- Write bullets as short fragments (no long sentences).
- Use second-person language ("you").
- Make it platform-agnostic but performance-ready.

Audience keywords: ${audienceKeywords}

Return ONLY valid JSON with this shape:
{
  "hook": "...",
  "before": ["..."],
  "after": ["..."],
  "explainer": "...",
  "ctas": ["..."],
  "button": { "label": "...", "url": "..." }
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
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You produce performance ad structures only. Output strictly JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const raw = await res.json();
    if (!res.ok) return NextResponse.json({ error: raw.error?.message || "AI request failed" }, { status: res.status });

    let payload: any = {};
    try {
      const content = raw.choices?.[0]?.message?.content || "{}";
      payload = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "AI returned non-JSON content" }, { status: 500 });
    }

    // Minimal validation
    if (!payload.hook || !Array.isArray(payload.before) || !Array.isArray(payload.after) || !payload.explainer) {
      return NextResponse.json({ error: "Incomplete structured payload" }, { status: 500 });
    }

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
