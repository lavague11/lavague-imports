import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth";

// Logout as a full-page POST → HTTP redirect (not a client-side RSC navigation).
// This avoids stale cached navigation payloads and always lands on fresh HTML.
export async function POST(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
