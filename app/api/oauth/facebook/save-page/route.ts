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

async function fetchFbJson(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("fb_user_token")?.value || "";
    if (!token) {
      return NextResponse.json(
        { error: "Missing token cookie. Please click Connect again." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Either:
    // A) client sends pageId + pageName + pageAccessToken (if /me/accounts worked)
    // B) client sends only pageId (Quick Connect / manual), and we fetch name/token here
    const pageId = String(body?.pageId || "").trim();
    let pageName = String(body?.pageName || "").trim();
    let pageAccessToken = String(body?.pageAccessToken || "").trim();

    if (!pageId) {
      return NextResponse.json({ error: "pageId is required" }, { status: 400 });
    }

    // If not provided, fetch from Facebook using the user token cookie
    if (!pageName || !pageAccessToken) {
      const url =
        "https://graph.facebook.com/v24.0/" +
        encodeURIComponent(pageId) +
        "?" +
        new URLSearchParams({
          fields: "id,name,access_token",
          access_token: token,
        }).toString();

      const fb = await fetchFbJson(url);

      if (!fb.ok) {
        return NextResponse.json(
          {
            error:
              fb.json?.error?.message ||
              `Failed to fetch Page details from Facebook (${fb.status})`,
            details: fb.json,
          },
          { status: 400 }
        );
      }

      pageName = pageName || String(fb.json?.name || "").trim();
      pageAccessToken =
        pageAccessToken || String(fb.json?.access_token || "").trim();
    }

    if (!pageName) {
      return NextResponse.json(
        {
          error:
            "Could not determine Page name. Double-check the Page ID and try Connect again.",
        },
        { status: 400 }
      );
    }

    if (!pageAccessToken) {
      // We can still save the connection, but posting will fail without a page token.
      // In practice, this usually means Meta didn't actually grant page access.
      return NextResponse.json(
        {
          error:
            "Facebook did not return a Page access token. This usually means Page access was not granted in this login. Click Connect again and approve Page access.",
        },
        { status: 400 }
      );
    }

    const organisationId = await resolveOrganisationId(req);
    if (!organisationId) {
      return NextResponse.json({ error: "No organisation found" }, { status: 400 });
    }

    // Upsert-ish
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("platform", "facebook")
      .limit(1);

    if (lookupErr) console.error("[fb-save-page] lookup error", lookupErr);

    const payload: any = {
      platform: "facebook",
      page_id: pageId,
      page_name: pageName,
      connection_type: "facebook_oauth",
      make_webhook_url: null,
      is_active: true,
      page_access_token: pageAccessToken,
      token_expires_at: null, // we can add later once we store long-lived expiry
    };

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

    // Clear user token cookie after selection
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
