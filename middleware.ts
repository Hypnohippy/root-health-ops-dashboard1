// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const TIKTOK_PATH = "/tiktok0B7fkj4hG1N8gVPjVcpfwYAqJJCJ9k5h.txt";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Match BOTH:
  // /tiktok...txt
  // /tiktok...txt/
  if (pathname === TIKTOK_PATH || pathname === `${TIKTOK_PATH}/`) {
    const url = req.nextUrl.clone();
    url.pathname = "/tiktok-verify";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/tiktok0B7fkj4hG1N8gVPjVcpfwYAqJJCJ9k5h.txt",
    "/tiktok0B7fkj4hG1N8gVPjVcpfwYAqJJCJ9k5h.txt/",
  ],
};
