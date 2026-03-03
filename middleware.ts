// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPublicPath(pathname: string) {
  // Allow Next internals + public assets
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/robots.txt")) return true;
  if (pathname.startsWith("/sitemap")) return true;

  // Allow auth routes (adjust to match your app)
  if (pathname.startsWith("/auth")) return true;

  // Allow Supabase auth callback route if you have one
  if (pathname.startsWith("/api/auth")) return true;

  // Allow webhooks if you use them (Stripe, Ayrshare etc.)
  if (pathname.startsWith("/api/webhooks")) return true;

  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // We protect:
  // - /dashboard/*
  // - /api/* (except those allowlisted above)
  const protecting =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/api/");

  if (!protecting) {
    return NextResponse.next();
  }

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

  // If there is no logged-in user, redirect to sign-in
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/sign-in"; // change if your sign-in route differs
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
