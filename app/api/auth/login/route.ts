import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type CookieToSet = {
  name: string;
  value: string;
  options?: {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };
};

function cookieDomainForHost(hostname: string): string | undefined {
  const host = String(hostname || "").toLowerCase();

  // For local dev, do not set domain
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost")
  ) {
    return undefined;
  }

  // Share across roothealthops.com and www.roothealthops.com
  if (host === "roothealthops.com" || host === "www.roothealthops.com") {
    return "roothealthops.com";
  }

  // For preview/vercel hosts, keep host-only
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Missing email or password" },
        { status: 400 }
      );
    }

    const pendingCookies: CookieToSet[] = [];

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          pendingCookies.push(...cookiesToSet);
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    const response = NextResponse.json(
      { success: true, userId: data.user?.id ?? null },
      { status: 200 }
    );

    const domain = cookieDomainForHost(req.nextUrl.hostname);
    const secure = req.nextUrl.protocol === "https:";

    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, {
        ...options,
        path: "/",
        domain,
        secure,
        sameSite: "lax",
      });
    }

    return response;
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Login failed" },
      { status: 500 }
    );
  }
}
