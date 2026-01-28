// app/api/responses/reply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type SocialAccountRow = {
  platform: string;
  page_id: string | null;
  page_access_token: string | null;
  is_active: boolean | null;
  organisation_id: string;
};

function okJson(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

async function loadAccount(organisationId: string, platform: string): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("platform, page_id, page_access_token, is_active, organisation_id")
    .eq("organisation_id", organisationId)
    .eq("platform", platform)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as any) ?? null;
}

async function graphPost(url: string, body: Record<string, string>) {
  const params = new URLSearchParams(body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const organisationId = String(body?.organisationId || "").trim();
    const platform = String(body?.platform || "").trim().toLowerCase();
    const externalId = String(body?.externalId || "").trim(); // comment id
    const message = String(body?.message || "").trim();

    if (!organisationId) return okJson({ success: false, error: "Missing organisationId" }, 400);
    if (!platform) return okJson({ success: false, error: "Missing platform" }, 400);
    if (!externalId) return okJson({ success: false, error: "Missing externalId (comment id)" }, 400);
    if (!message) return okJson({ success: false, error: "Reply message is empty" }, 400);

    const acct = await loadAccount(organisationId, platform);
    const token = acct?.page_access_token || null;

    if (!token) {
      return okJson(
        { success: false, error: `${platform} not connected (missing access token).` },
        401
      );
    }

    // Facebook comment reply
    if (platform === "facebook") {
      const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(externalId)}/comments`;
      const r = await graphPost(url, { message, access_token: token });

      if (!r.ok) {
        return okJson(
          { success: false, error: r.json?.error?.message || "Facebook reply failed", details: r.json },
          400
        );
      }

      // Mark replied in DB
      await supabaseAdmin
        .from("inbox_items")
        .update({ status: "replied", last_reply_text: message, last_replied_at: new Date().toISOString() })
        .eq("organisation_id", organisationId)
        .eq("platform", "facebook")
        .eq("external_id", externalId);

      return okJson({ success: true, platform: "facebook", repliedId: r.json?.id || null });
    }

    // Instagram comment reply (IG Graph)
    if (platform === "instagram") {
      const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(externalId)}/replies`;
      const r = await graphPost(url, { message, access_token: token });

      if (!r.ok) {
        return okJson(
          { success: false, error: r.json?.error?.message || "Instagram reply failed", details: r.json },
          400
        );
      }

      await supabaseAdmin
        .from("inbox_items")
        .update({ status: "replied", last_reply_text: message, last_replied_at: new Date().toISOString() })
        .eq("organisation_id", organisationId)
        .eq("platform", "instagram")
        .eq("external_id", externalId);

      return okJson({ success: true, platform: "instagram", repliedId: r.json?.id || null });
    }

    return okJson(
      {
        success: false,
        error: `Reply not implemented for platform: ${platform}`,
      },
      400
    );
  } catch (e: any) {
    return okJson({ success: false, error: e?.message || "Reply failed" }, 500);
  }
}
