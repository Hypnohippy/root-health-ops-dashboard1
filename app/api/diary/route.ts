import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { readDiary } from "@/lib/diary.server";
import { addDateDays, validDate } from "@/lib/diaryAppointments";
import { isWriteRole } from "@/lib/tenantAuth";
import { isDiaryCalendarDiagnosticEnabled, isDiaryCalendarDiagnosticOrganisation } from "@/lib/diaryCalendarDiagnostic.server";
export const dynamic = "force-dynamic";
export const GET = withTenantRoute(async (request, tenant) => {
  const query = new URL(request.url).searchParams;
  if (query.get("calendarDiagnostic") === "1") {
    if (!isDiaryCalendarDiagnosticEnabled() || !isDiaryCalendarDiagnosticOrganisation(tenant.organisationId)) return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
    if (!isWriteRole(tenant.role)) return NextResponse.json({ success: false, error: "Insufficient organisation role." }, { status: 403 });
    try {
      const result = await readDiary(tenant, { from: "2026-11-17", to: "2026-11-18" }, { calendarDiagnostic: true });
      return NextResponse.json(result.calendarDiagnostic, { headers: { "Cache-Control": "private, no-store" } });
    } catch { return NextResponse.json({ success: false, error: "Calendar diagnostic could not be completed." }, { status: 503 }); }
  }
  const from = query.get("from") || undefined, to = query.get("to") || undefined;
  const start = from || undefined, end = to || (start ? addDateDays(start, 31) : undefined);
  if ((start && !validDate(start)) || (end && !validDate(end)) || (start && end && (end <= start || Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`) > 63 * 86400000))) {
    return NextResponse.json({ success: false, error: "Choose a valid Diary date range of up to 63 days." }, { status: 400 });
  }
  try { return NextResponse.json(await readDiary(tenant, { from: start, to: end }), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ success: false, error: "Diary could not be loaded." }, { status: 503 }); }
}, { write: false });
