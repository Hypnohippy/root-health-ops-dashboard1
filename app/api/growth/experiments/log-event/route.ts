import { withTenantRoute } from "@/lib/tenantRoute.server";
import { requireOwnedRecord, accessErrorResponse } from "@/lib/tenantAuth";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function safeUuidLike(s: any) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (!/^[0-9a-fA-F-]{16,}$/.test(v)) return null;
  return v;
}

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {
    const body = await req.json().catch(() => null);

    const organisationId = tenant.organisationId;
    const experimentId = safeUuidLike(body?.experimentId);
    await requireOwnedRecord("growth_experiments", experimentId, tenant.organisationId);

    // For now, this endpoint is specifically for experiment logging
    if (!organisationId || !experimentId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId or experimentId." },
        { status: 400 }
      );
    }

    const action = String(body?.action || "post_attempt").trim() || "post_attempt";
    const contentPreview = String(body?.contentPreview || "").slice(0, 400);

    const meta = body?.meta ?? null;
    const attempts = Array.isArray(body?.attempts) ? body.attempts : [];

    // Insert one row per platform attempt (enterprise-friendly audit trail)
    const rows = attempts.length
      ? attempts.map((a: any) => ({
          organisation_id: organisationId,
          experiment_id: experimentId,
          platform: String(a?.platform || "").trim() || null,
          action,
          ok: !!a?.ok,
          external_post_id: String(a?.externalPostId || "").trim() || null,
          content_preview: contentPreview || null,
          meta: {
            ...(meta ? { meta } : {}),
            error: a?.error ?? null,
            raw: a?.raw ?? null,
          },
        }))
      : [
          {
            organisation_id: organisationId,
            experiment_id: experimentId,
            platform: null,
            action,
            ok: false,
            external_post_id: null,
            content_preview: contentPreview || null,
            meta: meta ? { meta } : null,
          },
        ];

    const { error } = await supabaseAdmin
      .from("growth_experiment_events")
      .insert(rows);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || "Insert failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, inserted: rows.length });
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json(
      { success: false, error: e?.message || "Unexpected error." },
      { status: 500 }
    );
  }
}, { generation: false, write: true });
