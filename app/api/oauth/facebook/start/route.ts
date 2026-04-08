// app/api/oauth/facebook/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const FACEBOOK_APP_ID = (process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || "").trim();

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

function tryParseSbCookie(raw: string | undefined | null): any | null {
  if (!raw) return null;

  const attempts = [raw];

  try {
    attempts.push(decodeURIComponent(raw));
  } catch {}

  for (const value of attempts) {
    try {
      return JSON.parse(value);
    } catch {}
  }

  return null;
}

function extractAccessTokenFromCookies(req: NextRequest): string | null {
  const all = req.cookies.getAll();
  const sbCookie = all.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  const parsed = tryParseSbCookie(sbCookie?.value);
  const token = String(parsed?.access_token || "").trim();

  return token || null;
}

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const accessToken = extractAccessTokenFromCookies(req);
  if (!accessToken) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) return null;
  return String(user.id);
}

async function getOrganisationIdForCurrentUser(req: NextRequest): Promise<string | null> {
  const userId = await getAuthedUserId(req);
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.organisation_id) return null;
  return String(data.organisation_id);
}

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  const provider = norm(req.nextUrl.searchParams.get("provider")) || "facebook";
  back.searchParams.set("provider", provider);

  try {
    if (!FACEBOOK_APP_ID) {
      back.searchParams.set("error", "facebook_missing_app_id");
      back.searchParams.set(
        "error_description",
        "Missing FACEBOOK_APP_ID (or META_APP_ID) in env."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const url = new URL(req.url);
    const orgFromQuery = norm(url.searchParams.get("organisationId"));
    const organisationId = orgFromQuery || (await getOrganisationIdForCurrentUser(req));

    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      back.searchParams.set(
        "error_description",
        "No organisation membership found for this user."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/facebook/callback`;

    const scope = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "business_management",
      "instagram_basic",
      "instagram_content_publish",
    ].join(",");

    const state = encodeState({
      provider,
      organisationId,
      nonce: crypto.randomUUID(),
      t: Date.now(),
    });

    const oauthUrl =
      "https://www.facebook.com/v24.0/dialog/oauth?" +
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
