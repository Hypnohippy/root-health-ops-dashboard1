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

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error) {
    console.error("[threads/manual-save] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

async function upsertThreadsSocialAccount(args: {
  organisationId: string;
  threadsUserId: string;
  username?: string | null;
  accessToken: string;
  tokenExpiresAt?: string | null;
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", args.organisationId)
    .eq("platform", "threads")
    .limit(1);

  if (existingError) {
    console.warn("[threads/manual-save] existing lookup error", existingError);
  }

  const pageName = args.username ? String(args.username) : null;

  if (existing && existing.length > 0) {
    const id = existing[0].id;
    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id: String(args.threadsUserId),
        page_name: pageName,
        connection_type: "threads_manual_token",
        make_webhook_url: null,
        is_active: true,
        page_access_token: String(args.accessToken),
        token_expires_at: args.tokenExpiresAt ?? null,
      })
      .eq("id", id);

    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: args.organisationId,
    platform: "threads",
    page_id: String(args.threadsUserId),
    page_name: pageName,
    connection_type: "threads_manual_token",
    make_webhook_url: null,
    is_active: true,
    page_access_token: String(args.accessToken),
    token_expires_at: args.tokenExpiresAt ?? null,
  });

  if (error) throw error;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const accessToken = String(body?.accessToken || "").trim();

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Missing accessToken" },
        { status: 400 }
      );
    }

    // Fetch Threads user using token
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

    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "No organisation found in DB" },
        { status: 500 }
      );
    }

    await upsertThreadsSocialAccount({
      organisationId,
      threadsUserId,
      username,
      accessToken,
      tokenExpiresAt: null, // (User Token Generator tokens are long-lived; we can add expiry later if you want)
    });

    return NextResponse.json(
      { ok: true, organisationId, threadsUserId, username },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[threads/manual-save] crashed", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
