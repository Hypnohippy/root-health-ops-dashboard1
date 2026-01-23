// app/tiktok0B7fkj4hG1N8gVPjVcpfwYAqJJCJ9k5h.txt/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// TikTok URL verification (signature file method)
// Must respond with HTTP 200 and the exact line below.
export async function GET() {
  const body =
    "tiktok-developers-site-verification=0B7fkj4hG1N8gVPjVcpfwYAqJJCJ9k5h";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Avoid any caching weirdness while verifying
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
