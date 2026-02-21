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
    parseCookie(req, "supabase-auth-token");

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

async function assertExperimentMember(userId: string, experimentId: string) {
  const { data: exp, error: expErr } = await supabaseAdmin
    .from("growth_experiments")
    .select("id, organisation_id")
    .eq("id", experimentId)
    .maybeSingle();

  if (expErr) throw new Error(expErr.message);
  if (!exp?.organisation_id) throw new Error("Experiment not found");

  const orgId = String(exp.organisation_id);

  const { data: mem, error: memErr } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id")
    .eq("organisation_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memErr) throw new Error(memErr.message);
  if (!mem?.organisation_id) throw new Error("Not a member of this organisation");

  return { orgId };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromReq(req);
    if (!userId) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const id = norm(body?.id);
    if (!id) return NextResponse.json({ success: false, error: "Missing id." }, { status: 400 });

    await assertExperimentMember(userId, id);

    // Safe archive delete
    const now = new Date().toISOString();
    const upd = await supabaseAdmin
      .from("growth_experiments")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (upd.error) throw new Error(upd.error.message);

    return NextResponse.json({ success: true, item: upd.data });
  } catch (e: any) {
    const msg = e?.message || "Delete failed.";
    const status = msg.includes("Not a member") ? 403 : msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
