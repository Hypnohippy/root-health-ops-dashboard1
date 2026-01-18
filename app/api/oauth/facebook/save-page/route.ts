import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// Single-tenant beta mode: use the first organisation row as "the current org".
async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[fb-save-page] organisations error", error);
    return null;
  }

  if (!data || data.length === 0) {
    console.warn("[fb-save-page] No organisations found in database");
    return null;
  }

  return data[0].id as string;
}

async function resolveOrganisationId(req: NextRequest) {
  try {
    const orgFromQuery = req.nextUrl.searchParams.get("organisationId");
    if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  } catch {}
  return await getSingleTenantOrganisationId();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const pageId = String(body?.pageId || "").trim();
    const pageName = String(body?.pageName || "").trim();
    const pageAccessToken = String(body?.pageAccessToken || "").trim();

    if (!pageId || !pageName) {
      return NextResponse.json(
        { error: "pageId and pageName are required" },
        { status: 400 }
      );
    }

    const organisationId = await resolveOrganisationId(req);
    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found" },
        { status: 400 }
      );
    }

    // Upsert-ish: update if exists else insert
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("platform", "facebook")
      .limit(1);

    if (lookupErr) {
      console.error("[fb-save-page] lookup error", lookupErr);
    }

    const payload: any = {
      platform: "facebook",
      page_id: pageId,
      page_name: pageName,
      connection_type: "facebook_oauth",
      make_webhook_url: null,
      is_active: true,
    };

    // only write token if provided (we might later store it more permanently)
    if (pageAccessToken) payload.page_access_token = pageAccessToken;

    let row;

    if (existing && existing.length > 0) {
      const id = existing[0].id as string;
      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("[fb-save-page] update error", error);
        return NextResponse.json(
          { error: "Failed to update facebook social account", details: error },
          { status: 500 }
        );
      }
      row = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .insert({
          id: randomUUID(),
          organisation_id: organisationId,
          ...payload,
        })
        .select()
        .single();

      if (error) {
        console.error("[fb-save-page] insert error", error);
        return NextResponse.json(
          { error: "Failed to create facebook social account", details: error },
          { status: 500 }
        );
      }
      row = data;
    }

    // Clear the short-lived cookie now that we’re done picking
    const res = NextResponse.json({ success: true, organisationId, socialAccount: row });
    res.cookies.set("fb_user_token", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (e: any) {
    console.error("[fb-save-page] unexpected", e);
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
