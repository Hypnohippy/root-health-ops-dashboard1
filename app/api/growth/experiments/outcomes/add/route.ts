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

async function getForcedOrg() {
  return norm(process.env.SINGLE_ORG_ID || process.env.NEXT_PUBLIC_SINGLE_ORG_ID);
}

export async function POST(req: NextRequest) {
  try {
    const forcedOrg = await getForcedOrg();
    const userId = await getUserIdFromReq(req);

    // If no forced org, must be authenticated
    if (!forcedOrg && !userId) throw new Error("Not authenticated");

    const body = await req.json().catch(() => ({}));

    const experimentId = norm(body?.experimentId);
    const metric_name = norm(body?.metric_name);
    const metric_value = body?.metric_value ?? null;
    const meta = body?.meta ?? {};

    if (!experimentId) return NextResponse.json({ success: false, error: "Missing experimentId" }, { status: 400 });
    if (!metric_name) return NextResponse.json({ success: false, error: "Missing metric_name" }, { status: 400 });

    // Always load experiment to get its organisation_id (fixes your NULL org id issue)
    const { data: exp, error: expErr } = await supabaseAdmin
      .from("growth_experiments")
      .select("id, organisation_id")
      .eq("id", experimentId)
      .maybeSingle();

    if (expErr) throw new Error(expErr.message);
    if (!exp?.id) throw new Error("Experiment not found");

    // In forced env: ensure experiment belongs to forced org
    if (forcedOrg && String(exp.organisation_id) !== String(forcedOrg)) {
      return NextResponse.json({ success: false, error: "Not allowed for this organisation" }, { status: 403 });
    }

    const now = new Date().toISOString();

    const row: any = {
      organisation_id: exp.organisation_id, // ✅ fixed (no more null)
      experiment_id: experimentId,
      metric_name,
      metric_value,
      meta,
      created_at: now,
    };

    const ins = await supabaseAdmin
      .from("growth_experiment_outcomes")
      .insert(row)
      .select()
      .maybeSingle();

    if (ins.error) throw new Error(ins.error.message);

    return NextResponse.json({ success: true, item: ins.data, mode: forcedOrg ? "forced_env" : "member_auth" }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Failed to add outcome.";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not allowed") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
