import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function detectFormat(row: any): "text" | "image" | "video" {
  const imageUrl = String(row?.image_url || "").trim();
  const videoUrl = String(row?.meta?.video_url || "").trim();
  if (videoUrl) return "video";
  if (imageUrl) return "image";
  return "text";
}

function detectPatternType(message: string): "reflective" | "practical" | "story" {
  const t = String(message || "").toLowerCase();
  const hasSteps = t.includes("1)") || t.includes("1.") || t.includes("step") || t.includes("try this");
  const hasStory = t.includes("i ") || t.includes("i’ve") || t.includes("i've") || t.includes("today i") || t.includes("when i");
  if (hasSteps) return "practical";
  if (hasStory) return "story";
  return "reflective";
}

function scoreHeuristic(row: any): number {
  // MVP scoring (no API metrics yet): we score “completeness + clarity”.
  // Later: replace with engagement metrics from providers.
  const msg = String(row?.message || "");
  const len = msg.length;

  let score = 50;
  if (len >= 80 && len <= 220) score += 15;
  if (msg.includes("?")) score += 10; // gentle CTA
  if (msg.split("\n").length >= 3) score += 5;
  if (String(row?.image_url || "").trim()) score += 10;
  if (String(row?.meta?.video_url || "").trim()) score += 15;

  if (score > 95) score = 95;
  if (score < 10) score = 10;
  return score;
}

export const GET = withTenantRoute(async function GET(req: Request, tenant) {
  try {
    const organisationId = tenant.organisationId;

    // Look at the most recent posted items (Quick Blast counts too)
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, message, platforms, image_url, meta, created_at, posted_at, status").eq("organisation_id", tenant.organisationId)
      .in("status", ["posted", "failed"]) // we can learn from either
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      return NextResponse.json(
        { success: false, organisationId, error: error.message },
        { status: 200 }
      );
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length < 3) {
      return NextResponse.json(
        { success: false, organisationId, error: "Not enough history yet. Post a few times first." },
        { status: 200 }
      );
    }

    // Choose the best “candidate” by heuristic (MVP)
    const scored = rows.map((r) => ({ r, s: scoreHeuristic(r) }));
    scored.sort((a, b) => b.s - a.s);

    const best = scored[0]?.r;
    const bestScore = scored[0]?.s ?? 50;

    // Determine a platform to suggest (prefer the one used in that post)
    const platforms = Array.isArray(best?.platforms) ? best.platforms : [];
    const platform = String(platforms[0] || "threads").toLowerCase();

    const msg = String(best?.message || "");
    const patternType = detectPatternType(msg);
    const format = detectFormat(best);

    const suggestion = {
      platform,
      pattern_type: patternType,
      format,
      hook_style:
        patternType === "practical"
          ? "A clear first line + tiny steps"
          : patternType === "story"
          ? "A human moment + gentle insight"
          : "A reflective opening + reassurance",
      cta_style: "A single gentle question at the end",
      notes:
        "This suggestion is based on your recent posting style. Save it if it feels right — it becomes part of your Growth Memory (your personal playbook).",
      performance_score: bestScore,
      source_post_id: best?.id || null,
    };

    return NextResponse.json({ success: true, organisationId, suggestion }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Suggestion failed" },
      { status: 200 }
    );
  }
}, { generation: false, write: false });
