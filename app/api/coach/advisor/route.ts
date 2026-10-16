import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { advisorRequest } from "@/lib/rootCoachAdvisor";
import { rootCoachAdvisor } from "@/lib/rootCoachAdvisor.server";
export const runtime = "nodejs";
const advisorPOST = withTenantRoute(async (req, tenant) => {
  if (!req.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Use JSON." }, { status: 415 });
  const text = await req.text();
  if (text.length > 4096) return NextResponse.json({ error: "Keep advice requests short." }, { status: 400 });
  let request;
  try { request = advisorRequest(JSON.parse(text)); } catch { return NextResponse.json({ error: "Choose an existing relationship and a bounded advice question. Supplied conversation or identity data is not accepted." }, { status: 400 }); }
  const answer = await rootCoachAdvisor(request, tenant);
  return NextResponse.json(answer, { headers: { "Cache-Control": "private, no-store" } });
}, { write: false });
export async function POST(req: Request) {
  // Bound the stream before the tenant wrapper clones/parses JSON.
  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Supply a short advice question." }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); return NextResponse.json({ error: "Keep advice requests short." }, { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return advisorPOST(new Request(req.url, { method: "POST", headers: req.headers, body: Buffer.concat(chunks) }));
}
