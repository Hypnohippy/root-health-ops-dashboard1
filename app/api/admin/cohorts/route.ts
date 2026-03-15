import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v || "").trim();
}

function upper(v: any) {
  return norm(v).toUpperCase();
}

function slugify(input: string) {
  return norm(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toNullableNumber(v: any) {
  const s = norm(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toNullableIso(v: any) {
  const s = norm(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("college_cohorts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to load cohorts." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        cohorts: data || [],
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load cohorts." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const collegeName = norm(body?.college_name);
    const cohortName = norm(body?.cohort_name);
    const cohortCode = upper(body?.cohort_code);
    const slug = slugify(body?.slug || `${collegeName}-${cohortName}`);
    const discountPercent = toNullableNumber(body?.discount_percent);
    const discountMonths = toNullableNumber(body?.discount_months);
    const maxRedemptions = toNullableNumber(body?.max_redemptions);
    const startsAt = toNullableIso(body?.starts_at);
    const expiresAt = toNullableIso(body?.expires_at);
    const stripeCouponId = norm(body?.stripe_coupon_id);
    const notes = norm(body?.notes);
    const isActive = Boolean(body?.is_active ?? true);

    if (!collegeName) {
      return NextResponse.json(
        { ok: false, error: "college_name is required." },
        { status: 400 }
      );
    }

    if (!cohortName) {
      return NextResponse.json(
        { ok: false, error: "cohort_name is required." },
        { status: 400 }
      );
    }

    if (!cohortCode) {
      return NextResponse.json(
        { ok: false, error: "cohort_code is required." },
        { status: 400 }
      );
    }

    if (!discountPercent || discountPercent < 1 || discountPercent > 100) {
      return NextResponse.json(
        { ok: false, error: "discount_percent must be between 1 and 100." },
        { status: 400 }
      );
    }

    if (!discountMonths || discountMonths < 1) {
      return NextResponse.json(
        { ok: false, error: "discount_months must be at least 1." },
        { status: 400 }
      );
    }

    if (!stripeCouponId) {
      return NextResponse.json(
        { ok: false, error: "stripe_coupon_id is required." },
        { status: 400 }
      );
    }

    const { data: existingCode } = await supabaseAdmin
      .from("college_cohorts")
      .select("id")
      .eq("cohort_code", cohortCode)
      .maybeSingle();

    if (existingCode?.id) {
      return NextResponse.json(
        { ok: false, error: "That cohort code already exists." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("college_cohorts")
      .insert({
        college_name: collegeName,
        cohort_name: cohortName,
        cohort_code: cohortCode,
        slug,
        discount_percent: discountPercent,
        discount_months: discountMonths,
        max_redemptions: maxRedemptions,
        redemptions_used: 0,
        starts_at: startsAt,
        expires_at: expiresAt,
        is_active: isActive,
        notes: notes || null,
        stripe_coupon_id: stripeCouponId,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to create cohort." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        cohort: data,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to create cohort." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = norm(body?.id);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id is required." },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
      updates.is_active = Boolean(body.is_active);
    }

    const { data, error } = await supabaseAdmin
      .from("college_cohorts")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to update cohort." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        cohort: data,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to update cohort." },
      { status: 500 }
    );
  }
}
