import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { readDiaryAppointments, saveDiaryAppointment, DiaryAppointmentError } from "@/lib/diaryAppointments.server";
export const dynamic = "force-dynamic";

export const GET = withTenantRoute(async (_request, tenant) => {
  try { return NextResponse.json({ appointments: await readDiaryAppointments(tenant.organisationId) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ success: false, error: "Appointments could not be loaded." }, { status: 503 }); }
}, { write: false });

export const POST = withTenantRoute(async (request, tenant) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    const appointment = await saveDiaryAppointment(tenant, "create", body);
    return NextResponse.json({ success: true, appointment }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof DiaryAppointmentError ? error.status : 409;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Appointment could not be created." }, { status });
  }
});
