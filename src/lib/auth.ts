import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { requirePrisma } from "@/lib/db";

const COOKIE = "lv_admin_session";
const SESSION_DAYS = 14;

export type Role = "ADMIN" | "EDITOR";
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

/* ---- password hashing (scrypt, no external deps) ---- */

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`scrypt$${salt.toString("hex")}$${key.toString("hex")}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [scheme, saltHex, keyHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !keyHex) return resolve(false);
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(keyHex, "hex");
    scrypt(password, salt, expected.length, (err, key) => {
      if (err) return resolve(false);
      resolve(key.length === expected.length && timingSafeEqual(key, expected));
    });
  });
}

/* ---- sessions ---- */

export async function createSession(userId: string): Promise<void> {
  const prisma = requirePrisma();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.adminSession.create({ data: { token, userId, expiresAt } });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    try {
      await requirePrisma().adminSession.deleteMany({ where: { token } });
    } catch {
      /* ignore */
    }
  }
  store.delete(COOKIE);
}

/** The signed-in admin, or null. Never throws. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const prisma = requirePrisma();
    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role as Role,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Admin role required");
  return user;
}
