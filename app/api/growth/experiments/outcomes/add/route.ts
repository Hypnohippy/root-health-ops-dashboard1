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

  const access = parseCookie(req, "sb-access-token") || parseCookie(req, "supabase-auth-token");
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
    const experimentId = norm(body?.experimentId);
    const metric_name = norm(body?.metric_name).toLowerCase();
    const metric_value = body?.metric_value === null || body?.metric_value === undefined ? null : Number(body.metric_value);
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    if (!experimentId || !metric_name) {
      return NextResponse.json({ success: false, error: "Missing experimentId/metric_name." }, { status: 400 });
    }

    await assertExperimentMember(userId, experimentId);

    const now = new Date().toISOString();

    const ins = await supabaseAdmin
      .from("growth_experiment_outcomes")
      .insert({
        experiment_id: experimentId,
        metric_name,
        metric_value: Number.isFinite(metric_value as any) ? metric_value : null,
        meta,
        created_at: now,
      })
      .select()
      .maybeSingle();

    if (ins.error) throw new Error(ins.error.message);

    return NextResponse.json({ success: true, item: ins.data });
  } catch (e: any) {
    const msg = e?.message || "Add outcome failed.";
    const status = msg.includes("Not a member") ? 403 : msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
