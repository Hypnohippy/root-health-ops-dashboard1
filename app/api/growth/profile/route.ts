import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authorizeIngestion,
  IngestionError,
  uuid,
} from "@/lib/growthIngestion.server";
import { normaliseProfile } from "@/lib/brandGrowthProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, max: number, required = false) {
  if (value == null && !required) return "";

  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  ) {
    throw new IngestionError("Invalid profile request.");
  }

  return value.trim();
}

export async function POST(req: Request) {
  try {
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      throw new IngestionError("Use application/json.", 415);
    }

    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      throw new IngestionError("Invalid JSON.");
    }

    const organisationId = clean(body.organisation_id, 36, true).toLowerCase();
    const sourceEngine = clean(body.source_engine, 100, true);

    if (!uuid.test(organisationId)) {
      throw new IngestionError("Explicit organisation_id is required.");
    }

    authorizeIngestion(
      req.headers.get("authorization"),
      organisationId,
      [sourceEngine]
    );

    const { data: storedProfile, error: profileError } = await supabaseAdmin
      .from("organisation_profiles")
      .select("profile")
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (profileError) throw profileError;

    const { data: organisation, error: organisationError } = await supabaseAdmin
      .from("organisations")
      .select("name")
      .eq("id", organisationId)
      .maybeSingle();

    if (organisationError) throw organisationError;

    const profile = normaliseProfile(storedProfile?.profile, {
      businessName: String(organisation?.name || ""),
    });

    return NextResponse.json(
      {
        success: true,
        organisation_id: organisationId,
        profile: {
          yourName: profile.yourName,
          businessName: profile.businessName,
          contactEmail: profile.contactEmail,
          website: profile.website,
          businessDescription: profile.businessDescription,
          audience: profile.audience,
          customerProblems: profile.customerProblems,
          desiredOutcomes: profile.desiredOutcomes,
          primaryOffer: profile.primaryOffer,
          cta: profile.cta,
          destinationUrl: profile.destinationUrl,
          geography: profile.geography,
          priorityServices: profile.priorityServices,
          excludedTopics: profile.excludedTopics,
          brandTone: profile.brandTone,
          commonCustomerQuestions: profile.commonCustomerQuestions,
          growthMode: profile.growthMode,
          footerText: profile.footerText,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof IngestionError
            ? error.message
            : "Unable to load organisation profile.",
      },
      {
        status: error instanceof IngestionError ? error.status : 503,
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  }
}
