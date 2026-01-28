import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

async function resolveOrganisationId(explicit?: string | null) {
  const id = (explicit || "").trim();
  if (id) return id;

  // fallback: most recent org
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not resolve organisationId: ${error.message}`);
  if (!data?.id) throw new Error("No organisation found.");
  return String(data.id);
}

async function upsertLinkedInAccount(args: {
  organisationId: string;
  memberId: string;
  memberName: string;
  accessToken: string;
  expiresAtIso?: string | null;
}) {
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", args.organisationId)
    .eq("platform", "linkedin")
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;

  const payload: any = {
    platform: "linkedin",
    page_id: args.memberId,
    page_name: args.memberName || null,
    connection_type: "linkedin_oauth",
    is_active: true,
    page_access_token: args.accessToken,
    token_expires_at: args.expiresAtIso ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: updErr } = await supabaseAdmin
      .from("social_accounts")
      .update(payload)
      .eq("id", existing.id);
    if (updErr) throw updErr;
    return;
  }

  const { error: insErr } = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: args.organisationId,
    ...payload,
    created_at: new Date().toISOString(),
  });

  if (insErr) throw insErr;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const token = String(body?.token || "").trim();
    const organisationId = await resolveOrganisationId(body?.organisationId || null);

    if (!token) {
      return NextResponse.json({ success: false, error: "Missing token" }, { status: 400 });
    }

    // ✅ Server-side call to LinkedIn userinfo (no CORS)
    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const meJson: any = await meRes.json().catch(() => null);

    if (!meRes.ok || !meJson?.sub) {
      return NextResponse.json(
        {
          success: false,
          error: meJson?.message || "LinkedIn userinfo failed",
          details: meJson,
          status: meRes.status,
        },
        { status: 500 }
      );
    }

    const memberId = String(meJson.sub);
    const memberName =
      [meJson.given_name, meJson.family_name].filter(Boolean).join(" ").trim() ||
      String(meJson.name || "LinkedIn");

    await upsertLinkedInAccount({
      organisationId,
      memberId,
      memberName,
      accessToken: token,
    });

    return NextResponse.json({ success: true, organisationId }, { status: 200 });
  } catch (e: any) {
    console.error("[oauth/linkedin/finish] error", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Finish failed" },
      { status: 500 }
    );
  }
}
