// app/api/org-setup2/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUserId } from "@/lib/supabaseServer";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// 🔹 Replace this with your real Supabase user ID (same one you used before)
const FALLBACK_OWNER_ID = "e83aeab8-69bf-4405-b34f-c13c6fa4bfd5";

// Simple slugify helper
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const orgName = (form.get("orgName") as string | null)?.trim();
    const providedSlug = (form.get("orgSlug") as string | null)?.trim();

    if (!orgName) {
      return NextResponse.json(
        { error: "Organisation name is required." },
        { status: 400 }
      );
    }

    // 1) Base slug: use provided, or derive from name, or random
    let baseSlug =
      providedSlug && providedSlug.length > 0
        ? slugify(providedSlug)
        : slugify(orgName);

    if (!baseSlug) {
      baseSlug = randomUUID().slice(0, 8);
    }

    // 2) Resolve owner_id (current user if possible, else fallback)
    let ownerId = FALLBACK_OWNER_ID;
    try {
      const userId = await getCurrentUserId();
      if (userId) {
        ownerId = userId;
      }
    } catch {
      // ignore, fallback is fine
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

    // Helper to insert with a given slug
    const insertWithSlug = async (slug: string) => {
      return supabaseAdmin
        .from("organisations")
        .insert({
          name: orgName,
          slug,
          owner_id: ownerId,
        })
        .select("*")
        .single();
    };

    // 3) Try inserting with baseSlug; if duplicate, try once with a suffix
    let currentSlug = baseSlug;
    let { data: org, error: orgError } = await insertWithSlug(currentSlug);

    if (
      orgError &&
      (orgError as any).message &&
      String((orgError as any).message).includes("organisations_slug_key")
    ) {
      // Slug already exists → try again with a short random suffix
      const suffix = randomUUID().slice(0, 4);
      currentSlug = `${baseSlug}-${suffix}`;
      ({ data: org, error: orgError } = await insertWithSlug(currentSlug));
    }

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
          slug: currentSlug,
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
