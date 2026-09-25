import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export const POST = withTenantRoute(
  async function POST(req: Request, tenant) {
    try {
      const { id } = await req.json();

      if (!id) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing growth plan id.",
          },
          { status: 400 }
        );
      }

      const { data: existing, error: readError } = await supabaseAdmin
        .from("growth_plans")
        .select("id,status")
        .eq("id", id)
        .eq("organisation_id", tenant.organisationId)
        .maybeSingle();

      if (readError) {
        return NextResponse.json(
          {
            success: false,
            error: readError.message,
          },
          { status: 500 }
        );
      }

      if (!existing) {
        return NextResponse.json(
          {
            success: false,
            error: "Growth plan not found.",
          },
          { status: 404 }
        );
      }

      if (existing.status === "approved") {
        return NextResponse.json({
          success: true,
          status: "approved",
          alreadyApproved: true,
        });
      }

      const { error: updateError } = await supabaseAdmin
        .from("growth_plans")
        .update({
          status: "approved",
        })
        .eq("id", id)
        .eq("organisation_id", tenant.organisationId);

      if (updateError) {
        return NextResponse.json(
          {
            success: false,
            error: updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        status: "approved",
      });
    } catch (error: unknown) {
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to approve growth plan.",
        },
        { status: 500 }
      );
    }
  },
  { generation: false, write: true }
);
