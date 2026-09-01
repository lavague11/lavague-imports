import "server-only";

import { googleRedirectUri } from "@/lib/integrations";

/**
 * Minimal Google OAuth 2.0 (authorization-code) helpers — no external SDK.
 * Used by the /api/auth/google/* routes. Profile is read from the UserInfo
 * endpoint with the access token, so we don't verify the id_token signature
 * ourselves.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export const BASE_SCOPES = ["openid", "email", "profile"];
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function clientId(): string {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const s = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!s) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET is not set");
  return s;
}

export function buildAuthUrl(opts: { state: string; scopes?: string[]; offline?: boolean }): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: (opts.scopes ?? BASE_SCOPES).join(" "),
    state: opts.state,
    include_granted_scopes: "true",
  });
  if (opts.offline) {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  return res.json();
}
