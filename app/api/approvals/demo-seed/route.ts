// app/api/approvals/demo-seed/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/approvals/demo-seed?organisationId=...
 * Creates demo posts with meta.approvals.state='pending'
 * Adds meta.created_by so Approvals can show "Posted by <name>"
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = String(url.searchParams.get("organisationId") || "").trim();

    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Missing organisationId" }, { status: 400 });
    }

    const now = Date.now();

    // ✅ demo poster identity (what you'll replace with real clinician later)
    const demoPoster = {
      user_id: "demo-clinician-001",
      name: "Demo Clinician",
      email: "demo@roothealth.app",
    };

    const baseMeta = {
      created_by: demoPoster,
      approvals: {
        state: "pending",
        seeded: true,
        seeded_at: new Date().toISOString(),
      },
    };

    const demo = [
      {
        organisation_id: organisationId,
        message: "DEMO: A calm check-in for anyone feeling overwhelmed today. You’re not alone.",
        platforms: ["instagram", "facebook"],
        image_url: null,
        scheduled_for: new Date(now + 60 * 60 * 1000).toISOString(),
        status: "scheduled",
        meta: baseMeta,
      },
      {
        organisation_id: organisationId,
        message: "DEMO: One small thing you can do right now: breathe out slower than you breathe in.",
        platforms: ["linkedin"],
        image_url: null,
        scheduled_for: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        status: "scheduled",
        meta: baseMeta,
      },
      {
        organisation_id: organisationId,
        message: "DEMO: Progress is allowed to be quiet. Small steps still count.",
        platforms: ["threads"],
        image_url: null,
        scheduled_for: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
        status: "scheduled",
        meta: baseMeta,
      },
    ];

    const { error } = await supabaseAdmin.from("scheduled_posts").insert(demo as any);

    if (error) {
      console.error("[approvals/demo-seed] insert error", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, created: demo.length }, { status: 200 });
  } catch (err: any) {
    console.error("[approvals/demo-seed] unexpected", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
