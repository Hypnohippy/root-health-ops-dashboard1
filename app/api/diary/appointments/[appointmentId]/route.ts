import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { DiaryAppointmentError, saveDiaryAppointment } from "@/lib/diaryAppointments.server";
import { cancelRootMirror, syncRootAppointment } from "@/lib/diaryGoogleCalendar.server";
export const dynamic = "force-dynamic";
const appointmentIdFrom = (request: Request) => decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).at(-1) || "");

export const PATCH = withTenantRoute(async (request, tenant) => {
  try {
    const appointmentId = appointmentIdFrom(request);
    const body = await request.json() as Record<string, unknown>;
    const appointment = await saveDiaryAppointment(tenant, "update", { ...body, id: appointmentId });
    let calendarSyncWarning: string | undefined;
    if (body.syncToGoogle === true || appointment.google_calendar_sync_enabled) { try { await syncRootAppointment(tenant.organisationId, appointment); } catch { calendarSyncWarning = "Root appointment saved; Google Calendar sync failed. Retry after checking the connection."; } }
    return NextResponse.json({ success: true, appointment, ...(calendarSyncWarning ? { calendarSyncWarning } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof DiaryAppointmentError ? error.status : 409;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Appointment could not be updated." }, { status });
  }
});

export const POST = withTenantRoute(async (request, tenant) => {
  try {
    const appointmentId = appointmentIdFrom(request);
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "cancel") throw new DiaryAppointmentError("Unsupported appointment action.", 400);
    const appointment = await saveDiaryAppointment(tenant, "cancel", { ...body, id: appointmentId });
    let calendarSyncWarning: string | undefined;
    if (appointment.google_calendar_sync_enabled || appointment.google_calendar_event_id) { try { await cancelRootMirror(tenant.organisationId, appointment); } catch { calendarSyncWarning = "Root cancellation saved, but Google Calendar mirror status could not be confirmed. Check Calendar before retrying."; } }
    return NextResponse.json({ success: true, appointment, ...(calendarSyncWarning ? { calendarSyncWarning } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof DiaryAppointmentError ? error.status : 409;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Appointment could not be cancelled." }, { status });
  }
});
