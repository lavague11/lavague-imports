import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Gate for managing the API-key vault. A single passphrase (DEV_PORTAL_PASSWORD)
 * unlocks it; the unlock is remembered in a short-lived cookie signed with
 * AUTH_SECRET. Both come from the environment (never the vault), so they
 * bootstrap the vault's own protection. Reading env values here is fine — this
 * is the one place that must not depend on the vault.
 */

const COOKIE = "lv_vault_unlock";
const TTL_HOURS = 8;

export function vaultLockConfigured(): boolean {
  return Boolean(process.env.DEV_PORTAL_PASSWORD && process.env.AUTH_SECRET);
}

function sign(exp: number): string {
  const body = String(exp);
  const sig = createHmac("sha256", process.env.AUTH_SECRET as string)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.DEV_PORTAL_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function unlock(): Promise<void> {
  const exp = Date.now() + TTL_HOURS * 3600_000;
  const store = await cookies();
  store.set(COOKIE, sign(exp), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_HOURS * 3600,
  });
}

export async function lock(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isUnlocked(): Promise<boolean> {
  if (!vaultLockConfigured()) return false;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !token.includes(".")) return false;
  const [body, sig] = token.split(".");
  const expected = createHmac("sha256", process.env.AUTH_SECRET as string)
    .update(body)
    .digest("base64url");
  const given = Buffer.from(sig);
  const exp = Buffer.from(expected);
  if (given.length !== exp.length || !timingSafeEqual(given, exp)) return false;
  return Number(body) > Date.now();
}
