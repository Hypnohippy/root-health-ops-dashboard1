import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { advisorRequest } from "@/lib/rootCoachAdvisor";
import { rootCoachAdvisor } from "@/lib/rootCoachAdvisor.server";
export const runtime = "nodejs";
export const POST = withTenantRoute(async (req, tenant) => {
  if (!req.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Use JSON." }, { status: 415 });
  const text = await req.text();
  if (text.length > 4096) return NextResponse.json({ error: "Keep advice requests short." }, { status: 400 });
  let request;
  try { request = advisorRequest(JSON.parse(text)); } catch { return NextResponse.json({ error: "Choose an existing relationship and a bounded advice question. Supplied conversation or identity data is not accepted." }, { status: 400 }); }
  const answer = await rootCoachAdvisor(request, tenant);
  return NextResponse.json(answer, { headers: { "Cache-Control": "private, no-store" } });
}, { write: false });
