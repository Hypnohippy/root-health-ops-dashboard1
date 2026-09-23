import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/social/scheduled/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function okJson(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function norm(v: any) {
  return String(v || "").trim();
}

function safeArr<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function safeIso(s: any) {
  const t = String(s || "").trim();
  if (!t) return "";
  const d = new Date(t);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function addMinutes(iso: string, minutes: number) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

const TABLE = "scheduled_posts";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const startAt = safeIso(body?.startAt);
    const intervalMinutes = Math.max(1, Math.min(1440, Number(body?.intervalMinutes ?? 60) || 60));

    const platforms = safeArr<string>(body?.platforms).map((p) => norm(p).toLowerCase()).filter(Boolean);
    const items = safeArr<any>(body?.items);

    const meta = body?.meta ?? {};
    const source = norm(meta?.source) || "brainstorm_series";

    if (!startAt) return okJson({ success: false, error: "Missing startAt" }, 400);
    if (platforms.length === 0) return okJson({ success: false, error: "Pick at least one platform" }, 400);
    if (items.length === 0) return okJson({ success: false, error: "No items provided" }, 400);

    const { organisationId: orgId } = await requireOrganisation(body?.organisationId || meta?.organisationId);

    if (!orgId) {
      return okJson({ success: false, error: "Missing organisationId (could not infer)." }, 400);
    }

    const nowIso = new Date().toISOString();

    const rows = items
      .map((it: any, idx: number) => {
        const message = norm(it?.text);
        if (!message) return null;

        const imageUrl = norm(it?.imageUrl || "");
        const scheduled_for = addMinutes(startAt, idx * intervalMinutes);

        return {
          organisation_id: orgId,
          message,
          platforms,
          image_url: imageUrl || null,
          scheduled_for,
          status: "scheduled", // ✅ IMPORTANT: cron picks up scheduled
          posted_at: null,
          error_info: null,
          created_at: nowIso,
          updated_at: nowIso,
          meta: {
            ...(meta || {}),
            source,
            imported_from: "brainstorm",
            import_index: idx,
            title: norm(it?.title || "") || null,
            attribution: it?.attribution ?? null,
          },
        };
      })
      .filter(Boolean);

    if (rows.length === 0) return okJson({ success: false, error: "All items were empty." }, 400);

    const { error: insErr } = await supabaseAdmin.from(TABLE).insert(rows as any[]);
    if (insErr) return okJson({ success: false, error: insErr.message }, 500);

    return okJson({
      success: true,
      inserted: rows.length,
      organisationId: orgId,
      startAt,
      intervalMinutes,
      platforms,
      source,
    });
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return okJson({ success: false, error: e?.message || "Import failed" }, 500);
  }
}
