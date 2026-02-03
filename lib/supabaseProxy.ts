import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function updateSession(request: NextRequest) {
  // Create an initial response we can attach cookies to
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 1) Make sure the request has the updated cookies
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        // 2) Make sure the browser receives updated cookies
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: getClaims validates the JWT and refreshes if needed
  await supabase.auth.getClaims();

  return response;
}
