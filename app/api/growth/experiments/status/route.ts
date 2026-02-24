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

  const access =
    parseCookie(req, "sb-access-token") ||
    parseCookie(req, "supabase-auth-token") ||
    parseCookie(req, "sb:token");

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

async function getOrgContext(req: NextRequest) {
  const forced = norm(process.env.SINGLE_ORG_ID || process.env.NEXT_PUBLIC_SINGLE_ORG_ID);
  const userId = await getUserIdFromReq(req);

  if (!forced) {
    if (!userId) throw new Error("Not authenticated");
    return { organisationId: null as any, userId, mode: "member_auth" as const };
  }

  return { organisationId: forced, userId: userId || "anon", mode: "forced_env" as const };
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrgContext(req);
    const body = await req.json().catch(() => ({}));

    const id = norm(body?.id);
    const status = norm(body?.status).toLowerCase();

    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    if (!["planned", "running", "completed"].includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const { data: exp, error: expErr } = await supabaseAdmin
      .from("growth_experiments")
      .select("id, organisation_id")
      .eq("id", id)
      .maybeSingle();

    if (expErr) throw new Error(expErr.message);
    if (!exp?.id) throw new Error("Experiment not found");

    // If forced env: only allow updating experiments inside forced org
    if (ctx.mode === "forced_env") {
      if (String(exp.organisation_id) !== String(ctx.organisationId)) {
        throw new Error("Not allowed for this organisation");
      }
    }

    const now = new Date().toISOString();
    const patch: any = { status, updated_at: now };

    if (status === "running") patch.started_at = now;
    if (status === "completed") patch.completed_at = now;

    const upd = await supabaseAdmin
      .from("growth_experiments")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (upd.error) throw new Error(upd.error.message);

    return NextResponse.json({ success: true, item: upd.data, mode: ctx.mode }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Status update failed.";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not allowed") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
