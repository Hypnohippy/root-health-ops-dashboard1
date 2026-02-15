// app/api/oauth/threads/manual-save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

/**
 * ✅ IMPORTANT:
 * Match the Threads OAuth callback + connect UI behaviour:
 * choose the most recently created organisation (single-tenant fallback).
 */
async function getLatestOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[threads/manual-save] organisations error", error);
    return null;
  }
  if (!data?.id) return null;
  return String(data.id);
}

async function upsertThreadsSocialAccount(args: {
  organisationId: string;
  threadsUserId: string;
  username?: string | null;
  accessToken: string;
  tokenExpiresAt?: string | null;
}) {
  // 1) Deactivate any old Threads rows for THIS org (prevents ghost/duplicate confusion)
  // This will NOT touch Facebook/IG/TikTok/LinkedIn.
  await supabaseAdmin
    .from("social_accounts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("organisation_id", args.organisationId)
    .eq("platform", "threads");

  // 2) Try to find an existing row for this org + threads user id (preferred)
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", args.organisationId)
    .eq("platform", "threads")
    .eq("page_id", String(args.threadsUserId))
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.warn("[threads/manual-save] existing lookup error", existingError);
  }

  const pageName = args.username ? String(args.username) : null;

  const payload = {
    page_id: String(args.threadsUserId),
    page_name: pageName,
    // Use the same connection_type label your UI likely expects:
    connection_type: "threads_oauth",
    make_webhook_url: null,
    is_active: true,
    page_access_token: String(args.accessToken),
    token_expires_at: args.tokenExpiresAt ?? null,
    updated_at: new Date().toISOString(),
  };

  // 3) Update if found, else insert new
  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update(payload)
      .eq("id", existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: args.organisationId,
    platform: "threads",
    ...payload,
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const accessToken = String(body?.accessToken || "").trim();

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing accessToken" }, { status: 400 });
    }

    // Validate token by calling Threads /me
    const meUrl =
      "https://graph.threads.net/v1.0/me?" +
      new URLSearchParams({
        fields: "id,username",
        access_token: accessToken,
      }).toString();

    const meRes = await fetchJson(meUrl);

    if (!meRes.ok || !meRes.json?.id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            meRes.json?.error?.message ||
            "Could not validate token via Threads /me endpoint",
          details: meRes.json,
          status: meRes.status,
        },
        { status: 400 }
      );
    }

    const threadsUserId = String(meRes.json.id);
    const username = meRes.json.username ? String(meRes.json.username) : null;

    // ✅ Use latest org (matches callback + typical connect page behaviour)
    const organisationId = await getLatestOrganisationId();
    if (!organisationId) {
      return NextResponse.json({ ok: false, error: "No organisation found in DB" }, { status: 500 });
    }

    await upsertThreadsSocialAccount({
      organisationId,
      threadsUserId,
      username,
      accessToken,
      tokenExpiresAt: null,
    });

    return NextResponse.json({ ok: true, organisationId, threadsUserId, username }, { status: 200 });
  } catch (e: any) {
    console.error("[threads/manual-save] crashed", e);
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
