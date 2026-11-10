import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { DiaryAppointmentError, saveDiaryAppointment } from "@/lib/diaryAppointments.server";
export const dynamic = "force-dynamic";
const appointmentIdFrom = (request: Request) => decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).at(-1) || "");

export const PATCH = withTenantRoute(async (request, tenant) => {
  try {
    const appointmentId = appointmentIdFrom(request);
    const body = await request.json() as Record<string, unknown>;
    const appointment = await saveDiaryAppointment(tenant, "update", { ...body, id: appointmentId });
    return NextResponse.json({ success: true, appointment }, { headers: { "Cache-Control": "no-store" } });
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
    return NextResponse.json({ success: true, appointment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof DiaryAppointmentError ? error.status : 409;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Appointment could not be cancelled." }, { status });
  }
});
