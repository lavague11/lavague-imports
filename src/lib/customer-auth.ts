import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { requirePrisma } from "@/lib/db";

const COOKIE = "lv_customer_session";
const SESSION_DAYS = 30;

export type CustomerRole = "CUSTOMER" | "WHOLESALE";
export interface CustomerUser {
  id: string;
  email: string;
  name: string | null;
  role: CustomerRole;
}

export async function createCustomerSession(customerId: string): Promise<void> {
  const prisma = requirePrisma();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.customerSession.create({ data: { token, customerId, expiresAt } });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCustomerSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    try {
      await requirePrisma().customerSession.deleteMany({ where: { token } });
    } catch {
      /* ignore */
    }
  }
  store.delete(COOKIE);
}

/** The signed-in customer, or null. Never throws. */
export async function getCustomer(): Promise<CustomerUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const prisma = requirePrisma();
    const session = await prisma.customerSession.findUnique({
      where: { token },
      include: { customer: true },
    });
    if (session && session.expiresAt >= new Date()) {
      return {
        id: session.customer.id,
        email: session.customer.email,
        name: session.customer.name,
        role: session.customer.role as CustomerRole,
      };
    }
  } catch {
    /* DB unavailable */
  }
  return null;
}

export async function requireCustomer(): Promise<CustomerUser> {
  const customer = await getCustomer();
  if (!customer) throw new Error("Not authenticated");
  return customer;
}

/** Gate for wholesale-only areas (ordering, portal). */
export async function requireWholesale(): Promise<CustomerUser> {
  const customer = await requireCustomer();
  if (customer.role !== "WHOLESALE") throw new Error("Wholesale access required");
  return customer;
}
