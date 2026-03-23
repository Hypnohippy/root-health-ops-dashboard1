// app/api/org-setup2/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUserId } from "@/lib/supabaseServer";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const FALLBACK_OWNER_ID = "e83aeab8-69bf-4405-b34f-c13c6fa4bfd5";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeString(value: FormDataEntryValue | null, fallback = ""): string {
  return String(value || fallback).trim();
}

function safeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const orgName = safeString(form.get("orgName"));
    const providedSlug = safeString(form.get("orgSlug"));

    const primaryColor = safeString(form.get("primaryColor"), "#00A676");
    const secondaryColor = safeString(form.get("secondaryColor"), "#004E64");

    const logoFile = form.get("logo") as File | null;

    if (!orgName) {
      return NextResponse.json(
        { error: "Organisation name is required." },
        { status: 400 }
      );
    }

    let baseSlug =
      providedSlug && providedSlug.length > 0
        ? slugify(providedSlug)
        : slugify(orgName);

    if (!baseSlug) {
      baseSlug = randomUUID().slice(0, 8);
    }

    let ownerId = FALLBACK_OWNER_ID;
    try {
      const userId = await getCurrentUserId();
      if (userId) ownerId = userId;
    } catch {
      // fallback is fine
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

    let logoUrl = "";

    if (logoFile && logoFile.size > 0) {
      const bytes = await logoFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const fileExt =
        logoFile.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = safeFileName(
        `${baseSlug}-${randomUUID().slice(0, 8)}.${fileExt}`
      );
      const storagePath = `organisation-branding/${fileName}`;

      const upload = await supabaseAdmin.storage
        .from("resource-library-images")
        .upload(storagePath, buffer, {
          contentType: logoFile.type || "image/png",
          upsert: true,
        });

      if (upload.error) {
        return NextResponse.json(
          { error: `Failed to upload logo: ${upload.error.message}` },
          { status: 500 }
        );
      }

      const publicUrlResult = supabaseAdmin.storage
        .from("resource-library-images")
        .getPublicUrl(storagePath);

      logoUrl = String(publicUrlResult?.data?.publicUrl || "").trim();
    }

    const insertWithSlug = async (slug: string) => {
      return supabaseAdmin
        .from("organisations")
        .insert({
          name: orgName,
          slug,
          owner_id: ownerId,
          brand_name: orgName,
          brand_primary_color: primaryColor,
          brand_secondary_color: secondaryColor,
          brand_logo_url: logoUrl || null,
        })
        .select("*")
        .single();
    };

    let currentSlug = baseSlug;
    let { data: org, error: orgError } = await insertWithSlug(currentSlug);

    if (
      orgError &&
      (orgError as any).message &&
      String((orgError as any).message).includes("organisations_slug_key")
    ) {
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
          brand_name: (org as any).brand_name,
          brand_primary_color: (org as any).brand_primary_color,
          brand_secondary_color: (org as any).brand_secondary_color,
          brand_logo_url: (org as any).brand_logo_url,
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
