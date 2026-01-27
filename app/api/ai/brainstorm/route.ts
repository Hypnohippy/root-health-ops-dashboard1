// app/api/ai/brainstorm/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads"
  | "reddit";

type BrainstormChatMsg = {
  role: "user" | "assistant";
  content: string;
};

type CommonsImage = {
  url: string; // direct image url (jpg/jpeg/png)
  title: string; // file title
  pageUrl: string; // file page on Commons
  licenseShortName?: string;
  licenseUrl?: string;
  attribution?: string;
};

function clean(s: any) {
  return String(s ?? "").trim();
}

/**
 * Wikimedia Commons search that returns:
 * - direct image URL (when available)
 * - file page URL
 * - license/attribution when the API provides it
 */
async function findCommonsImage(query: string): Promise<CommonsImage | null> {
  const q = clean(query);
  if (!q) return null;

  // 1) search files
  const searchUrl =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      list: "search",
      srsearch: `${q} filetype:bitmap`,
      srnamespace: "6", // File:
      srlimit: "5",
    }).toString();

  const searchRes = await fetch(searchUrl, { cache: "no-store" });
  const searchJson: any = await searchRes.json().catch(() => null);
  const first = searchJson?.query?.search?.[0];
  const title: string | null = first?.title ? String(first.title) : null;
  if (!title) return null;

  // 2) fetch imageinfo (url + extmetadata)
  const infoUrl =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "imageinfo",
      titles: title,
      iiprop: "url|extmetadata",
      iiurlwidth: "1600",
    }).toString();

  const infoRes = await fetch(infoUrl, { cache: "no-store" });
  const infoJson: any = await infoRes.json().catch(() => null);

  const pages = infoJson?.query?.pages || {};
  const page = Object.values(pages)?.[0] as any;
  const imageinfo = page?.imageinfo?.[0];
  if (!imageinfo) return null;

  const url: string | null = imageinfo?.thumburl || imageinfo?.url || null;

  // ensure it's an image link
  if (!url || !/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(url)) return null;

  const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}`;

  const meta = imageinfo?.extmetadata || {};
  const licenseShortName =
    meta?.LicenseShortName?.value
      ? String(meta.LicenseShortName.value).replace(/<[^>]+>/g, "")
      : undefined;

  const licenseUrl =
    meta?.LicenseUrl?.value
      ? String(meta.LicenseUrl.value).replace(/<[^>]+>/g, "")
      : undefined;

  const artist =
    meta?.Artist?.value
      ? String(meta.Artist.value).replace(/<[^>]+>/g, "").trim()
      : undefined;

  const credit =
    meta?.Credit?.value
      ? String(meta.Credit.value).replace(/<[^>]+>/g, "").trim()
      : undefined;

  const attribution = [artist, credit].filter(Boolean).join(" · ") || undefined;

  return {
    url,
    title,
    pageUrl,
    licenseShortName,
    licenseUrl,
    attribution,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing OPENAI_API_KEY in Vercel env." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const prompt = clean(body?.prompt);
    const platform = clean(body?.platform || "linkedin") as ProviderId;
    const tone = clean(body?.tone || "Professional & confident");
    const goal = clean(body?.goal || "Create a strong social post");
    const wantImage = Boolean(body?.wantImage);
    const history: BrainstormChatMsg[] = Array.isArray(body?.history)
      ? body.history
          .map((m: any) => ({
            role: m?.role === "assistant" ? "assistant" : "user",
            content: clean(m?.content),
          }))
          .filter((m: any) => m.content)
      : [];

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    const system = [
      "You are Root Health Ops Brainstorm Coach.",
      "Act like a friendly texting partner: you riff, expand, propose angles, and ask 1–2 smart questions.",
      "Be warm, premium, therapist-friendly. UK spelling.",
      "No medical diagnosis or treatment claims. No crisis advice.",
      "Do not mention vendors.",
      "Always produce (1) chat reply (riffing), then (2) 5–8 idea angles, then (3) 3 draft posts.",
      "Draft posts should be distinct: hook, body, gentle CTA, and optional hashtags (0–6).",
      "If the platform is instagram, remind that an image is needed for posting.",
      "Return ONLY valid JSON matching the schema.",
    ].join(" ");

    const userPrompt = [
      `User message: ${prompt}`,
      `Platform: ${platform}`,
      `Tone: ${tone}`,
      `Goal: ${goal}`,
      "",
      "Make the assistant response feel like a real conversation:",
      "- Start with an enthusiastic, specific reflection (not generic praise).",
      "- Offer 2–3 creative directions (angles) and 1–2 clarifying questions.",
      "- Then propose 5–8 angles as short bullets.",
      "- Then produce 3 draft posts ready to paste.",
      "",
      "IMPORTANT: Always return 'questions' as an array (0–2 strings). If none, return [].",
    ].join("\n");

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    // ✅ FIX: "questions" must be in required because strict=true and it's in properties.
    const schema = {
      name: "root_health_brainstorm",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["assistantReply", "questions", "angles", "drafts"],
        properties: {
          assistantReply: { type: "string" },
          questions: {
            type: "array",
            items: { type: "string" },
            minItems: 0,
            maxItems: 2,
          },
          angles: {
            type: "array",
            items: { type: "string" },
            minItems: 5,
            maxItems: 8,
          },
          drafts: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "text", "cta", "hashtags", "suggestedMode"],
              properties: {
                title: { type: "string" },
                text: { type: "string" },
                cta: { type: "string" },
                hashtags: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 0,
                  maxItems: 6,
                },
                suggestedMode: {
                  type: "string",
                  enum: ["quick_blast", "story_series"],
                },
              },
            },
          },
        },
      },
    } as const;

    const inputMsgs: any[] = [{ role: "system", content: system }];

    for (const m of history.slice(-10)) {
      inputMsgs.push({ role: m.role, content: m.content });
    }
    inputMsgs.push({ role: "user", content: userPrompt });

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: inputMsgs,
      text: { format: { type: "json_schema", ...schema } },
    });

    const raw = resp.output_text || "";
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "AI output was not valid JSON (unexpected).",
          raw: raw.slice(0, 2000),
        },
        { status: 500 }
      );
    }

    let image: CommonsImage | null = null;
    if (wantImage) {
      const q = prompt.slice(0, 120);
      image = await findCommonsImage(q);
    }

    return NextResponse.json(
      {
        success: true,
        platform,
        tone,
        goal,
        prompt,
        ...json,
        image,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[ai/brainstorm] error", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Brainstorm failed" },
      { status: 500 }
    );
  }
}
