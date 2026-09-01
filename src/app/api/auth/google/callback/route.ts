import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exchangeCode, fetchProfile } from "@/lib/google-oauth";
import { setGoogleSession } from "@/lib/google-session";
import { googleOAuthConfigured } from "@/lib/integrations";

const STATE_COOKIE = "lv_oauth_state";

// OAuth redirect target. Validates the CSRF state, exchanges the code for
// tokens, reads the Google profile, and sets the signed session cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/developers?auth_error=${encodeURIComponent(reason)}`, request.url));

  if (!googleOAuthConfigured()) return fail("not-configured");
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error")!);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!code || !state || !expected || state !== expected) return fail("state-mismatch");

  // state is "nonce:next"; only allow same-origin relative redirects.
  const next = state.split(":").slice(1).join(":") || "/developers";
  const safeNext = next.startsWith("/") ? next : "/developers";

  try {
    const tokens = await exchangeCode(code);
    const profile = await fetchProfile(tokens.access_token);
    await setGoogleSession({
      sub: profile.sub,
      email: profile.email,
      name: profile.name ?? null,
      picture: profile.picture ?? null,
    });
    // NOTE: tokens.refresh_token (present when calendar/offline was requested)
    // is where Calendar event writes will hook in — persist it per user once a
    // durable store is available.
    return NextResponse.redirect(new URL(safeNext, request.url));
  } catch (error) {
    console.error("[google-oauth] callback failed", error);
    return fail("exchange-failed");
  }
}
