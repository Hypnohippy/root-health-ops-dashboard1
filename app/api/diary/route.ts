import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { readDiary } from "@/lib/diary.server";
export const dynamic = "force-dynamic";
export const GET = withTenantRoute(async (_request, tenant) => NextResponse.json(await readDiary(tenant), { headers: { "Cache-Control": "no-store" } }), { write: false });
