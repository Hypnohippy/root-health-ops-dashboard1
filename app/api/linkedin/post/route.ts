import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type SocialAccountRow = {
  id: string;
  organisation_id: string;
  platform: string;
  page_access_token: string | null;
  token_expires_at: string | null;
  is_active: boolean | null;
};

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[linkedin/post] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

async function resolveOrganisationId(req: NextRequest, bodyOrgId?: string) {
  try {
    const orgFromQuery = req.nextUrl.searchParams.get("organisationId");
    if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  } catch {}
  if (bodyOrgId && String(bodyOrgId).trim()) return String(bodyOrgId).trim();
  return await getSingleTenantOrganisationId();
}

async function loadLinkedInAccount(organisationId: string): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("id, organisation_id, platform, page_access_token, token_expires_at, is_active")
    .eq("organisation_id", organisationId)
    .eq("platform", "linkedin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[linkedin/post] social_accounts load error", error);
    return null;
  }
  return (data as any) ?? null;
}

function isExpired(tokenExpiresAt: string | null) {
  if (!tokenExpiresAt) return false; // some providers don't set it
  const t = Date.parse(tokenExpiresAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() > t - 60_000; // treat as expired if within 60s
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Accept either "text" or "message" to be flexible across callers
    const text = String(body?.text ?? body?.message ?? "").trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "Missing post text." }, { status: 400 });
    }

    const organisationId = await resolveOrganisationId(req, body?.organisationId);
    if (!organisationId) {
      return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 400 });
    }

    const liRow = await loadLinkedInAccount(organisationId);

    if (!liRow?.page_access_token) {
      return NextResponse.json(
        {
          ok: false,
          error: "LinkedIn is not connected (missing access token). Please reconnect LinkedIn on the Connect page.",
        },
        { status: 401 }
      );
    }

    if (isExpired(liRow.token_expires_at)) {
      return NextResponse.json(
        {
          ok: false,
          error: "LinkedIn token expired. Please reconnect LinkedIn on the Connect page.",
          details: { code: "EXPIRED_ACCESS_TOKEN" },
        },
        { status: 401 }
      );
    }

    const token = liRow.page_access_token;

    // OIDC userinfo gives us "sub" to build person URN
    const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const userInfo: any = await userRes.json().catch(() => null);

    if (!userRes.ok) {
      const msg =
        userInfo?.message ||
        userInfo?.error_description ||
        userInfo?.error ||
        "Failed to fetch LinkedIn user info";

      return NextResponse.json(
        {
          ok: false,
          error: msg,
          details: {
            status: userRes.status,
            serviceErrorCode: userInfo?.serviceErrorCode,
            code: userInfo?.code,
            message: userInfo?.message,
          },
        },
        { status: 500 }
      );
    }

    const sub = userInfo?.sub ? String(userInfo.sub) : "";
    if (!sub) {
      return NextResponse.json(
        { ok: false, error: "LinkedIn userinfo returned no 'sub'." },
        { status: 500 }
      );
    }

    const authorUrn = `urn:li:person:${sub}`;

    const postBody = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202402",
      },
      body: JSON.stringify(postBody),
      cache: "no-store",
    });

    // LinkedIn sometimes returns empty body on success; be defensive
    const postJson: any = await postRes.json().catch(() => null);

    if (!postRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: postJson?.message || "Failed to post on LinkedIn",
          details: postJson || { status: postRes.status },
        },
        { status: 500 }
      );
    }

    // Try to return a usable id
    const postedId =
      postRes.headers.get("x-restli-id") ||
      postJson?.id ||
      postJson?.value ||
      null;

    return NextResponse.json({ ok: true, postedId, raw: postJson }, { status: 200 });
  } catch (err: any) {
    console.error("[linkedin/post] error", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
