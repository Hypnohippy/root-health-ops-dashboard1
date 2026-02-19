import { NextResponse } from "next/server";

const BASE_TRENDS = [
  "ADHD overwhelm",
  "workplace anxiety",
  "burnout recovery",
  "sleep hygiene",
  "nervous system regulation",
  "emotional boundaries",
  "high functioning depression",
  "self compassion practice",
];

function expandTrend(t: string) {
  return {
    topic: t,
    hooks: [
      `3 things nobody tells you about ${t}`,
      `If you struggle with ${t}, read this`,
      `A gentle tip for ${t}`,
      `Why ${t} isn’t what you think`,
    ],
  };
}

export async function GET() {
  try {
    const trends = BASE_TRENDS.map(expandTrend);
    return NextResponse.json({ success: true, trends, source: "trend_radar_v1" });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Trend load failed" },
      { status: 500 }
    );
  }
}
