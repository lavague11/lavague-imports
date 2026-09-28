import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth";
import { clearGoogleSession } from "@/lib/google-session";

// Logout as a full-page POST → HTTP redirect (not a client-side RSC navigation).
// This avoids stale cached navigation payloads and always lands on fresh HTML.
//
// The Location is RELATIVE on purpose: behind Hostinger's proxy `request.url`
// is the internal origin (https://0.0.0.0:3000), so an absolute redirect built
// from it would send the browser to an unreachable address. A relative Location
// is resolved by the browser against the public URL in the address bar.
export async function POST() {
  await destroySession();
  await clearGoogleSession(); // also end a Google-based admin session
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin/login" },
  });
}
