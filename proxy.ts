// proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Public pages you want accessible without sign-in
function isPublicPath(pathname: string) {
  // Next internals + assets
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/robots.txt")) return true;
  if (pathname.startsWith("/sitemap")) return true;

  // Your marketing site pages (keep public)
  if (pathname === "/") return true;
  if (pathname.startsWith("/pricing")) return true;
  if (pathname.startsWith("/how-it-works")) return true;
  if (pathname.startsWith("/colleges")) return true;

  // Auth pages/routes must remain public
  if (pathname.startsWith("/auth")) return true;
  if (pathname.startsWith("/api/auth")) return true;

  // Webhooks must remain public (adjust if you have these)
  if (pathname.startsWith("/api/webhooks")) return true;

  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Protect only:
  // - /dashboard/*
  // - /api/* (except the allowlisted ones above)
  const protecting =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/api/");

  if (!protecting) {
    return NextResponse.next();
  }

  // Create a response we can attach cookies to
  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

// Match only the areas we want to guard
export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
