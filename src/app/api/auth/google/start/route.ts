import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { BASE_SCOPES, CALENDAR_SCOPE, buildAuthUrl } from "@/lib/google-oauth";
import { googleOAuthConfigured } from "@/lib/integrations";

const STATE_COOKIE = "lv_oauth_state";

// Begins the Google OAuth flow. Pass ?calendar=1 to additionally request the
// Calendar scope (offline access), and ?next=/path to control the post-login
// redirect. A random state is stashed in a short-lived cookie for CSRF checking.
export async function GET(request: Request) {
  if (!googleOAuthConfigured()) {
    return NextResponse.json(
      { error: "not-configured", detail: "Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and AUTH_SECRET. See /developers." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const wantsCalendar = url.searchParams.get("calendar") === "1";
  const next = url.searchParams.get("next") || "/developers";
  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}:${next}`;

  const scopes = wantsCalendar ? [...BASE_SCOPES, CALENDAR_SCOPE] : BASE_SCOPES;
  const authUrl = buildAuthUrl({ state, scopes, offline: wantsCalendar });

  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authUrl);
}
