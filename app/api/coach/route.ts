// app/api/coach/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn(
    "[coach] OPENAI_API_KEY is not set. /api/coach will return a helpful fallback message."
  );
}

const client = apiKey ? new OpenAI({ apiKey }) : null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const mode = body.mode ?? "onboarding";
    const stepId = body.stepId ?? "unknown-step";
    const reason = body.reason ?? "general";
    const orgName = body.orgName ?? "";
    const industry = body.industry ?? "";
    const errorMessage = body.errorMessage ?? "";

    // If no key, return a static friendly message instead of breaking
    if (!client) {
      return NextResponse.json(
        {
          message:
            "Something didn’t quite work, but it’s probably a small configuration issue, not you. Try refreshing the page and repeating the last step. If it still doesn’t work, reach out to your Root Health support contact and share a screenshot of the error. You’re doing the right things by getting set up — don’t let this tiny bump knock you off course.",
        },
        { status: 200 }
      );
    }

    const prompt = `
You are "Root Coach", a warm, practical assistant helping therapists and coaches set up their Root Health Ops workspace.

Context:
- Mode: ${mode}
- Current step: ${stepId}
- Reason you were called: ${reason}
- Organisation name: ${orgName || "not provided"}
- Industry / focus: ${industry || "not provided"}
- Last visible error message: ${errorMessage || "not provided"}

Write a short, human response that:
1. Briefly explains in simple language what most likely went wrong (without blaming the user).
2. Gives one or two clear, concrete things they can try next (e.g. “check X”, “confirm Y in settings”, “try again from Z page”).
3. Ends with one sentence of encouragement, as if you are a calm, experienced coach who believes they can do this.

Constraints:
- Maximum 160 words.
- No code.
- No internal technical jargon; talk like you would to a thoughtful, non-technical clinic owner.
- Tone: warm, calm, competent, gently motivating.
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini", // change model if you like
      input: prompt,
    });

    const text =
      response.output[0].type === "message"
        ? response.output[0].content
            .filter((c) => c.type === "output_text")
            .map((c: any) => c.text)
            .join("\n")
        : "I’m not quite sure what happened, but it’s likely a small configuration issue. Try the last step again, and if it keeps failing, share a screenshot with support.";

    return NextResponse.json(
      {
        message: text,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[coach] error", err);
    return NextResponse.json(
      {
        message:
          "Something glitched while fetching your coach advice. The problem is most likely temporary. Try the last step once more, and if it keeps happening, send a screenshot to support so they can take a look.",
      },
      { status: 200 }
    );
  }
}
