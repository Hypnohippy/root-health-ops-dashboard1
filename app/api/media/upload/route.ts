// app/api/media/upload/route.ts
import { NextResponse } from "next/server";

// Temporary stub so the app compiles.
// You can replace this later with real upload logic.
export async function POST() {
  return NextResponse.json(
    { error: "Media upload not implemented yet" },
    { status: 501 }
  );
}
