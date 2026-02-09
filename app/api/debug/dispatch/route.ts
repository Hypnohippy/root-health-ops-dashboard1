import { NextResponse } from "next/server";

export const runtime = "nodejs";

function mask(s: string) {
  const t = (s || "").trim();
  if (!t) return "";
  if (t.length <= 4) return "*".repeat(t.length);
  return `${t.slice(0, 2)}***${t.slice(-2)}`;
}

export async function GET() {
  const secret = (process.env.DISPATCH_SECRET || "").trim();
  const disabled = (process.env.DISPATCH_DISABLED || "").trim() === "1";

  return NextResponse.json({
    ok: true,
    disabled,
    hasSecret: !!secret,
    secretMasked: mask(secret),
    secretLength: secret.length,
    nodeEnv: process.env.NODE_ENV || null,
  });
}
