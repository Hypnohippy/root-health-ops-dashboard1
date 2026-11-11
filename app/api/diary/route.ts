import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { readDiary } from "@/lib/diary.server";
import { addDateDays, validDate } from "@/lib/diaryAppointments";
export const dynamic = "force-dynamic";
export const GET = withTenantRoute(async (request, tenant) => {
  const query = new URL(request.url).searchParams, from = query.get("from") || undefined, to = query.get("to") || undefined;
  const start = from || undefined, end = to || (start ? addDateDays(start, 31) : undefined);
  if ((start && !validDate(start)) || (end && !validDate(end)) || (start && end && (end <= start || Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`) > 63 * 86400000))) {
    return NextResponse.json({ success: false, error: "Choose a valid Diary date range of up to 63 days." }, { status: 400 });
  }
  try { return NextResponse.json(await readDiary(tenant, { from: start, to: end }), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ success: false, error: "Diary could not be loaded." }, { status: 503 }); }
}, { write: false });
