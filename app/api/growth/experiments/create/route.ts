import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function parseCookie(req: NextRequest, name: string) {
  const raw = req.headers.get("cookie") || "";
  const parts = raw.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

async function getUserIdFromReq(req: NextRequest): Promise<string | null> {
  const auth = norm(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (!error && data?.user?.id) return data.user.id;
  }

  // Common cookie names people use in custom setups
  const access =
    parseCookie(req, "sb-access-token") ||
    parseCookie(req, "supabase-auth-token") ||
    parseCookie(req, "sb:token") ||
    parseCookie(req, "sb-access-token.0") ||
    parseCookie(req, "sb-access-token.1");

  if (access) {
    const token = access.startsWith("[")
      ? (() => {
          try {
            const arr = JSON.parse(access);
            return Array.isArray(arr) ? String(arr[0] || "") : "";
          } catch {
            return "";
          }
        })()
      : access;

    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user?.id) return data.user.id;
    }
  }

  return null;
}

/**
 * ✅ Growth Lab auth rules:
 * - If SINGLE_ORG_ID is set: allow operations inside that org even if not logged in (single-tenant testing mode).
 * - If SINGLE_ORG_ID is NOT set: must be authenticated + org member.
 */
async function getOrgContext(req: NextRequest, bodyOrgId?: string | null) {
  const forced = norm(process.env.SINGLE_ORG_ID || process.env.NEXT_PUBLIC_SINGLE_ORG_ID);
  const userId = await getUserIdFromReq(req);

  // 🔒 Normal mode: auth required
  if (!forced) {
    if (!userId) throw new Error("Not authenticated");

    const requested = norm(bodyOrgId);
    if (!requested) throw new Error("Missing organisationId");

    const { data: mem, error: memErr } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id")
      .eq("organisation_id", requested)
      .eq("user_id", userId)
      .maybeSingle();

    if (memErr) throw new Error(memErr.message);
    if (!mem?.organisation_id) throw new Error("Not a member of this organisation");

    return { organisationId: requested, userId, mode: "member_auth" as const };
  }

  // ✅ Forced single-org mode: allow even without auth
  // If userId exists, great — still fine. If not, we proceed in forced org.
  return { organisationId: forced, userId: userId || "anon", mode: "forced_env" as const };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ctx = await getOrgContext(req, body?.organisationId);

    const title = norm(body?.title);
    const platform = norm(body?.platform);
    const pattern_type = norm(body?.pattern_type);
    const format = norm(body?.format);

    if (!title || !platform || !pattern_type || !format) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (title/platform/pattern/format)." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const row: any = {
      organisation_id: ctx.organisationId,
      title,
      platform,
      goal: norm(body?.goal) || "Improve engagement",
      format,
      pattern_type,
      hook_style: norm(body?.hook_style) || null,
      cta_style: norm(body?.cta_style) || null,
      notes: norm(body?.notes) || null,
      hypothesis: norm(body?.hypothesis) || null,
      status: "planned",
      confidence: Number.isFinite(Number(body?.confidence)) ? Number(body.confidence) : 60,
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
      deleted_at: null,
    };

    const ins = await supabaseAdmin.from("growth_experiments").insert(row).select().maybeSingle();
    if (ins.error) throw new Error(ins.error.message);

    return NextResponse.json({ success: true, organisationId: ctx.organisationId, item: ins.data, mode: ctx.mode }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Failed to create experiment.";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not a member") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
