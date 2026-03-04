// /proxy.ts
import { type NextRequest } from "next/server";
import { updateSession } from "./lib/supabaseProxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Match all paths EXCEPT:
    // - /api (route handlers)
    // - /_next (Next internals)
    // - /_vercel (Vercel internals)
    // - any path containing a dot (static files like favicon.ico, images, etc.)
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
