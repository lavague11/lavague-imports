import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cheap gate: /admin/* requires a session cookie (full validation happens in the
// pages/actions via getCurrentUser). /admin/login is always reachable.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const token = req.cookies.get("lv_admin_session")?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
