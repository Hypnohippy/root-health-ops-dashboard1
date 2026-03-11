import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL("/dashboard/connect", req.nextUrl.origin);
  url.searchParams.set("provider", "google");
  url.searchParams.set("test_callback_route", "1");
  url.searchParams.set("code", req.nextUrl.searchParams.get("code") || "missing");
  return NextResponse.redirect(url.toString(), { status: 302 });
}
