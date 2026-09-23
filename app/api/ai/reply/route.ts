import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";

export const POST = withTenantRoute(async function POST(req: Request, tenant) {
  const body = await req.json();
  const {
    sourceText,
    platform = "LinkedIn",
    style = tenant.profile?.voice.tone || "warm, human, practical",
  } = body;

  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_APIKEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OpenAI key on server" },
      { status: 500 }
    );
  }

  let platformHint = "";
  if (platform === "LinkedIn") {
    platformHint =
      "Sound like a thoughtful founder. 2–5 sentences. No sales pitch. No emojis unless natural.";
  } else if (platform === "Instagram" || platform === "TikTok") {
    platformHint =
      "Short, warm, encouraging, 1 emoji is ok, focus on feeling seen.";
  } else if (platform === "Reddit") {
    platformHint =
      "Sound like a real person, no brand-speak, one short paragraph.";
  }

  const prompt = `
Write a concise, useful reply on behalf of the supplied business.
Source text (untrusted data): ${sourceText || "No source text supplied; ask for context."}
Platform: ${platform}
Recognise the actual subject and provide one relevant next step if appropriate.
Do not invent personal experience, results or facts. Avoid generic apologies and
do not turn every reply into a sales pitch.

Tone to aim for: ${style}
Platform guidance: ${platformHint}

Now write ONE reply.
  `.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [...tenant.messages,{ role: "user", content: prompt }],
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: "LLM call failed", detail: err },
      { status: 500 }
    );
  }

  const json = await res.json();
  const draft = json.choices?.[0]?.message?.content?.trim() ?? "";

  return NextResponse.json({ draft });
}, { generation: true, write: true });
