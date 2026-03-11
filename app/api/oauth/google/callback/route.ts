import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
const GOOGLE_REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI || "").trim();
const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

type GoogleAccount = {
  name?: string;
  accountName?: string;
  type?: string;
};

type GoogleLocation = {
  name?: string;
  title?: string;
  storeCode?: string;
  websiteUri?: string;
};

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

function decodeState(state: string) {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

async function googleGetJson<T = any>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.message ||
      `Google request failed (${res.status})`;
    throw new Error(msg);
  }

  return json as T;
}

async function listGoogleBusinessAccounts(accessToken: string): Promise<GoogleAccount[]> {
  const json = await googleGetJson<{ accounts?: GoogleAccount[] }>(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20",
    accessToken
  );

  return Array.isArray(json?.accounts) ? json.accounts : [];
}

async function listGoogleBusinessLocations(
  accessToken: string,
  accountName: string
): Promise<GoogleLocation[]> {
  const params = new URLSearchParams({
    pageSize: "20",
    readMask: "name,title,storeCode,websiteUri",
  });

  const json = await googleGetJson<{ locations?: GoogleLocation[] }>(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?${params.toString()}`,
    accessToken
  );

  return Array.isArray(json?.locations) ? json.locations : [];
}

function pickBestAccount(accounts: GoogleAccount[]): GoogleAccount | null {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;

  const personal =
    accounts.find((a) => norm(a?.type).toUpperCase() === "PERSONAL") || null;

  return personal || accounts[0] || null;
}

function pickBestLocation(locations: GoogleLocation[]): GoogleLocation | null {
  if (!Array.isArray(locations) || locations.length === 0) return null;

  const withTitle = locations.find((l) => norm(l?.title));
  return withTitle || locations[0] || null;
}

async function upsertGoogleSocialAccount(args: {
  organisationId: string;
  locationResourceName: string;
  locationTitle?: string | null;
  accessToken: string;
  tokenExpiresAt?: string | null;
}) {
  const row: any = {
    organisation_id: args.organisationId,
    platform: "google",
    page_id: String(args.locationResourceName),
    page_name: args.locationTitle
      ? String(args.locationTitle)
      : "Google Business Profile",
    connection_type: "google_oauth",
    make_webhook_url: null,
    is_active: true,
    page_access_token: String(args.accessToken),
    token_expires_at: args.tokenExpiresAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const up = await supabaseAdmin
    .from("social_accounts")
    .upsert(row, { onConflict: "organisation_id,platform" })
    .select()
    .maybeSingle();

  if (!up.error) return;

  const { data: existing } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", args.organisationId)
    .eq("platform", "google")
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update(row)
      .eq("id", existing[0].id);

    if (error) throw error;
    return;
  }

  const { error: insErr } = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    ...row,
  });

  if (insErr) throw insErr;
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "google");

  try {
    const oauthErr = norm(req.nextUrl.searchParams.get("error") || "");
    if (oauthErr) {
      back.searchParams.set("error", oauthErr);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      back.searchParams.set("error", "google_missing_env");
      back.searchParams.set(
        "error_description",
        "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = norm(req.nextUrl.searchParams.get("code") || "");
    if (!code) {
      back.searchParams.set("error", "google_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const stateRaw = norm(req.nextUrl.searchParams.get("state") || "");
    const st = stateRaw ? decodeState(stateRaw) : null;

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const accessToken = norm(tokens.access_token || "");
    if (!accessToken) {
      back.searchParams.set("error", "google_missing_access_token");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    });

    const me = await oauth2.userinfo.get();
    const fallbackName = norm(
      me.data.name || me.data.email || "Google Business Profile"
    );

    const organisationId =
      (st?.organisationId ? String(st.organisationId) : "") ||
      (await getOrganisationIdFallback());

    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      back.searchParams.set(
        "error_description",
        "No organisation found to attach Google connection."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const accounts = await listGoogleBusinessAccounts(accessToken);
    const pickedAccount = pickBestAccount(accounts);

    if (!pickedAccount?.name) {
      back.searchParams.set("error", "google_no_business_accounts");
      back.searchParams.set(
        "error_description",
        "Google connected, but no Business Profile account was found."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const locations = await listGoogleBusinessLocations(
      accessToken,
      pickedAccount.name
    );

    const pickedLocation = pickBestLocation(locations);

    if (!pickedLocation?.name) {
      back.searchParams.set("error", "google_no_business_locations");
      back.searchParams.set(
        "error_description",
        "Google connected, but no Business Profile location was found."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const locationTitle =
      norm(pickedLocation.title) ||
      norm(pickedLocation.storeCode) ||
      fallbackName ||
      "Google Business Profile";

    const expiresAt =
      typeof tokens.expiry_date === "number"
        ? new Date(tokens.expiry_date).toISOString()
        : null;

    await upsertGoogleSocialAccount({
      organisationId,
      locationResourceName: pickedLocation.name,
      locationTitle,
      accessToken,
      tokenExpiresAt: expiresAt,
    });

    back.searchParams.set("connected", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    back.searchParams.set("error", "google_callback_crashed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
