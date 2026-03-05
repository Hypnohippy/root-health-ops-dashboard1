// lib/supabaseServer.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)"
  );
}

/**
 * ✅ Next 16 note:
 * `cookies()` is async in Server Components/layouts.
 * This helper is intended for SERVER CONTEXT usage (layouts, server components, route handlers).
 *
 * For layouts/server components we generally DO NOT need to set cookies here,
 * because your `proxy.ts` refreshes the session cookies on real requests.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      /**
       * In Server Components/layouts: setting cookies is not reliable.
       * Your proxy/session refresh handles it, so we safely no-op here.
       */
      setAll() {},
    },
  });
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[auth] getCurrentUserId error", error);
    return null;
  }

  return data.user?.id ?? null;
}
