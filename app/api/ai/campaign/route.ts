import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextRequest, NextResponse } from "next/server";

/** Healthcheck: visit /api/ai/campaign to confirm the route exists */
export const GET = withTenantRoute(async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai/campaign" });
}, { generation: false, write: false });

/**
 * Performance ad generator:
 * POST body:
 * {
 *   platform: string;
 *   objective: "Leads" | "Traffic" | "Awareness";
 *   url: string;
 *   audienceKeywords: string;
 *   brandVoice?: string;
 *   lengthMode?: "short" | "medium" | "long";
 * }
 *
 * Returns:
 * { variants: [{ primary_text, headline }, ...] }
 */
export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {
    const {
      platform,
      objective,
      url,
      audienceKeywords,
      brandVoice = tenant.profile?.voice.tone || "clear and practical",
      lengthMode = "medium",
    } = await req.json();

    const prompt = `
Create 3 distinct performance-ad variants for the business in the saved context.
Platform: ${platform}
Objective: ${objective}
Landing page: ${url || tenant.profile?.offer.destinationUrl || "Not supplied"}
Audience keywords: ${audienceKeywords || tenant.profile?.customers.audience || "Not supplied"}
Brand voice: ${brandVoice}
Length: ${lengthMode === "short" ? "2–4 sentences" : lengthMode === "long" ? "250–450 words" : "120–220 words"}.
Use a clear hook, a relevant customer problem, supported features/benefits and an
appropriate next step using the saved CTA when it fits. Do not invent studies,
statistics, urgency, prices, transformations, product features or testimonials.
Vary the angles: practical, customer-focused and informative. Headlines: 4–9 words.
Return ONLY JSON:
{"variants":[{"primary_text":"string","headline":"string"},{"primary_text":"string","headline":"string"},{"primary_text":"string","headline":"string"}]}
`.trim();

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        top_p: 0.95,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [...tenant.messages,
          {
            role: "system",
            content:
              "You write high-converting performance ads (not comments). Output strictly JSON matching the requested schema.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const raw = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: raw.error?.message || "AI request failed" },
        { status: res.status }
      );
    }

    let payload: any;
    try {
      const content = raw.choices?.[0]?.message?.content || "{}";
      payload = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "AI returned non-JSON content" },
        { status: 500 }
      );
    }

    if (
      !payload?.variants ||
      !Array.isArray(payload.variants) ||
      payload.variants.length === 0
    ) {
      return NextResponse.json(
        { error: "AI returned no variants" },
        { status: 500 }
      );
    }

    const variants = payload.variants.slice(0, 3).map((v: any) => ({
      primary_text: String(v.primary_text || "").trim(),
      headline: String(v.headline || "").trim(),
    }));

    return NextResponse.json({ variants });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
