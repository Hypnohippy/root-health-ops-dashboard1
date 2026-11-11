import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { readDiaryAppointments, saveDiaryAppointment, DiaryAppointmentError, publicDiaryAppointment } from "@/lib/diaryAppointments.server";
import { syncRootAppointment } from "@/lib/diaryGoogleCalendar.server";
export const dynamic = "force-dynamic";

export const GET = withTenantRoute(async (_request, tenant) => {
  try { return NextResponse.json({ appointments: (await readDiaryAppointments(tenant.organisationId)).map(publicDiaryAppointment) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ success: false, error: "Appointments could not be loaded." }, { status: 503 }); }
}, { write: false });

export const POST = withTenantRoute(async (request, tenant) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    const appointment = await saveDiaryAppointment(tenant, "create", body);
    let calendarSyncWarning: string | undefined;
    let syncResult: Awaited<ReturnType<typeof syncRootAppointment>> | undefined;
    if (body.syncToGoogle === true || appointment.google_meet_enabled || appointment.google_calendar_attendee_email) {
      try { syncResult = await syncRootAppointment(tenant.organisationId, appointment); if (syncResult.googleMeetPending) calendarSyncWarning = "The Google Calendar event is saved. Google is still preparing the Meet link; no attendee invitation has been sent yet."; }
      catch { calendarSyncWarning = "Root appointment saved; Google Calendar sync failed. Retry after checking the connection."; }
    }
    const safeAppointment = publicDiaryAppointment({ ...appointment, ...(syncResult ? { google_meet_url: syncResult.googleMeetUrl, google_calendar_sync_pending: syncResult.googleMeetPending } : {}) });
    return NextResponse.json({ success: true, appointment: safeAppointment, ...(calendarSyncWarning ? { calendarSyncWarning } : {}) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof DiaryAppointmentError ? error.status : 409;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Appointment could not be created." }, { status });
  }
});
