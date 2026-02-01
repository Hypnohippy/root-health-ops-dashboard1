// app/api/social-accounts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads"
  | "reddit";

async function resolveOrganisationId(explicit?: string | null) {
  const id = (explicit || "").trim();
  if (id) return id;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not resolve organisationId: ${error.message}`);
  if (!data?.id) throw new Error("No organisation found to attach this connection to.");

  return String(data.id);
}

function tokenSuffix(token: string | null) {
  const t = (token || "").trim();
  if (!t) return null;
  return t.slice(-6);
}

export async function GET(req: NextRequest) {
  try {
    const organisationIdFromQuery = req.nextUrl.searchParams.get("organisationId");
    const organisationId = await resolveOrganisationId(organisationIdFromQuery);

    const includeTokens =
      req.nextUrl.searchParams.get("includeTokens") === "1" ||
      req.nextUrl.searchParams.get("debug") === "1";

    // Default: return safe fields only.
    // Debug: include token metadata but NEVER the token itself.
    const select = includeTokens
      ? "platform, page_id, page_name, is_active, connection_type, token_expires_at, page_access_token"
      : "platform, page_id, page_name, is_active, connection_type";

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select(select)
      .eq("organisation_id", organisationId)
      .order("platform", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, organisationId },
        { status: 500 }
      );
    }

    if (!includeTokens) {
      return NextResponse.json(
        { success: true, organisationId, socialAccounts: data || [] },
        { status: 200 }
      );
    }

    // Sanitise token output (do not leak secrets)
    const safe = (data || []).map((r: any) => ({
      platform: r.platform,
      page_id: r.page_id,
      page_name: r.page_name,
      is_active: r.is_active,
      connection_type: r.connection_type,
      token_expires_at: r.token_expires_at || null,
      has_token: !!(r.page_access_token && String(r.page_access_token).trim()),
      token_ends: tokenSuffix(r.page_access_token || null),
    }));

    return NextResponse.json(
      { success: true, organisationId, socialAccounts: safe, debug: true },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed loading social accounts" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const platform = String(body?.platform || "").toLowerCase().trim() as ProviderId;
    const organisationId = await resolveOrganisationId(body?.organisationId || null);

    const page_id = body?.page_id != null ? String(body.page_id) : null;
    const page_name = body?.page_name != null ? String(body.page_name) : null;

    const page_access_token =
      body?.page_access_token != null ? String(body.page_access_token) : null;

    const token_expires_at =
      body?.token_expires_at != null ? String(body.token_expires_at) : null;

    const is_active = body?.is_active === false ? false : true;

    const connection_type =
      body?.connection_type != null ? String(body.connection_type) : null;

    if (!platform) {
      return NextResponse.json(
        { success: false, error: "platform is required" },
        { status: 400 }
      );
    }

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .limit(1)
      .maybeSingle();

    if (selErr) {
      return NextResponse.json({ success: false, error: selErr.message }, { status: 500 });
    }

    const payload = {
      organisation_id: organisationId,
      platform,
      page_id,
      page_name,
      is_active,
      page_access_token,
      token_expires_at,
      connection_type,
    };

    if (existing?.id) {
      const { error: updErr } = await supabaseAdmin
        .from("social_accounts")
        .update(payload)
        .eq("id", existing.id);

      if (updErr) {
        return NextResponse.json({ success: false, error: updErr.message }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabaseAdmin.from("social_accounts").insert(payload);

      if (insErr) {
        return NextResponse.json({ success: false, error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json(
      { success: true, organisationId, platform },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed saving social connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const platform = String(body?.platform || "").toLowerCase().trim() as ProviderId;
    const organisationId = await resolveOrganisationId(body?.organisationId || null);

    if (!platform) {
      return NextResponse.json(
        { success: false, error: "platform is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update({ is_active: false })
      .eq("organisation_id", organisationId)
      .eq("platform", platform);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, organisationId, platform }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed disconnecting social account" },
      { status: 500 }
    );
  }
}
