// app/api/media/upload/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // For now, just accept the request and respond OK.
    // We’ll wire this to Supabase storage later.
    return NextResponse.json({ ok: true, message: "Upload stub" }, { status: 200 });
  } catch (err: any) {
    console.error("Media upload error", err);
    return NextResponse.json(
      { error: "Server error", details: err?.message },
      { status: 500 }
    );
  }
}
