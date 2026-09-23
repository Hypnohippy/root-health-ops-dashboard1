import { requireLegacyFacebookOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/facebook-post/route.ts
// This API route simply forwards data from the Ops app to your Make webhook.
// Make then handles posting to Facebook (Fuel Geist).

export async function POST(req: Request) {
  try {
    const { organisationId } = await requireLegacyFacebookOrganisation();
    // Read the Make webhook URL from your environment variables
    const webhookUrl =
      process.env.MAKE_FB_WEBHOOK_URL ||
      process.env.FACEBOOK_WEBHOOK_URL; // fallback if you used a different name

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "Missing MAKE_FB_WEBHOOK_URL / FACEBOOK_WEBHOOK_URL env var in Vercel",
        }),
        { status: 500 }
      );
    }

    // Get the JSON body sent from the frontend (your post content)
    const body = await req.json();

    // Forward this body to Make
    const makeResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, organisationId, organisation_id: organisationId }),
    });

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
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("Error in /api/facebook-post:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || "Unknown error",
      }),
      { status: 500 }
    );
  }
}
