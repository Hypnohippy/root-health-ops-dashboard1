// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;

// NOTE: We are intentionally focusing on Instagram here.
// Other platforms can remain handled by your other direct routes.
type Platform = "instagram";

async function igCreateContainer(args: {
  caption: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}) {
  if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
    return {
      ok: false,
      status: 400,
      error:
        "Instagram
