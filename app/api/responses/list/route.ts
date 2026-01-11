// app/api/responses/list/route.ts
import { NextResponse } from "next/server";

/**
 * Phase 3 scaffold: Responses Inbox
 *
 * This endpoint exists so the Responses page can load safely.
 * For now it returns an empty list (no inbox wired yet).
 *
 * Next step (later): pull real inbox items from provider API
 * or from a Supabase table like `inbox_items`.
 */
export async function GET() {
  return NextResponse.json(
    {
      success: true,
      configured: false,
      items: [],
      note:
        "Inbox is not connected yet.\n\nNext step: we’ll wire real responses (comments/mentions/messages) into this inbox.",
    },
    { status: 200 }
  );
}
