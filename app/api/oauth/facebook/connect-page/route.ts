// app/api/oauth/facebook/connect-page/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function okJson(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function norm(v: any) {
  return String(v || "").trim();
}

async function graphGet(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function getOrganisationId(): Promise<string | null> {
  const forced = norm(process.env.NEXT_PUBLIC_SINGLE_ORG_ID);
  if (forced) return forced;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

/**
 * Connect a Facebook Page:
 * Input body can be ANY of these shapes (we normalize):
 * {
 *   token: "<USER_ACCESS_TOKEN>", pageId: "<PAGE_ID>"
 * }
 * or
 * {
 *   userToken: "<USER_ACCESS_TOKEN>", page_id: "<PAGE_ID>"
 * }
 * optional:
 *   organisationId (otherwise we resolve single-tenant org)
 */
export async function POST(req: NextRequest) {
  try {
    const API_VER = "v24.0";
    const body = await req.json().catch(() => ({} as any));

    const organisationId = norm(body.organisationId) || (await getOrganisationId());
    if (!organisationId) return okJson({ success: false, error: "No organisation found." }, 400);

    const userToken = norm(body.userToken) || norm(body.token) || norm(body.access_token);
    const pageId = norm(body.pageId) || norm(body.page_id);

    if (!userToken) {
      return okJson(
        { success: false, error: "Missing user token (token/userToken)." },
        400
      );
    }
    if (!pageId) {
      return okJson(
        { success: false, error: "Missing page id (pageId/page_id)." },
        400
      );
    }

    // ✅ Fetch Page name + PAGE access token using the USER token
    const graphUrl =
      `https://graph.facebook.com/${API_VER}/${encodeURIComponent(pageId)}` +
      "?" +
      new URLSearchParams({
        fields: "id,name,access_token",
        access_token: userToken,
      });

    const r = await graphGet(graphUrl);

    if (!r.ok) {
      return okJson(
        {
          success: false,
          error:
            r.json?.error?.message ||
            "Could not fetch Page access token from Facebook.",
          details: r.json,
          hint:
            "This usually means the user token is missing permissions, or the Page selection is wrong.",
        },
        400
      );
    }

    const page_name = norm(r.json?.name) || null;
    const page_access_token = norm(r.json?.access_token) || null;

    if (!page_access_token) {
      return okJson(
        {
          success: false,
          error: "Facebook did not return a Page access token.",
          details: r.json,
          hint:
            "Ensure you granted: pages_show_list, pages_read_engagement, pages_read_user_content, pages_manage_posts, pages_manage_engagement (and business_management if applicable).",
        },
        400
      );
    }

    // ✅ Save / reactivate in Supabase
    const now = new Date().toISOString();
    const row: any = {
      organisation_id: organisationId,
      platform: "facebook",
      page_id: pageId,
      page_name,
      page_access_token,
      token_expires_at: null,
      is_active: true,
      updated_at: now,
    };

    // Try upsert first (requires unique constraint on organisation_id+platform)
    const up = await supabaseAdmin
      .from("social_accounts")
      .upsert(row, { onConflict: "organisation_id,platform" })
      .select()
      .maybeSingle();

    if (!up.error) {
      return okJson({
        success: true,
        organisationId,
        saved: true,
        socialAccount: up.data ?? null,
        note: "Facebook Page connected and token saved.",
      });
    }

    // Fallback if no unique constraint
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id: pageId,
        page_name,
        page_access_token,
        token_expires_at: null,
        is_active: true,
        updated_at: now,
      })
      .eq("organisation_id", organisationId)
      .eq("platform", "facebook")
      .select()
      .maybeSingle();

    if (!uErr && updated) {
      return okJson({
        success: true,
        organisationId,
        saved: true,
        socialAccount: updated,
        note: "Facebook saved via update fallback.",
      });
    }

    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("social_accounts")
      .insert(row)
      .select()
      .single();

    if (iErr) {
      return okJson({ success: false, error: iErr.message }, 500);
    }

    return okJson({
      success: true,
      organisationId,
      saved: true,
      socialAccount: inserted,
      note: "Facebook saved via insert fallback.",
    });
  } catch (e: any) {
    return okJson(
      { success: false, error: e?.message || "Failed to connect Facebook Page" },
      500
    );
  }
}
