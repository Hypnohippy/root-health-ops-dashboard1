import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function containsPlaceholder(value: string) {
  return /\[[^\]]+\]/.test(value);
}

export const POST = withTenantRoute(
  async function POST(req: Request, tenant) {
    try {
      const body = await req.json();

      const id =
        typeof body?.id === "string"
          ? body.id.trim()
          : "";

      const selectedLinkedInPost =
        typeof body?.selectedLinkedInPost === "string"
          ? body.selectedLinkedInPost.trim()
          : "";

      if (!id) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing growth plan id.",
          },
          { status: 400 }
        );
      }

      if (!selectedLinkedInPost) {
        return NextResponse.json(
          {
            success: false,
            error: "Choose a LinkedIn post before approving today’s plan.",
          },
          { status: 400 }
        );
      }

      if (containsPlaceholder(selectedLinkedInPost)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The selected LinkedIn post still contains unresolved placeholder text. Edit it before approval.",
          },
          { status: 400 }
        );
      }

      const { data: existing, error: readError } =
        await supabaseAdmin
          .from("growth_plans")
          .select(
            "id,status,linkedin_post,target,day_number,created_at"
          )
          .eq("id", id)
          .eq(
            "organisation_id",
            tenant.organisationId
          )
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

      const { data: alreadyQueued, error: queueCheckError } =
        await supabaseAdmin
          .from("scheduled_posts")
          .select(
            "id,status,scheduled_for,message"
          )
          .eq(
            "organisation_id",
            tenant.organisationId
          )
          .eq(
            "source",
            "growth_daily_plan"
          )
          .contains("meta", {
            growth_plan_id: id,
          })
          .maybeSingle();

      if (queueCheckError) {
        return NextResponse.json(
          {
            success: false,
            error: queueCheckError.message,
          },
          { status: 500 }
        );
      }

      let scheduledPostId =
        alreadyQueued?.id || null;

      if (!alreadyQueued) {
        const nowIso =
          new Date().toISOString();

        const {
          data: scheduled,
          error: scheduleError,
        } = await supabaseAdmin
          .from("scheduled_posts")
          .insert({
            organisation_id:
              tenant.organisationId,
            message: selectedLinkedInPost,
            platforms: ["linkedin"],
            image_url: null,
            scheduled_for: nowIso,
            status: "scheduled",
            source: "growth_daily_plan",
            meta: {
              source: "growth_daily_plan",
              growth_plan_id: id,
              approved_at: nowIso,
              day_number:
                existing.day_number ?? null,
              target:
                existing.target ?? null,
            },
          })
          .select("id")
          .single();

        if (
          scheduleError ||
          !scheduled?.id
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                scheduleError?.message ||
                "Could not queue the selected LinkedIn post.",
            },
            { status: 500 }
          );
        }

        scheduledPostId =
          scheduled.id;
      }

      const { error: updateError } =
        await supabaseAdmin
          .from("growth_plans")
          .update({
            linkedin_post:
              selectedLinkedInPost,
            status: "approved",
            used: true,
          })
          .eq("id", id)
          .eq(
            "organisation_id",
            tenant.organisationId
          );

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
        linkedinQueued: true,
        scheduledPostId,
        alreadyQueued:
          !!alreadyQueued,
      });
    } catch (error: unknown) {
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to approve and run growth plan.",
        },
        { status: 500 }
      );
    }
  },
  {
    generation: false,
    write: true,
  }
);
