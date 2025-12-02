// app/api/post-direct/route.ts
// This route forwards whatever the Ops app sends to your Make webhook.
// Make then posts to Facebook using its working connection.

export async function POST(req: Request) {
  try {
    // Read the webhook URL from your environment variables
    const webhookUrl =
      process.env.MAKE_FB_WEBHOOK_URL ||
      process.env.FACEBOOK_WEBHOOK_URL; // fallback if named differently

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing MAKE_FB_WEBHOOK_URL / FACEBOOK_WEBHOOK_URL env var",
        }),
        { status: 500 }
      );
    }

    // Read the JSON body from the request (whatever your frontend sends)
    const body = await req.json();

    // Forward it to Make
    const makeResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // If Make returns an error, pass it back
    if (!makeResponse.ok) {
      const text = await makeResponse.text();
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Make webhook call failed",
          details: text,
        }),
        { status: 500 }
      );
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err: any) {
    console.error("Error in /api/post-direct:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || "Unknown error",
      }),
      { status: 500 }
    );
  }
}
