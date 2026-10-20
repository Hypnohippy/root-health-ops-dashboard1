import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { withTenantRoute } from "@/lib/tenantRoute.server";

export const runtime = "nodejs";

// Existing destination/configuration is unchanged.
const FORMSPREE_ENDPOINT =
  (process.env.FORMSPREE_ENDPOINT || "").trim() || "https://formspree.io/f/xkgvgnkw";
const norm = (value: unknown) => typeof value === "string" ? value.trim() : "";
const platforms = new Set(["facebook", "instagram", "linkedin", "threads", "tiktok", "google"]);

// Called only inside the authorised tenant handler. Never load post content,
// credentials, raw provider errors or metadata for an external support report.
async function latestFailure(organisationId: string) {
  const { data, error } = await supabaseAdmin.from("scheduled_posts")
    .select("id, status, platforms, scheduled_for, posted_at, updated_at")
    .eq("organisation_id", organisationId).eq("status", "failed")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null; // Diagnostics are best effort; support still works.
  return {
    id: data.id,
    status: "failed",
    platforms: Array.isArray(data.platforms) ? data.platforms.filter((p: unknown) => typeof p === "string" && platforms.has(p)) : [],
    scheduled_for: data.scheduled_for,
    posted_at: data.posted_at,
    updated_at: data.updated_at,
  };
}

function routePath(value: unknown) {
  const text = norm(value);
  // Keep page orientation without forwarding query/hash values (tokens, drafts,
  // contact IDs) or an untrusted external URL supplied by the browser.
  return text.startsWith("/") && !text.startsWith("//") ? text.split(/[?#]/, 1)[0] : null;
}

const authorisedReport = withTenantRoute<NextRequest>(async (req, tenant) => {
  const body = await req.json().catch(() => ({}));
  const message = norm(body?.message);
  if (!message) return NextResponse.json({ success: false }, { status: 400 });

  const latestFailed = await latestFailure(tenant.organisationId);
  const payload = {
    type: "root_health_ops_support",
    ts: new Date().toISOString(),
    organisationId: tenant.organisationId,
    email: norm(body?.email) || null,
    message,
    context: { pathname: routePath(body?.pathname), userAgent: norm(body?.userAgent) || null },
    diagnostics: { latestFailedScheduledPost: latestFailed },
  };
  const response = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload), cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ success: false }, { status: 502 });
  return NextResponse.json({ success: true, sent: true, organisationId: tenant.organisationId }, { headers: { "Cache-Control": "private, no-store" } });
}, { write: false }); // Support submission requires membership, not publishing privileges.

export async function POST(req: NextRequest) {
  const response = await authorisedReport(req);
  // Do not echo membership details, foreign IDs, DB errors or provider responses.
  return response.ok ? response : NextResponse.json(
    { success: false, error: "Unable to submit support request." },
    { status: response.status, headers: { "Cache-Control": "private, no-store" } },
  );
}
