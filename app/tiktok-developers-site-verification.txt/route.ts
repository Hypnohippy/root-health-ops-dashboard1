// app/tiktok-developers-site-verification.txt/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Put your exact verification string here (no extra spaces, no quotes)
  const body =
    "tiktok-developers-site-verification=KyXjC1tFfbrMIqwbu55pu6UjTLvHReUIl";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
