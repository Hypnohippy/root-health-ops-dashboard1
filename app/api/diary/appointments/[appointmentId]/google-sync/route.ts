import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncRootAppointment } from "@/lib/diaryGoogleCalendar.server";
export const dynamic = "force-dynamic";

export const POST = withTenantRoute(async (request, tenant) => {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).at(-2) || "");
  const { data, error } = await supabaseAdmin.from("appointments").select("*").eq("organisation_id", tenant.organisationId).eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, error: "Appointment not found." }, { status: 404 });
  if (data.google_calendar_sync_enabled !== true || data.status === "cancelled") return NextResponse.json({ success: false, error: "This appointment is not eligible for Google Calendar retry." }, { status: 409 });
  try {
    const result = await syncRootAppointment(data.organisation_id, data);
    return NextResponse.json({ success: true, googleMeetUrl: result.googleMeetUrl, googleMeetPending: result.googleMeetPending }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, error: "Google Calendar sync remains pending. Check the connection and retry." }, { status: 502 });
  }
}, { write: true });
