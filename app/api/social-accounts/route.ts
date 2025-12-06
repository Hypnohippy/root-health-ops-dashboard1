// app/api/social-accounts/route.ts
import { NextRequest, NextResponse } from "next/server";

// Keep this in sync with ProviderId on the frontend
type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp";

type ConnectionStatus = "connected" | "disconnected" | "pending";

const allProviders: ProviderId[] = [
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "google",
  "email",
  "whatsapp",
];

// 👉 Later: replace this with Supabase query using supabaseAdmin + current org id.
export async function GET() {
  // For now: everything disconnected, no account names = safe default.
  return NextResponse.json({
    providers: allProviders.map((id) => ({
      id,
      status: "disconnected" as ConnectionStatus,
      accountName: null,
      lastSync: null,
    })),
  });
}

export async function POST(req: NextRequest) {
  // Simple stub to accept "disconnect" / "test" actions from the UI
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string | undefined;
    const providerId = body.providerId as ProviderId | undefined;

    if (!action || !providerId) {
      return NextResponse.json(
        { error: "Missing action or providerId" },
        { status: 400 }
      );
    }

    // 👉 TODO: wire to real logic:
    // - if action === "disconnect": revoke tokens / mark as disconnected in DB
    // - if action === "test": call external API or queue a test job

    // For now, just acknowledge.
    return NextResponse.json(
      {
        ok: true,
        action,
        providerId,
        message: "Stub endpoint — implement real behaviour when ready.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[social-accounts] POST error", err);
    return NextResponse.json(
      { error: "Unexpected error", details: err?.message },
      { status: 500 }
    );
  }
}
