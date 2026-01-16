import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Body = {
  token: string;
  pageId: string;
  organisationId?: string | null;
};

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[fb-connect-page] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;

    const token = String(body.token || "").trim();
    const pageId = String(body.pageId || "").trim();

    if (!token) {
      return NextResponse.json({ success: false, error: "Missing token" }, { status: 400 });
    }
    if (!pageId) {
      return NextResponse.json({ success: false, error: "Missing pageId" }, { status: 400 });
    }

    const organisationId =
      (body.organisationId && String(body.organisationId).trim()) ||
      (await getSingleTenantOrganisationId());

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found" },
        { status: 400 }
      );
    }

    // ✅ Use user token to fetch page name + page access token
    const graphUrl =
      "https://graph.facebook.com/v24.0/" +
      encodeURIComponent(pageId) +
      "?" +
      new URLSearchParams({
        fields: "id,name,access_token",
        access_token: token,
      }).toString();

    const pageRes = await fetch(graphUrl, { method: "GET", cache: "no-store" });
    const pageJson: any = await pageRes.json().catch(() => null);

    if (!pageRes.ok || !pageJson?.id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load Facebook Page details. Usually: token issue or missing Page access.",
          details: pageJson,
        },
        { status: 400 }
      );
    }

    const pageName = String(pageJson.name || "Facebook Page");
    const pageAccessToken = String(pageJson.access_token || "").trim();

    if (!pageAccessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Facebook did not return a Page access token. Usually: missing pages_show_list / Page access not granted.",
          details: pageJson,
        },
        { status: 400 }
      );
    }

    // ✅ Store into social_accounts (you already have these columns)
    // Columns: id, organisation_id, platform, page_id, page_name, connection_type, make_webhook_url, is_active, created_at
    const upsertPayload: any = {
      organisation_id: organisationId,
      platform: "facebook",
      page_id: pageId,
      page_name: pageName,
      connection_type: "facebook_oauth",
      is_active: true,
      // keep make_webhook_url as-is if you already use it elsewhere
    };

    // If you have a dedicated secrets table later, move pageAccessToken there.
    // For now, store it inside page_id/page_name only? (Not ideal)
    // ✅ Minimal safe approach: stash token in page_name meta would be wrong.
    // We'll store it in social_accounts.meta if you have it; otherwise skip persisting.
    // If you DO have a column like "access_token", add it here.
    // upsertPayload.access_token = pageAccessToken;

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("platform", "facebook")
      .limit(1);

    if (existingErr) {
      console.error("[fb-connect-page] lookup error", existingErr);
    }

    let saved;
    if (existing && existing.length > 0) {
      const id = existing[0].id;
      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .update(upsertPayload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("[fb-connect-page] update error", error);
        return NextResponse.json(
          { success: false, error: "Failed to save connection", details: error },
          { status: 500 }
        );
      }
      saved = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .insert(upsertPayload)
        .select()
        .single();

      if (error) {
        console.error("[fb-connect-page] insert error", error);
        return NextResponse.json(
          { success: false, error: "Failed to save connection", details: error },
          { status: 500 }
        );
      }
      saved = data;
    }

    return NextResponse.json({
      success: true,
      organisationId,
      pageId,
      pageName,
      saved,
      // We deliberately do NOT return the page token to the browser.
    });
  } catch (e: any) {
    console.error("[fb-connect-page] unexpected", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
