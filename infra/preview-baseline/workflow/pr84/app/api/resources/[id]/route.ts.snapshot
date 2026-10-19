import { NextRequest, NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { audienceResource } from "@/lib/presentationAudience";

export const GET = withTenantRoute(async (req: NextRequest, tenant) => {
  const id = req.nextUrl.pathname.split("/").pop();
  const { data, error } = await supabaseAdmin.from("resource_library").select("*").eq("id", id).eq("organisation_id", tenant.organisationId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Presentation not found." }, { status: 404 });
  return NextResponse.json({ resource: req.nextUrl.searchParams.get("view") === "audience" ? audienceResource(data) : data }, { headers: { "Cache-Control": "private, no-store" } });
}, { write: false });
