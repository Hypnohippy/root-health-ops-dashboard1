import { NextRequest, NextResponse } from "next/server";

/** Healthcheck: visit /api/ai/campaign to confirm the route exists */
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai/campaign" });
}

/** Ad-copy generator: returns JSON { variants: [{primary_text, headline}, ...] } */
export async function POST(req: NextRequest) {
  try {
    const {
      platform,
      objective,
      url,
      audienceKeywords,
      brandVoice = "Root Health founder",
    } = await req.json();

    const prompt = `
You are a senior PERFORMANCE MARKETING copywriter writing for ${brandVoice}.
We are creating **AD-STYLE** copy, not comments and not therapy.

CONTEXT:
- Platform: ${platform}
- Objective: ${objective}
- Landing page: ${url}
- Audience: people navigating stress/burnout who want practical, hopeful help.
- Audience keywords: ${audienceKeywords}

TASK:
Generate 3 DISTINCT ad variants for this campaign.

Each variant MUST follow this exact layout **inside PRIMARY_TEXT**:

1. HOOK line (1 short sentence, can use 1–2 emojis).
2. Blank line.
3. "Before" section with ❌ bullets (2–4 bullets).
4. Blank line.
5. "After" section with ✅ bullets (2–4 bullets).
6. Blank line.
7. CTA line starting with something like:
   - "👉"
   - "Tap to…"
   - "Start your…"
   - "Find out…"

PRIMARY_TEXT FORMAT (example structure):
"Feeling like you're running on fumes every day? 🔋

❌ Before:
• Struggle to switch off at night
• Live on autopilot and say yes to everything
• Body feels tense even on 'rest' days

✅ After:
• Clearer head and calmer evenings
• Small pockets of time that actually feel like yours
• Simple steps that respect your nervous system

👉 Start your Root Health reset and see your stress patterns in one place."

HEADLINE RULES:
- 4–8 words
- Scroll-stopping
- Clear benefit or identity (e.g. "See Your Stress Patterns Clearly", "Feel Like Yourself Again").

OBJECTIVE TUNING:
- Leads: urgency + value + trust ("Get your plan", "Start your reset").
- Traffic: curiosity + benefit + softer CTA ("Learn more inside").
- Awareness: bold promise + identity ("You are not 'too sensitive'").

GENERAL RULES:
- NO therapy-style apologies (no "I'm sorry you're feeling...").
- NO reflective questions like a coach ("What might be causing this...?").
- This is **ad copy** – specific, hopeful, commercial but still kind.
- Emojis are allowed, but 3–5 max per variant.

Return ONLY valid JSON with exactly this shape:
{
  "variants": [
    { "primary_text": "string", "headline": "string" },
    { "primary_text": "string", "headline": "string" },
    { "primary_text": "string", "headline": "string" }
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
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write high-converting AD copy (not comments, not therapy). Output strictly JSON, no extra text.",
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
}
