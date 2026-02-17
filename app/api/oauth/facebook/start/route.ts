// app/api/oauth/facebook/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const FACEBOOK_APP_ID = (process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || "").trim();

const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

function baseUrl(req: NextRequest) {
  try {
    return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
  } catch {
    return APP_URL ? APP_URL.replace(/\/$/, "") : "";
  }
}

function norm(v: any) {
  return String(v ?? "").trim();
}

async function getOrganisationIdFallback(): Promise<string | null> {
  if (SINGLE_ORG_ID) return SINGLE_ORG_ID;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "facebook");

  try {
    if (!FACEBOOK_APP_ID) {
      back.searchParams.set("error", "facebook_missing_app_id");
      back.searchParams.set("error_description", "Missing FACEBOOK_APP_ID (or META_APP_ID) in env.");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const url = new URL(req.url);
    const orgFromQuery = norm(url.searchParams.get("organisationId"));
    const organisationId = orgFromQuery || (await getOrganisationIdFallback());

    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      back.searchParams.set("error_description", "No organisationId provided and none found.");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/facebook/callback`;

    // Minimal scopes for posting to a Page
    const scope = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"].join(",");

    // ✅ carry org through the OAuth roundtrip
    const state = encodeState({
      provider: "facebook",
      organisationId,
      nonce: crypto.randomUUID(),
      t: Date.now(),
    });

    const oauthUrl =
      "https://www.facebook.com/v19.0/dialog/oauth?" +
      new URLSearchParams({
        client_id: FACEBOOK_APP_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope,
        state,
      }).toString();

    return NextResponse.redirect(oauthUrl, { status: 302 });
  } catch (e: any) {
    back.searchParams.set("error", "facebook_start_failed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
