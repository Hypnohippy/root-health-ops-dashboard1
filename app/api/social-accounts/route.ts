// app/api/social-accounts/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads";

function asProviderId(v: any): ProviderId | null {
  const s = String(v || "").toLowerCase().trim();
  const allowed: ProviderId[] = [
    "facebook",
    "instagram",
    "tiktok",
    "linkedin",
    "google",
    "email",
    "whatsapp",
    "threads",
  ];
  return (allowed as string[]).includes(s) ? (s as ProviderId) : null;
}

// Single-tenant beta mode: use the first organisation row as "the current org".
async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[social-accounts] organisations error", error);
    return null;
  }

  if (!data || data.length === 0) {
    console.warn("[social-accounts] No organisations found in database");
    return null;
  }

  return data[0].id as string;
}

/**
 * Multi-tenant ready:
 * - If caller passes ?organisationId=..., use that
 * - otherwise fall back to single-tenant default
 */
async function resolveOrganisationId(req: Request) {
  try {
    const url = new URL(req.url);
    const orgFromQuery = url.searchParams.get("organisationId");
    if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  } catch {
    // ignore
  }

  return await getSingleTenantOrganisationId();
}

type SocialAccountRow = {
  id: string;
  organisation_id: string;
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
  connection_type: string | null;
  make_webhook_url: string | null;
  is_active: boolean | null;
  page_access_token: string | null;
  token_expires_at: string | null;
  created_at?: string | null;
};

async function fetchJson(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

/**
 * If Facebook is connected and has a page token,
 * auto-detect the linked Instagram Business account and upsert it.
 *
 * This makes Connect + Quick Blast consistent and removes the “connected here but not there” issue.
 */
async function syncInstagramFromFacebook(args: {
  organisationId: string;
  facebookRow: SocialAccountRow;
  existingInstagramRow?: SocialAccountRow | null;
}) {
  const fb = args.facebookRow;
  if (!fb?.page_id || !fb?.page_access_token) return;

  // Ask the FB Page for the linked IG business account
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(fb.page_id)}?` +
    new URLSearchParams({
      fields: "instagram_business_account{id,username,name}",
      access_token: fb.page_access_token,
    }).toString();

  const out = await fetchJson(url);

  if (!out.ok) {
    // Don't break the API if Meta rejects this call; just log and continue.
    console.warn("[social-accounts] IG sync Graph error", out.json);
    return;
  }

  const ig = out.json?.instagram_business_account;
  const igId = ig?.id ? String(ig.id) : "";
  const igName =
    (ig?.username && String(ig.username)) ||
    (ig?.name && String(ig.name)) ||
    "";

  if (!igId) {
    // No IG linked to this Page — that’s a legit state.
    return;
  }

  // If we already have a row and it’s already correct + has token, skip update
  const existing = args.existingInstagramRow;
  const alreadyGood =
    existing &&
    existing.page_id === igId &&
    !!existing.page_access_token &&
    (existing.is_active ?? true);

  if (alreadyGood) return;

  try {
    if (existing?.id) {
      await supabaseAdmin
        .from("social_accounts")
        .update({
          page_id: igId,
          page_name: igName || existing.page_name,
          connection_type: "instagram_oauth",
          make_webhook_url: null,
          is_active: true,
          // ✅ Instagram publishing uses the FB Page token in practice
          page_access_token: fb.page_access_token,
          token_expires_at: null,
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("social_accounts").insert({
        id: randomUUID(),
        organisation_id: args.organisationId,
        platform: "instagram",
        page_id: igId,
        page_name: igName || null,
        connection_type: "instagram_oauth",
        make_webhook_url: null,
        is_active: true,
        page_access_token: fb.page_access_token,
        token_expires_at: null,
      });
    }

    console.log("[social-accounts] IG sync: upserted", { igId, igName });
  } catch (e) {
    console.warn("[social-accounts] IG sync DB warn", e);
  }
}

// GET /api/social-accounts?organisationId=...
export async function GET(req: Request) {
  try {
    const organisationId = await resolveOrganisationId(req);

    if (!organisationId) {
      return NextResponse.json({
        organisationId: null,
        socialAccounts: [],
      });
    }

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select("*")
      .eq("organisation_id", organisationId);

    if (error) {
      console.error("[social-accounts] GET error", error);
      return NextResponse.json(
        { error: "Failed to load social accounts" },
        { status: 500 }
      );
    }

    const rows: SocialAccountRow[] = (data ?? []) as any;

    // ✅ Auto-sync IG from FB (only if FB has a usable page token)
    const fbRow =
      rows.find((r) => r.platform === "facebook" && r.is_active) || null;
    const igRow =
      rows.find((r) => r.platform === "instagram" && r.is_active) || null;

    if (fbRow?.page_access_token && fbRow?.page_id) {
      await syncInstagramFromFacebook({
        organisationId,
        facebookRow: fbRow,
        existingInstagramRow: igRow,
      });

      // Re-fetch after potential upsert so caller sees the updated state immediately
      const { data: data2 } = await supabaseAdmin
        .from("social_accounts")
        .select("*")
        .eq("organisation_id", organisationId);

      return NextResponse.json({
        organisationId,
        socialAccounts: (data2 ?? []) as any,
      });
    }

    return NextResponse.json({
      organisationId,
      socialAccounts: rows ?? [],
    });
  } catch (error: any) {
    console.error("[social-accounts] GET unexpected", error);
    return NextResponse.json(
      { error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// POST /api/social-accounts?organisationId=...
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const platform = asProviderId(body?.platform);
    const pageId = typeof body?.pageId === "string" ? body.pageId : undefined;
    const pageName =
      typeof body?.pageName === "string" ? body.pageName : undefined;

    const connectionType =
      typeof body?.connectionType === "string" ? body.connectionType : undefined;

    const makeWebhookUrl =
      typeof body?.makeWebhookUrl === "string" ? body.makeWebhookUrl : undefined;

    const isActive =
      typeof body?.isActive === "boolean" ? body.isActive : undefined;

    const pageAccessToken =
      typeof body?.pageAccessToken === "string" ? body.pageAccessToken : undefined;

    const tokenExpiresAt =
      typeof body?.tokenExpiresAt === "string" ? body.tokenExpiresAt : undefined;

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required" },
        { status: 400 }
      );
    }

    const organisationId = await resolveOrganisationId(req);

    if (!organisationId) {
      return NextResponse.json({ error: "No organisation found" }, { status: 400 });
    }

    // See if we already have a row for this org + platform
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("social_accounts")
      .select("id, page_id")
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .limit(1);

    if (existingError) {
      console.error("[social-accounts] lookup error", existingError);
    }

    let result: any;

    if (existingRows && existingRows.length > 0) {
      const id = existingRows[0].id;

      const updatePayload: any = {};

      if (typeof pageName === "string") updatePayload.page_name = pageName;
      if (typeof connectionType === "string") updatePayload.connection_type = connectionType;
      if (typeof makeWebhookUrl === "string") updatePayload.make_webhook_url = makeWebhookUrl;
      if (typeof isActive === "boolean") updatePayload.is_active = isActive;
      if (typeof pageAccessToken === "string") updatePayload.page_access_token = pageAccessToken;
      if (typeof tokenExpiresAt === "string") updatePayload.token_expires_at = tokenExpiresAt;

      // Respect NOT NULL on page_id (only update if provided)
      if (typeof pageId === "string" && pageId.trim().length > 0) {
        updatePayload.page_id = pageId.trim();
      }

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("[social-accounts] update error", error);
        return NextResponse.json(
          { error: "Failed to update social account", details: error },
          { status: 500 }
        );
      }

      result = data;
    } else {
      const newId = randomUUID();

      // Respect NOT NULL on page_id:
      const safePageId =
        (typeof pageId === "string" && pageId.trim().length > 0
          ? pageId.trim()
          : "pending_page_id") + "";

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .insert({
          id: newId,
          organisation_id: organisationId,
          platform,
          page_id: safePageId,
          page_name: pageName ?? null,
          connection_type: connectionType ?? null,
          make_webhook_url: makeWebhookUrl ?? null,
          is_active: typeof isActive === "boolean" ? isActive : true,
          page_access_token: pageAccessToken ?? null,
          token_expires_at: tokenExpiresAt ?? null,
        })
        .select()
        .single();

      if (error) {
        console.error("[social-accounts] insert error", error);
        return NextResponse.json(
          { error: "Failed to create social account", details: error },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({
      organisationId,
      socialAccount: result,
    });
  } catch (error: any) {
    console.error("[social-accounts] POST unexpected", error);
    return NextResponse.json(
      { error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// DELETE /api/social-accounts?organisationId=...
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const platform = asProviderId(body?.platform);

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required" },
        { status: 400 }
      );
    }

    const organisationId = await resolveOrganisationId(req);

    if (!organisationId) {
      return NextResponse.json({ error: "No organisation found" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("social_accounts")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("platform", platform);

    if (error) {
      console.error("[social-accounts] DELETE error", error);
      return NextResponse.json(
        { error: "Failed to delete social account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ organisationId, platform });
  } catch (error: any) {
    console.error("[social-accounts] DELETE unexpected", error);
    return NextResponse.json(
      { error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
