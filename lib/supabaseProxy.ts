// lib/supabaseProxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  function writeCookie(name: string, value: string, options: Parameters<typeof response.cookies.set>[2]) {
    request.cookies.set(name, value);
    const previous = response.cookies.getAll();
    response = NextResponse.next({ request });
    previous.forEach(cookie => response.cookies.set(cookie));
    response.cookies.set(name, value, { ...options, path: "/" });
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set: writeCookie,
      remove(name: string, options: Parameters<typeof response.cookies.set>[2]) {
        writeCookie(name, "", { ...options, maxAge: 0 });
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}
