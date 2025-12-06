// app/api/debug/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Handle GET /api/debug
export async function GET() {
  return NextResponse.json(
    { ok: true, method: "GET", message: "Debug route reached" },
    { status: 200 }
  );
}

// Handle POST /api/debug
export async function POST(req: NextRequest) {
  let bodyText = "";
  try {
    bodyText = await req.text();
  } catch {
    // ignore
  }

  return NextResponse.json(
    {
      ok: true,
      method: "POST",
      message: "Debug POST route reached",
      rawBody: bodyText || null,
    },
    { status: 200 }
  );
}
