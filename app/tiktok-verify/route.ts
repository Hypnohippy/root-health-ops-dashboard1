// app/tiktok-verify/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const body =
    "tiktok-developers-site-verification=0B7fkj4hG1N8gVPjVcpfwYAqJJCJ9k5h";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
