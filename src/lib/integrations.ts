import "server-only";

import { hasKey } from "@/lib/vault";

/**
 * Registry of third-party integrations, surfaced in the /developers portal.
 *
 * The portal reads this to show each integration's status and setup steps. It
 * reports only whether an integration is *configured* (which env vars are
 * present) — it never exposes the values. Secrets stay server-side; only the
 * Maps browser key is public by design (it ships in the client bundle).
 */

export interface EnvVar {
  name: string;
  /** true = a browser/public value (safe to expose); false = server secret. */
  public?: boolean;
  note: string;
}

export interface Integration {
  id: string;
  name: string;
  blurb: string;
  /** Google Cloud / provider console URL for obtaining credentials. */
  consoleUrl: string;
  /** Env vars this integration needs, in setup order. */
  env: EnvVar[];
  /** Human setup steps shown in the portal. */
  steps: string[];
  /** True when every required (non-optional) env var is set. */
  configured: boolean;
  /** OAuth scopes requested, if any (shown for reference). */
  scopes?: string[];
  status: "live" | "needs-keys" | "scaffolded";
}

/** The site's public base URL, trimmed. Used to compute redirect URIs. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** The single OAuth redirect URI to register in Google Cloud. */
export function googleRedirectUri(): string {
  return `${siteUrl()}/api/auth/google/callback`;
}

// Vault-aware: a key counts as set if it's in the vault or the environment.
// AUTH_SECRET stays env-only (it protects the vault), so check it directly.
const has = (...names: string[]) => names.every((n) => hasKey(n));

export function googleOAuthConfigured(): boolean {
  return has("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET") && Boolean(process.env.AUTH_SECRET);
}

export function mapsConfigured(): boolean {
  return has("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
}

export function calendarConfigured(): boolean {
  // Calendar rides on the same OAuth client; it additionally needs a calendar id.
  return googleOAuthConfigured() && has("GOOGLE_CALENDAR_ID");
}

export function getIntegrations(): Integration[] {
  const redirect = googleRedirectUri();
  const origin = siteUrl();
  return [
    {
      id: "google-maps",
      name: "Google Maps",
      blurb: "Embed an interactive map of the Little Ferry warehouse and power future delivery-zone and store-locator features.",
      consoleUrl: "https://console.cloud.google.com/google/maps-apis/credentials",
      env: [
        {
          name: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
          public: true,
          note: "Browser key for the Maps JavaScript / Embed API. Restrict it by HTTP referrer to your domain.",
        },
      ],
      steps: [
        "In Google Cloud, enable the “Maps Embed API” (and “Maps JavaScript API” for interactive maps).",
        "Create an API key under Credentials.",
        `Restrict the key to the referrer ${origin}/* so it can’t be reused elsewhere.`,
        "Add the key to .env as NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and redeploy.",
      ],
      configured: mapsConfigured(),
      status: mapsConfigured() ? "live" : "needs-keys",
    },
    {
      id: "google-auth",
      name: "Sign in with Google",
      blurb: "OAuth 2.0 login. Sets a signed, HTTP-only session cookie — no database row required, so it works even while Postgres is unavailable.",
      consoleUrl: "https://console.cloud.google.com/apis/credentials",
      env: [
        { name: "GOOGLE_OAUTH_CLIENT_ID", note: "OAuth 2.0 Client ID (Web application)." },
        { name: "GOOGLE_OAUTH_CLIENT_SECRET", note: "OAuth 2.0 Client secret. Server-only." },
        { name: "AUTH_SECRET", note: "Random 32+ byte string used to sign the session cookie (openssl rand -hex 32)." },
      ],
      steps: [
        "In Google Cloud → APIs & Services → Credentials, create an OAuth 2.0 Client ID of type “Web application”.",
        `Add ${origin} to “Authorized JavaScript origins”.`,
        `Add ${redirect} to “Authorized redirect URIs”.`,
        "Configure the OAuth consent screen (external), adding the scopes openid, email, profile.",
        "Put the client ID, client secret, and an AUTH_SECRET into .env, then use the Connect button below.",
      ],
      scopes: ["openid", "email", "profile"],
      configured: googleOAuthConfigured(),
      status: googleOAuthConfigured() ? "live" : "needs-keys",
    },
    {
      id: "google-calendar",
      name: "Google Calendar",
      blurb: "Create pickup/delivery-window events on a shared calendar. Uses the same OAuth client with offline access; event writes are the next build step (they need durable token storage).",
      consoleUrl: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
      env: [
        { name: "GOOGLE_CALENDAR_ID", note: "The target calendar’s ID (e.g. the shared “Deliveries” calendar address)." },
      ],
      steps: [
        "Enable the “Google Calendar API” in your Google Cloud project (same project as the OAuth client above).",
        "Add the scope https://www.googleapis.com/auth/calendar.events to the consent screen.",
        "Create or pick a calendar and copy its Calendar ID into .env as GOOGLE_CALENDAR_ID.",
        "Connect with the calendar scope, then implement event creation against the stored refresh token.",
      ],
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      configured: calendarConfigured(),
      status: "scaffolded",
    },
  ];
}
