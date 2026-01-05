// app/api/schedule/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type LegacyRecord = {
  id: string;
  title: string;
  body: string;
  platform: string;
  scheduled_time: string;
  status: string;
  executed_at: string | null;
  series_name: string;
  episode_number: number | null;

  // extra fields (safe if UI ignores)
  platforms?: string[];
  image_url?: string | null;
  sequence_id?: string | null;
  meta?: any;
};

const toLegacyPlatformLabel = (platforms: any): string => {
  const p = Array.isArray(platforms) && platforms.length ? String(platforms[0]) : "";
  if (!p) return "Unknown";
  return p.charAt(0).toUpperCase() + p.slice(1);
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const organisationId =
      searchParams.get("organisationId") ||
      searchParams.get("organisation_id") ||
      "";

    if (!organisationId) {
      return NextResponse.json(
        {
          records: [],
          error: "Missing organisationId. Scheduled list needs organisation context.",
        },
        { status: 200 }
      );
    }

    const limitRaw = searchParams.get("limit") || "200";
    const limit = Math.max(1, Math.min(500, Number(limitRaw) || 200));

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, message, platforms, image_url, scheduled_for, status, created_at, sequence_id, series_part, series_total, meta"
      )
      .eq("organisation_id", organisationId)
      .order("scheduled_for", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[api/schedule/list] supabase error", error);
      return NextResponse.json(
        { records: [], error: (error as any)?.message || "DB error" },
        { status: 200 }
      );
    }

    const records: LegacyRecord[] = (data || []).map((row: any) => {
      const platformLabel = toLegacyPlatformLabel(row.platforms);

      const seriesName =
        (row?.meta && (row.meta.series_name || row.meta.sequenceName)) ||
        (row.sequence_id ? `Series ${String(row.sequence_id).slice(0, 8)}…` : "");

      return {
        id: row.id,
        title: row?.meta?.title || "",
        body: row.message || "",
        platform: platformLabel,
        scheduled_time: row.scheduled_for,
        status: row.status || "scheduled",
        executed_at: row?.meta?.executed_at || null,
        series_name: seriesName,
        episode_number: typeof row.series_part === "number" ? row.series_part : null,

        // extras
        platforms: row.platforms || [],
        image_url: row.image_url || null,
        sequence_id: row.sequence_id || null,
        meta: row.meta || null,
      };
    });

    return NextResponse.json({ records }, { status: 200 });
  } catch (err) {
    console.error("[api/schedule/list] unexpected", err);
    return NextResponse.json(
      { records: [], error: "Internal error loading scheduled posts." },
      { status: 200 }
    );
  }
}
