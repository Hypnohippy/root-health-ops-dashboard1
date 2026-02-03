// lib/supabaseService.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-only

if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)"
  );
}

// Service-role client bypasses RLS (server only)
export const supabaseService = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});
