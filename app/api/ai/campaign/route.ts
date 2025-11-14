import { NextRequest, NextResponse } from "next/server";

/** Healthcheck: visit /api/ai/campaign to confirm the route exists */
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai/campaign" });
}

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
export async function POST(req: NextRequest) {
  try {
    const {
      platform,
      objective,
      url,
      audienceKeywords,
      brandVoice = "Root Health founder",
      lengthMode = "medium",
    } = await req.json();

    const lengthInstructions =
      lengthMode === "short"
        ? `
LENGTH & DEPTH:
- SHORT format.
- 2–4 sentences total.
- Fast, punchy, highly scannable.
- Focus on hook + 1–2 pain points + 1 clear benefit + strong CTA.
`
        : lengthMode === "long"
        ? `
LENGTH & DEPTH:
- LONG format.
- 250–450 words.
- Full emotional journey:
  - Emotional hook
  - Pain + lived experience
  - Insight / "why this keeps happening"
  - How Root Health works (simple process)
  - Features & benefits
  - Gentle urgency + low-ticket reassurance
  - Strong CTA.
`
        : `
LENGTH & DEPTH:
- MEDIUM format.
- 120–220 words.
- Enough room for:
  - Emotional hook
  - Clear pain points
  - Before/after transformation
  - 2–3 key features → benefits
  - Strong CTA.
`;

    const platformTuning = `
PLATFORM TUNING:

If platform includes "Meta" or "Facebook" or "Instagram":
- More emotional, human, conversational.
- Use 2–4 emojis to support (not clutter).
- Focus on end-of-day stress, burnout, feeling "done", wanting simple steps.
- Make it feel like a supportive friend who's also very clear and action-focused.

If platform is "LinkedIn":
- More professional and outcome-focused.
- Include 1–2 stats related to stress, burnout, absenteeism or productivity.
  (Example style, adapt as needed: "Stress-related absence costs UK employers billions each year.")
- Address HR, leaders, or self-managing professionals.
- Still emotionally intelligent, but more about performance, retention, and sustainable work.

If platform is "Google":
- Shorter, more direct.
- Front-load the main benefit and who it's for.
- Strong keyword-style phrasing ("burnout recovery plan", "stress tracking", etc.).

If platform is "TikTok":
- Add a bit more energy and pattern-break language.
- Very scannable lines and strong calls to "watch", "see", "try this today".
`;

    const prompt = `
You are a senior PERFORMANCE MARKETING copywriter writing for ${brandVoice}.
You are creating AD-STYLE COPY for the Root Health app.

CONTEXT:
- Platform: ${platform}
- Objective: ${objective}
- Landing page: ${url}
- Audience: people navigating stress/burnout who want practical, hopeful help.
- Audience keywords: ${audienceKeywords}

GOAL:
We want people to think "Hell yes, this is for me" and either buy or click to learn more.
Root Health is a low-ticket, self-guided app that helps people see the roots of their stress and take small, realistic steps.

${lengthInstructions}

${platformTuning}

STRUCTURE INSIDE PRIMARY_TEXT (AD COPY):

Each PRIMARY_TEXT should:

1) Start with a strong HOOK line.
   - One short sentence.
   - May include 1–2 emojis (e.g. 😵‍💫, 🧠, 💚, 🔁, 🔍).
   - It should speak directly to the lived experience of stress, burnout, or feeling like you're "holding it all together".

2) Move into the PAIN / "BEFORE" EXPERIENCE.
   - Describe 2–4 specific ways stress shows up (can't switch off, snapping at people, brain fog, physical tension, shame about not coping).
   - Use bullet-ish formatting or short lines so it's easy to scan.
   - This can include ❌ bullets OR line-broken sentences, but must feel like real life, not generic.

3) Name the COST / IMPACT.
   - For general consumers: energy, sleep, relationships, confidence, health anxiety.
   - For LinkedIn / professionals: absenteeism, presenteeism, lower output, staff turnover, performance reviews, financial cost.
   - You can reference general "studies" or "estimates" without naming specific papers.

4) Introduce INSIGHT / "WHY" THIS HAPPENS.
   - One or two lines explaining that stress is not just "in your head" and that patterns in body, mind, habits and environment stack up.
   - This is where Root Health feels like a compassionate, smart guide.

5) Explain HOW ROOT HEALTH WORKS in simple, practical terms.
   - e.g. "Map what you're feeling", "Spot your patterns", "Build small root-level routines".
   - Mention that it's self-paced, practical, and built for people who don't have time/energy for traditional therapy right now.
   - Emphasise clarity, awareness, and tiny doable actions.

6) Highlight FEATURES → BENEFITS.
   - Features examples: body-mapping, stress dashboards, simple routines, weekly reflections, progress tracking.
   - Benefits examples: feeling less alone, seeing patterns clearly, fewer crashes, more steady days, feeling more "you".

7) Close with a CLEAR CTA that fits the objective:
   - Leads: "Start your Root Health plan today", "Get your personalised reset".
   - Traffic: "Tap to see inside", "Explore Root Health now".
   - Awareness: "Learn what your stress is trying to tell you", "See why so many people are turning to Root Health".

TONE & RULES:
- NEVER apologise or say "I'm sorry you're feeling...".
- NEVER ask reflective therapist-style questions ("What might be causing this for you?").
- This is ad copy: confident, grounded, hopeful, commercial AND caring.
- Avoid clinical jargon; speak like a real human, but with authority.
- Emojis are allowed, but 3–6 max per ad.

HEADLINE RULES:
- 4–9 words.
- Scroll-stopping.
- Clear benefit or identity.
  Examples of style:
  - "See Your Stress Patterns Clearly"
  - "A Calm Plan for Busy Brains"
  - "Support for the You That Holds It All"
  - "Cut Through Burnout Noise"

TASK:
Generate 3 DISTINCT ad variants for this campaign in the chosen length mode.
Each variant must be meaningfully different in angle (e.g. one more emotional, one more practical, one more stats/logic).

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
        temperature: 0.9,
        top_p: 0.95,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write high-converting performance ads (not comments, not therapy). Output strictly JSON matching the requested schema.",
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
