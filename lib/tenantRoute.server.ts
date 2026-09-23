import { NextResponse } from "next/server";
import { AccessError, accessErrorResponse, requireOrganisation } from "@/lib/tenantAuth";
import { getOrganisationGenerationProfile } from "@/lib/organisationProfile.server";
import { generationMessages, type GenerationProfile } from "@/lib/tenantGeneration";

type TenantContext = Awaited<ReturnType<typeof requireOrganisation>> & {
  profile: GenerationProfile | null;
  messages: ReturnType<typeof generationMessages>;
};

// Resolve before any route handler can read tenant history, spend AI credits or
// mutate data. Never infer ownership from a target/experiment supplied by a caller.
export function withTenantRoute<R extends Request>(
  handler: (req: R, tenant: TenantContext) => Promise<Response>,
  options: { generation?: boolean; write?: boolean } = {},
) {
  return async (req: R) => {
    try {
      const query = new URL(req.url).searchParams;
      let body: Record<string, unknown> = {};
      if (!["GET", "HEAD"].includes(req.method)) {
        if (req.headers.get("content-type")?.includes("multipart/form-data")) {
          const form = await req.clone().formData();
          body = { organisationId: form.get("organisationId"), organisation_id: form.get("organisation_id") };
        } else {
          const parsed: unknown = await req.clone().json().catch(() => ({}));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
        }
      }
      const selections = [query.get("organisationId"), query.get("organisation_id"), body.organisationId, body.organisation_id]
        .filter(value => value !== null && value !== undefined && value !== "");
      if (selections.some(value => typeof value !== "string") || new Set(selections.map(value => String(value).trim())).size > 1) {
        throw new AccessError("Select one organisation explicitly.", 400);
      }
      const tenant = await requireOrganisation(selections[0], options.write ?? true);
      const profile = options.generation ? await getOrganisationGenerationProfile(tenant.organisationId) : null;
      const subjects = [body.subject, body.topic, body.scenario, body.prompt, body.sourceText, body.audience, body.title, body.notes, body.idea, body.name, body.goal, body.slideTitle, body.presentationTitle]
        .filter(value => typeof value === "string").join("\n");
      return await handler(req, { ...tenant, profile, messages: profile ? generationMessages(profile, subjects) : [] });
    } catch (error) {
      return accessErrorResponse(error) || NextResponse.json({ success: false, error: "Unable to complete this organisation request." }, { status: 503 });
    }
  };
}
