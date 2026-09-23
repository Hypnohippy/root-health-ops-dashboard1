import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Story Generator API
 *
 * POST /api/ai/story
 *
 * Body:
 * {
 *   "storyType": "personal" | "workplace" | "client" | "founder" | "day_in_life" | "series",
 *   "tone": "inspirational" | "emotional" | "corporate" | "cinematic" | "conversational" | "raw",
 *   "length": "short" | "medium" | "long",
 *   "character": "Sarah",
 *   "scenario": "a shop owner preparing for a busy weekend",
 *   "platform": "LinkedIn" | "Facebook" | "Instagram",
 *   "seriesEpisode": 1,
 *   "totalEpisodes": 5
 * }
 *
 * Returns:
 * {
 *   "variants": [
 *     { "title": "...", "story": "..." },
 *     { "title": "...", "story": "..." },
 *     { "title": "...", "story": "..." }
 *   ]
 * }
 */

export const GET = withTenantRoute(async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/ai/story",
    usage: "POST a JSON body with storyType, tone, length, character, scenario, platform, etc.",
  });
}, { generation: false, write: false });

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {
    const body = await req.json().catch(() => ({}));

    const {
      storyType = "workplace",
      tone = "inspirational",
      length = "medium",
      character,
      scenario,
      platform = "LinkedIn",
      seriesEpisode,
      totalEpisodes,
    } = body || {};

    const safeCharacter =
      typeof character === "string" && character.trim().length > 0
        ? character.trim()
        : "Alex";

    const safeScenario =
      typeof scenario === "string" && scenario.trim().length > 0
        ? scenario.trim()
        : "a clearly labelled hypothetical human story relevant to the supplied context, without requiring an offer or product";

    const safeStoryType =
      typeof storyType === "string" ? String(storyType) : "workplace";
    const safeTone = typeof tone === "string" ? String(tone) : "inspirational";
    const safeLength =
      length === "short" || length === "medium" || length === "long"
        ? length
        : "medium";
    const safePlatform =
      typeof platform === "string" ? String(platform) : "LinkedIn";

    const episodeInfo =
      typeof seriesEpisode === "number" &&
      seriesEpisode > 0 &&
      typeof totalEpisodes === "number" &&
      totalEpisodes > 1
        ? `This is part ${seriesEpisode} of a ${totalEpisodes}-episode mini-series.`
        : `This can either stand alone or be Part 1 of a mini-series.`;

    const targetLength =
      safeLength === "short"
        ? "roughly 80–120 words"
        : safeLength === "medium"
        ? "roughly 150–250 words"
        : "roughly 300–500 words with deeper build-up and reflection";

    const platformGuidance =
      safePlatform.toLowerCase() === "linkedin"
        ? `Write in a style that works on LinkedIn: a little more professional, reflective, and insight-led. Avoid emojis or use them very sparingly.`
        : safePlatform.toLowerCase() === "facebook" ||
          safePlatform.toLowerCase() === "instagram"
        ? `Write in a style that works on Facebook/Instagram: a little more emotional, human, and conversational. Emojis are allowed but use them sparingly and tastefully.`
        : `Write in a neutral, platform-agnostic style that would work on most social platforms.`;

    const prompt = `
You are a senior storyteller and content strategist for the supplied business.
Use only the saved business context and supplied facts. If no factual story is supplied,
clearly label the story as a hypothetical illustration, never a real testimonial.

REQUEST:
Generate 3 DISTINCT STORY VARIANTS for social media about:
- Story type: ${safeStoryType}
- Scenario: ${safeScenario}
- Main character name (if used): ${safeCharacter}
- Tone: ${safeTone}
- Length: ${targetLength}
- Platform: ${safePlatform}
- Series/Episode: ${episodeInfo}

EACH STORY MUST:
- Have a short, intriguing TITLE (max 8 words).
- Establish a concrete scene and let events progress through tension to a meaningful resolution.
- Follow the requested creative intent; a resolution need not be a sales success or a happy ending.
- Reference the saved business or offer only where relevant and natural.
- Never promise unsupported results or invent a real customer experience.
- Stay away from heavy graphic detail – we're aiming for emotionally resonant, not triggering.
- Produce an actual narrative, not an advert disguised as a story.
- Let the narrative ending stand. Do not require a CTA, comment invitation, offer, product, numbered steps or hashtags.
- Only add an invitation or next step if the user requests it and it fits the story.

PLATFORM ADAPTATION:
${platformGuidance}

LENGTH GUIDANCE:
- ${targetLength}
- Short = punchy, scene-focused.
- Medium = full story with one key reflection.
- Long = story + reflection + small lesson, but still story-first.

SERIES GUIDANCE:
- If the story feels episodic, you MAY add a subtle "Part 1" or "Episode 1" vibe in the title or first lines.
- If this is explicitly part of a series, you may hint that more is coming, e.g. "Tomorrow I'll share what happened next."
- Do NOT write "Episode X of Y" literally unless it feels natural.

OUTPUT FORMAT:
Return ONLY valid JSON with exactly this shape:

{
  "variants": [
    { "title": "string", "story": "full story text as a single string" },
    { "title": "string", "story": "..." },
    { "title": "string", "story": "..." }
  ]
}

- "title" should be a short hook-style title.
- "story" should include line breaks where natural, but remain a single string.
- Do NOT include markdown, bullets or hashtags in the JSON.
- Do NOT wrap the JSON in backticks or any extra text.
    `.trim();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        top_p: 0.9,
        max_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [...tenant.messages,
          {
            role: "system",
            content:
              "You are an expert narrative copywriter. You ONLY output valid JSON as instructed. You write emotionally intelligent micro-stories that are faithful to the requested creative intent and shared safety rules.",
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
        { error: "AI returned no story variants" },
        { status: 500 }
      );
    }

    const variants = payload.variants.slice(0, 3).map((v: any) => ({
      title: String(v.title || "").trim(),
      story: String(v.story || "").trim(),
    }));

    return NextResponse.json({ variants });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}, { generation: true, write: true });
