import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function parseCookies(req: NextRequest) {
  const raw = req.headers.get("cookie") || "";
  const out: Record<string, string> = {};
  raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      const idx = p.indexOf("=");
      if (idx === -1) return;
      const k = p.slice(0, idx).trim();
      const v = p.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    });
  return out;
}

function extractTokenFromCookieValue(v: string): string[] {
  const candidates: string[] = [];
  const raw = String(v || "").trim();
  if (!raw) return candidates;

  // Many Supabase cookies are JSON:
  // - ["access_token","refresh_token",...]
  // - {"access_token":"..."}
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) {
      const first = String(j[0] || "").trim();
      if (first) candidates.push(first);
    } else if (j && typeof j === "object") {
      const at = String((j as any).access_token || "").trim();
      if (at) candidates.push(at);
    }
  } catch {
    // Not JSON - treat as raw token
    candidates.push(raw);
  }

  return candidates.filter(Boolean);
}

async function getUserIdFromReq(req: NextRequest): Promise<string | null> {
  // 1) Authorization: Bearer <token>
  const auth = norm(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (!error && data?.user?.id) return data.user.id;
  }

  // 2) Cookies
  const cookies = parseCookies(req);

  // common cookie names people use
  const directNames = ["sb-access-token", "supabase-auth-token", "sb:token", "access_token"];

  const tokenValues: string[] = [];

  for (const name of directNames) {
    if (cookies[name]) tokenValues.push(cookies[name]);
  }

  // Supabase auth-helpers often store: sb-<project-ref>-auth-token
  for (const [k, v] of Object.entries(cookies)) {
    if (/^sb-.*-auth-token$/i.test(k)) tokenValues.push(v);
  }

  // Try every possible token candidate we can extract
  const tried = new Set<string>();
  for (const val of tokenValues) {
    for (const token of extractTokenFromCookieValue(val)) {
      if (!token || tried.has(token)) continue;
      tried.add(token);

      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user?.id) return data.user.id;
    }
  }

  return null;
}

async function requireOrgForUser(req: NextRequest, bodyOrgId?: string | null) {
  const userId = await getUserIdFromReq(req);
  if (!userId) throw new Error("Not authenticated");

  const forced = norm(process.env.SINGLE_ORG_ID || process.env.NEXT_PUBLIC_SINGLE_ORG_ID);
  const requested = norm(bodyOrgId) || forced;

  // If org is specified, verify membership
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

  // Otherwise pick first membership
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
