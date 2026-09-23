import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextRequest, NextResponse } from "next/server";

/** Healthcheck */
export const GET = withTenantRoute(async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai/campaign/structured" });
}, { generation: false, write: false });

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
export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {
    const { platform, objective, url, audienceKeywords, brandVoice = tenant.profile?.voice.tone || "clear and practical" } = await req.json();

    const prompt = `
You are a senior DIRECT-RESPONSE copywriter for ${brandVoice}.
Create a STRUCTURED long-form ad for ${platform} with objective ${objective}.
Audience: use the saved audience and any supplied audience keywords.
Style: precise, motivating, benefit-led; not a conversational reply; no apologies.

Sections required (RETURN STRICT JSON ONLY):
- hook: 1-2 punchy lines to stop scroll.
- before: 8-10 bullet points (short) describing the "current customer challenges" experience. Use crisp fragments.
- after: 8-10 bullet points (short) describing the "desired customer outcomes" benefits/outcomes.
- explainer: 3-5 sentences explaining the supplied primary offer and supported benefits without inventing mechanisms or results.
- ctas: 2-3 concise CTA lines appropriate to the saved primary offer and CTA.
- button: { "label": "Find out more", "url": "${url || tenant.profile?.offer.destinationUrl || ""}" }

Constraints:
- No unnecessary jargon; no "I'm sorry you..." or "what you're experiencing..."
- Write bullets as short fragments (no long sentences).
- Use second-person language ("you").
- Adapt naturally to the selected platform.

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
        messages: [...tenant.messages,
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
}, { generation: true, write: true });
