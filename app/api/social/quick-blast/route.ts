// app/api/social/quick-blast/route.ts
import { NextResponse } from "next/server";

type ChannelId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "google"
  | "email"
  | "whatsapp";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body.message !== "string") {
      return NextResponse.json(
        { error: "Invalid request body. Expected { message, channels[] }." },
        { status: 400 }
      );
    }

    const message = body.message.trim();
    const channels: ChannelId[] = Array.isArray(body.channels)
      ? body.channels
      : [];
    const origin: string = body.origin || "quick_blast_dashboard";

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    if (channels.length === 0) {
      return NextResponse.json(
        { error: "Select at least one channel." },
        { status: 400 }
      );
    }

    // Map channel → webhook URL from env vars
    const channelWebhooks: { [key in ChannelId]?: string } = {
      facebook:
        process.env.FACEBOOK_TEST_WEBHOOK_URL ||
        process.env.MAKE_FACEBOOK_QUICK_BLAST_WEBHOOK_URL,
      instagram: process.env.MAKE_INSTAGRAM_QUICK_BLAST_WEBHOOK_URL,
      linkedin: process.env.MAKE_LINKEDIN_QUICK_BLAST_WEBHOOK_URL,
      tiktok: process.env.MAKE_TIKTOK_QUICK_BLAST_WEBHOOK_URL,
      google: process.env.MAKE_GOOGLE_BUSINESS_QUICK_BLAST_WEBHOOK_URL,
      email: process.env.MAKE_EMAIL_QUICK_BLAST_WEBHOOK_URL,
      whatsapp: process.env.MAKE_WHATSAPP_QUICK_BLAST_WEBHOOK_URL,
    };

    const results: {
      channel: ChannelId;
      ok: boolean;
      error?: string;
      status?: number;
    }[] = [];

    for (const channel of channels) {
      const webhookUrl = channelWebhooks[channel];

      if (!webhookUrl) {
        results.push({
          channel,
          ok: false,
          error: `No webhook configured for ${channel}. Add the appropriate MAKE_*_QUICK_BLAST_WEBHOOK_URL env var.`,
        });
        continue;
      }

      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            channel,
            origin,
            source: "root_health_ops_dashboard",
          }),
        });

        if (!res.ok) {
          let errorText: string | undefined;
          try {
            errorText = await res.text();
          } catch {
            // ignore
          }

          results.push({
            channel,
            ok: false,
            status: res.status,
            error:
              errorText ||
              `Make webhook returned status ${res.status} for ${channel}`,
          });
        } else {
          results.push({
            channel,
            ok: true,
            status: res.status,
          });
        }
      } catch (err: any) {
        results.push({
          channel,
          ok: false,
          error:
            err?.message ||
            `Unexpected error calling Make webhook for ${channel}.`,
        });
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No channels were processed." },
        { status: 400 }
      );
    }

    const anySuccess = results.some((r) => r.ok);

    if (!anySuccess) {
      return NextResponse.json(
        {
          error: "Quick Blast failed for all selected channels.",
          results,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        results,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[social/quick-blast] Unexpected error", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected error processing Quick Blast on the server.",
      },
      { status: 500 }
    );
  }
}
