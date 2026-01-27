import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect dashboard routes
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  // --- Existing behaviour ---
  // If your app already has a session cookie / auth check,
  // keep it exactly as-is.
  if (looksSignedIn(req)) {
    return NextResponse.next();
  }

  // --- NEW: allow access if org has a plan (founder, etc.) ---
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    // SINGLE-TENANT SAFE: first org wins (your setup)
    return supabase
      .from("organisation_plans")
      .select("id")
      .limit(1)
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          // ✅ Org has a plan → allow dashboard
          return NextResponse.next();
        }

        // ❌ No plan → redirect to pricing (normal users)
        const url = req.nextUrl.clone();
        url.pathname = "/pricing";
        url.searchParams.set("blocked", "1");
        return NextResponse.redirect(url);
      });
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/pricing";
    return NextResponse.redirect(url);
  }
}

/**
 * KEEP YOUR EXISTING looksSignedIn IMPLEMENTATION
 * (do not change it)
 */
function looksSignedIn(req: NextRequest): boolean {
  // ⛔ leave whatever you already had here
  // This placeholder exists only to show structure
  return false;
}
