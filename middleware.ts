// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function looksSignedIn(req: NextRequest) {
  const cookieNames = req.cookies.getAll().map((c) => c.name);

  // Common Supabase auth cookie patterns (varies by setup)
  const hasSupabaseToken =
    cookieNames.some((n) => n === "supabase-auth-token") ||
    cookieNames.some((n) => n.startsWith("sb-") && n.includes("auth-token")) ||
    cookieNames.some((n) => n.startsWith("sb-") && n.includes("access-token")) ||
    cookieNames.some((n) => n.startsWith("sb-") && n.includes("refresh-token"));

  return hasSupabaseToken;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect the app area
  if (pathname.startsWith("/dashboard")) {
    if (!looksSignedIn(req)) {
      const url = req.nextUrl.clone();
      url.pathname = "/pricing";
      url.searchParams.set("blocked", "1");
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
