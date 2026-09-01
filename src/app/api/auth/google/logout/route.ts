import { NextResponse } from "next/server";

import { clearGoogleSession } from "@/lib/google-session";

// Clears the Google session cookie and returns to the portal.
export async function POST(request: Request) {
  await clearGoogleSession();
  return NextResponse.redirect(new URL("/developers", request.url), { status: 303 });
}
