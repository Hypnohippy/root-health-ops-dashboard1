// app/api/growth/experiments/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

/**
 * Supabase cookies can be:
 * - sb-<project>-auth-token
 * - sb-<project>-auth-token.0 / .1 / .2 (chunked)
 * - sb-access-token (older)
 * - supabase-auth-token (sometimes)
 *
 * We must:
 * 1) read cookies reliably (req.cookies)
 * 2) rebuild chunked cookie values
 * 3) extract the access token (array/object/raw string)
 */
function getCookieValue(req: NextRequest, name: string): string | null {
  try {
    return req.cookies.get(name)?.value ?? null;
  } catch {
    return null;
  }
}

function getChunkedCookieValue(req: NextRequest, baseName: string): string | null {
  // exact cookie present?
  const direct = getCookieValue(req, baseName);
  if (direct) return direct;

  // gather chunks: baseName.0, baseName.1, ...
  const chunks: Array<{ idx: number; value: string }> = [];
  try {
    const all = req.cookies.getAll();
    for (const c of all) {
      const n = c.name || "";
      if (!n.startsWith(baseName + ".")) continue;

      const tail = n.slice(baseName.length + 1); // after "base."
      const idx = Number(tail);
      if (!Number.isFinite(idx)) continue;

      chunks.push({ idx, value: c.value || "" });
    }
  } catch {
    // ignore
  }

  if (chunks.length === 0) return null;

  chunks.sort((a, b) => a.idx - b.idx);
  const combined = chunks.map((c) => c.value).join("");
  return combined || null;
}

function tryExtractAccessToken(raw: string): string | null {
  const v = norm(raw);
  if (!v) return null;

  // JSON array: ["access","refresh",...]
  if (v.startsWith("[")) {
    try {
      const arr = JSON.parse(v);
      const token = Array.isArray(arr) ? norm(arr[0]) : "";
      if (token) return token;
    } catch {}
  }

  // JSON object: { access_token: "...", ... } OR { currentSession: { access_token: "..." } }
  if (v.startsWith("{")) {
    try {
      const obj = JSON.parse(v);
      const token =
        norm(obj?.access_token) ||
        norm(obj?.currentSession?.access_token) ||
        norm(obj?.session?.access_token) ||
        "";
      if (token) return token;
    } catch {}
  }

  // Raw JWT-ish string fallback
  if (v.length > 40) return v;

  return null;
}

function extractAccessTokenFromReq(req: NextRequest): string | null {
  // 1) Older direct tokens (rare now)
  const directOld =
    getCookieValue(req, "sb-access-token") ||
    getCookieValue(req, "supabase-auth-token");

  const tok1 = directOld ? tryExtractAccessToken(directOld) : null;
  if (tok1) return tok1;

  // 2) Find ANY cookie that ends with "auth-token" (and rebuild chunked)
  // Common: sb-<project-ref>-auth-token (possibly chunked)
  let baseNames: string[] = [];
  try {
    const all = req.cookies.getAll();
    for (const c of all) {
      const name = String(c.name || "");
      const lower = name.toLowerCase();

      // include base cookie itself
      if (lower.endsWith("auth-token") && !name.includes(".")) {
        baseNames.push(name);
      }

      // include chunk base: "...auth-token.0" -> "...auth-token"
      const m = name.match(/^(.*auth-token)\.\d+$/i);
      if (m?.[1]) baseNames.push(m[1]);
    }
  } catch {
    // ignore
  }

  // de-dupe
  baseNames = Array.from(new Set(baseNames));

  for (const base of baseNames) {
    const raw = getChunkedCookieValue(req, base);
    if (!raw) continue;
    const token = tryExtractAccessToken(raw);
    if (token) return token;
  }

  return null;
}

async function getUserIdFromReq(req: NextRequest): Promise<string | null> {
  // A) Bearer token (if you ever send it)
  const auth = norm(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (!error && data?.user?.id) return data.user.id;
  }

  // B) Cookies (normal browser login)
  const access = extractAccessTokenFromReq(req);
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
