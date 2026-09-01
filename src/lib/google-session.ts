import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * A lightweight, database-free session for "Sign in with Google". The user's
 * Google profile is stored in a signed, HTTP-only cookie (HMAC-SHA256 over the
 * payload with AUTH_SECRET). No DB row is needed, so login works even while
 * Postgres is unavailable. This is intentionally separate from the DB-backed
 * admin session in lib/auth.ts.
 */

const COOKIE = "lv_google_session";
const MAX_AGE_DAYS = 30;

export interface GoogleUser {
  sub: string; // Google account id
  email: string;
  name: string | null;
  picture: string | null;
  /** issued-at (seconds) */
  iat: number;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function signSession(user: Omit<GoogleUser, "iat">): string {
  const payload: GoogleUser = { ...user, iat: Math.floor(Date.now() / 1000) };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): GoogleUser | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", secret()).update(body).digest();
  } catch {
    return null;
  }
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const user = JSON.parse(Buffer.from(body, "base64url").toString()) as GoogleUser;
    const ageDays = (Date.now() / 1000 - user.iat) / 86400;
    if (ageDays > MAX_AGE_DAYS) return null;
    return user;
  } catch {
    return null;
  }
}

export async function setGoogleSession(user: Omit<GoogleUser, "iat">): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_DAYS * 86400,
  });
}

export async function clearGoogleSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** The signed-in Google user, or null. Never throws. */
export async function getGoogleUser(): Promise<GoogleUser | null> {
  const store = await cookies();
  return verifySession(store.get(COOKIE)?.value);
}
