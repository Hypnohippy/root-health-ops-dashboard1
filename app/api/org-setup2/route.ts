// app/api/org-setup2/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUserId } from "@/lib/supabaseServer";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// 🔹 Replace this with your real Supabase user ID from Auth → Users
const FALLBACK_OWNER_ID = "e83aeab8-69bf-4405-b34f-c13c6fa4bfd5";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const orgName = (form.get("orgName") as string | null)?.trim();
    let orgSlug = (form.get("orgSlug") as string | null)?.trim();

    if (!orgName) {
      return NextResponse.json(
        { error: "Organisation name is required." },
        { status: 400 }
      );
    }

    if (!orgSlug) {
      orgSlug =
        orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8);
    }

    // Try to get the logged-in user; if that fails, fall back
    let ownerId = FALLBACK_OWNER_ID;
    try {
      const userId = await getCurrentUserId();
      if (userId) {
        ownerId = userId;
      }
    } catch {
      // ignore, we'll use fallback
    }

    if (!ownerId || ownerId === "REPLACE_WITH_YOUR_SUPABASE_USER_ID") {
      return NextResponse.json(
        {
          error:
            "Server not configured with an owner_id. Please update FALLBACK_OWNER_ID in app/api/org-setup2/route.ts.",
        },
        { status: 500 }
      );
    }

    // Insert with owner_id to satisfy NOT NULL constraint
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organisations")
      .insert({
        name: orgName,
        slug: orgSlug,
        owner_id: ownerId,
      })
      .select("*")
      .single();

    if (orgError) {
      console.error("[org-setup2] organisation insert error", orgError);
      return NextResponse.json(
        {
          error: `Failed to insert organisation: ${
            (orgError as any).message ?? String(orgError)
          }`,
        },
        { status: 500 }
      );
    }

    const orgId = (org as any).id;

    if (!orgId) {
      return NextResponse.json(
        {
          error:
            "Organisation created but no id returned from database. Please contact support.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        organisation: {
          id: orgId,
          name: orgName,
          slug: orgSlug,
          owner_id: ownerId,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[org-setup2] unexpected error", err);
    return NextResponse.json(
      {
        error: `Unexpected error in org-setup2: ${err?.message ?? String(err)}`,
      },
      { status: 500 }
    );
  }
}
