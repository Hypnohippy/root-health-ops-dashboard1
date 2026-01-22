// app/tiktok-developers-site-verification.txt/[...slug]/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VERIFY_LINE =
  "tiktok-developers-site-verification=P6W3E8CfxKyF1EmqoWpO9y6wx8raoZzI";

export async function GET() {
  // This catches the trailing slash version:
  // /tiktok-developers-site-verification.txt/
  // and any weird extra bits TikTok might try.
  return new NextResponse(VERIFY_LINE + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
