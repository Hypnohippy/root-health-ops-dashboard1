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
  options?: any;
};

export async function POST(req: NextRequest) {
  try {
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

    await supabase.auth.signOut();

    const response = NextResponse.json({ success: true }, { status: 200 });

    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Logout failed" },
      { status: 500 }
    );
  }
}
