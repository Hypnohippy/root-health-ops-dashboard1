// app/api/growth/experiments/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function parseCookies(req: NextRequest): Record<string, string> {
  const raw = req.headers.get("cookie") || "";
  const out: Record<string, string> = {};
  raw.split(";").forEach((part) => {
    const p = part.trim();
    if (!p) return;
    const idx = p.indexOf("=");
    if (idx === -1) return;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

/**
 * Supabase cookie formats vary:
 * - sb-access-token (older)
 * - supabase-auth-token (sometimes)
 * - sb-<project-ref>-auth-token (common in prod)
 *
 * Values are often JSON like: ["ACCESS_TOKEN","REFRESH_TOKEN",...]
 * Sometimes object-ish. We handle both.
 */
function extractAccessTokenFromCookies(req: NextRequest): string | null {
  const cookies = parseCookies(req);

  // 1) direct known keys
  const direct =
    cookies["sb-access-token"] ||
    cookies["supabase-auth-token"] ||
    cookies["sb:token"] || // rare/older
    null;

  const candidates: string[] = [];

  if (direct) candidates.push(direct);

  // 2) any cookie that ends with "auth-token" (covers sb-<ref>-auth-token)
  for (const [name, value] of Object.entries(cookies)) {
    if (name === "sb-access-token" || name === "supabase-auth-token") continue;
    if (name.toLowerCase().endsWith("auth-token")) candidates.push(value);
  }

  // 3) try each candidate and extract access token
  for (const raw of candidates) {
    const v = norm(raw);
    if (!v) continue;

    // Sometimes it’s a JSON array: ["access","refresh",...]
    if (v.startsWith("[")) {
      try {
        const arr = JSON.parse(v);
        const token = Array.isArray(arr) ? norm(arr[0]) : "";
        if (token) return token;
      } catch {}
    }

    // Sometimes it’s a JSON object containing access_token
    if (v.startsWith("{")) {
      try {
        const obj = JSON.parse(v);
        const token =
          norm(obj?.access_token) ||
          norm(obj?.currentSession?.access_token) ||
          "";
        if (token) return token;
      } catch {}
    }

    // Otherwise, assume it is already an access token string
    if (v.length > 40) return v;
  }

  return null;
}

async function getUserIdFromReq(req: NextRequest): Promise<string | null> {
  // A) Bearer token (if client ever sends it)
  const auth = norm(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (!error && data?.user?.id) return data.user.id;
  }

  // B) Cookies (normal browser flow)
  const access = extractAccessTokenFromCookies(req);
  if (access) {
    const { data, error } = await supabaseAdmin.auth.getUser(access);
    if (!error && data?.user?.id) return data.user.id;
  }

  return null;
}

async function requireOrgForUser(req: NextRequest, bodyOrgId?: string | null) {
  const userId = await getUserIdFromReq(req);
  if (!userId) throw new Error("Not authenticated");

  const forced = norm(process.env.SINGLE_ORG_ID || process.env.NEXT_PUBLIC_SINGLE_ORG_ID);
  const requested = norm(bodyOrgId) || forced;

  if (requested) {
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id")
      .eq("organisation_id", requested)
      .eq("user_id", userId)
      .maybeSingle();

    if (memErr) throw new Error(memErr.message);
    if (!mem?.organisation_id) throw new Error("Not a member of this organisation");
    return { userId, organisationId: requested };
  }

  const { data: memberships, error } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);
  const orgId = memberships?.[0]?.organisation_id ? String(memberships[0].organisation_id) : null;
  if (!orgId) throw new Error("No organisation membership found");
  return { userId, organisationId: orgId };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { organisationId } = await requireOrgForUser(req, body?.organisationId);

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
      organisation_id: organisationId,
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

    return NextResponse.json({ success: true, organisationId, item: ins.data }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Failed to create experiment.";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not a member") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
