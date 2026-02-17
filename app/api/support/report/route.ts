// app/api/support/report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

// Your Formspree endpoint (can be overridden with env if you want)
const FORMSPREE_ENDPOINT =
  (process.env.FORMSPREE_ENDPOINT || "").trim() || "https://formspree.io/f/xkgvgnkw";

// Optional single-tenant override (server-only)
const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

function norm(v: any) {
  return String(v ?? "").trim();
}

async function getOrganisationIdFallback(): Promise<string | null> {
  if (SINGLE_ORG_ID) return SINGLE_ORG_ID;

  // Single-tenant fallback: most recently created org
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

async function getLatestFailedPostForOrg(organisationId: string) {
  // Pull the most recent failed post (scheduled or quick blast) for this org
  const { data, error } = await supabaseAdmin
    .from("scheduled_posts")
    .select(
      "id, organisation_id, message, platforms, image_url, scheduled_for, posted_at, status, meta, error_info, created_at, updated_at"
    )
    .eq("organisation_id", organisationId)
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error || !data) return null;

  // Prefer failed, else anything with error_info
  const rows: any[] = Array.isArray(data) ? data : [];
  const failed =
    rows.find((r) => String(r?.status || "").toLowerCase() === "failed") ||
    rows.find((r) => r?.error_info) ||
    null;

  return failed;
}

export async function POST(req: NextRequest) {
  try {
    if (!FORMSPREE_ENDPOINT) {
      return NextResponse.json(
        { success: false, error: "Missing Formspree endpoint configuration." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const organisationIdRaw = norm(body?.organisationId || "");
    const email = norm(body?.email || "");
    const message = norm(body?.message || "");
    const pathname = norm(body?.pathname || "");
    const href = norm(body?.href || "");
    const userAgent = norm(body?.userAgent || "");

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 400 }
      );
    }

    const organisationId = organisationIdRaw || (await getOrganisationIdFallback());

    // Load useful diagnostics (best effort)
    const latestFailed = organisationId ? await getLatestFailedPostForOrg(organisationId) : null;

    const payload = {
      type: "root_health_ops_support",
      ts: new Date().toISOString(),
      organisationId: organisationId || null,
      email: email || null,
      message,
      context: {
        pathname: pathname || null,
        href: href || null,
        userAgent: userAgent || null,
      },
      diagnostics: {
        latestFailedScheduledPost: latestFailed
          ? {
              id: latestFailed.id,
              status: latestFailed.status,
              platforms: latestFailed.platforms,
              image_url: latestFailed.image_url,
              scheduled_for: latestFailed.scheduled_for,
              posted_at: latestFailed.posted_at,
              updated_at: latestFailed.updated_at,
              meta: latestFailed.meta,
              error_info: latestFailed.error_info,
              // message included (helps reproduce)
              message: latestFailed.message,
            }
          : null,
      },
    };

    // Send to Formspree
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const respJson: any = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Formspree rejected the support message.",
          status: res.status,
          details: respJson,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { success: true, sent: true, organisationId: organisationId || null },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[support/report] error", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Support report failed." },
      { status: 500 }
    );
  }
}
