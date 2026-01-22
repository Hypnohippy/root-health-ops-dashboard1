// app/tiktok-developers-site-verification.txt/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const body = "tiktok-developers-site-verification=P6W3E8CfxKyF1EmqoWpO9y6wx8raoZzI";

  return new NextResponse(body + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
