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

function clean(s: any) {
  return String(s ?? "").trim();
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
    const goal = clean(body?.goal || "Brainstorm + draft posts");
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

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = [
      "You are Root Health Ops Brainstorm Coach.",
      "Act like a friendly texting partner: riff, expand, propose angles, and ask 0–2 smart questions.",
      "UK spelling. Premium, warm, therapist-friendly.",
      "No medical diagnosis/treatment claims. No crisis advice.",
      "Return ONLY valid JSON matching the schema.",
      "",
      "Output must include:",
      "1) assistantReply: a conversational riff (not generic praise).",
      "2) questions: 0–2 clarifying questions.",
      "3) angles: 5–8 short angle bullets.",
      "4) drafts: exactly 3 draft posts, each with an imageQuery string suitable for finding a topical Commons image.",
      "",
      "IMPORTANT: The user may request 'links to pictures for each story'.",
      "You should NOT fetch links. Just provide imageQuery phrases (e.g. 'adhd workplace sticky notes desk').",
    ].join(" ");

    const userPrompt = [
      `User message: ${prompt}`,
      `Platform: ${platform}`,
      `Tone: ${tone}`,
      `Goal: ${goal}`,
      "",
      "Draft rules:",
      "- Each draft must feel distinct (different hook/angle).",
      "- Include hook, body, gentle CTA question.",
      "- Hashtags 0–6, not spammy.",
      "- suggestedMode: quick_blast OR story_series (pick what fits).",
      "- imageQuery: a short search phrase that would find a topical, relevant photo/illustration.",
      "",
      "If platform is instagram, mention that an image is needed.",
    ].join("\n");

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
              required: ["title", "text", "cta", "hashtags", "suggestedMode", "imageQuery"],
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
                imageQuery: { type: "string" },
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
        { success: false, error: "AI output was not valid JSON.", raw: raw.slice(0, 2000) },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        platform,
        tone,
        goal,
        prompt,
        ...json,
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
