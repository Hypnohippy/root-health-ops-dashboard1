// app/api/org-setup2/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

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

    // Minimal insert: just name + slug for now
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organisations")
      .insert({
        name: orgName,
        slug: orgSlug,
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
