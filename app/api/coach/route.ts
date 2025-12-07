// app/api/coach/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const mode = body.mode ?? "onboarding";
    const stepId = body.stepId ?? "unknown-step";
    const orgName = body.orgName ?? "";
    const errorMessage = body.errorMessage ?? "";

    const message = `
Okay, let's take a breath.

Something in the setup just didn’t quite land, but this is usually a tiny configuration issue, not a sign that you’re doing anything wrong.

You’re in the ${mode} flow on step “${stepId}” for ${
      orgName || "your organisation"
    }. The last message said: “${
      errorMessage || "no specific error was shown"
    }”.

Here’s what I’d suggest:
- First, try that step once more from the beginning – small glitches often clear on a second pass.
- If it still fails, take a quick screenshot of the page and the error and send it to your Root Health support contact, so they can check the setup behind the scenes.

You’re doing the right thing by getting this in place – this bump is part of the process, not a verdict on you.
`.trim();

    return NextResponse.json({ message }, { status: 200 });
  } catch (err) {
    console.error("[coach] error", err);
    return NextResponse.json(
      {
        message:
          "Something glitched while fetching advice, but this is almost always fixable. Try the last step again, and if it still fails, send a quick screenshot to support.",
      },
      { status: 200 }
    );
  }
}
