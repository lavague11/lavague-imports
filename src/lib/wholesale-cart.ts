import "server-only";

import { cookies } from "next/headers";

// Wholesale "order request" cart. Stores only { slug: cases } in a cookie —
// NEVER any price. Wholesale accounts submit a request in cases; admin quotes it.
export const WHOLESALE_CART_COOKIE = "lv_wholesale_cart";
const MAX_CASES = 9999;

export type WholesaleCart = Record<string, number>;

export async function readWholesaleCart(): Promise<WholesaleCart> {
  const store = await cookies();
  const raw = store.get(WHOLESALE_CART_COOKIE)?.value;
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return {};
    const out: WholesaleCart = {};
    for (const [slug, v] of Object.entries(obj as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (slug && Number.isFinite(n) && n > 0) out[slug] = Math.min(n, MAX_CASES);
    }
    return out;
  } catch {
    return {};
  }
}

/** Write the cart cookie. Only call from route handlers / server actions. */
export async function writeWholesaleCart(cart: WholesaleCart): Promise<void> {
  const store = await cookies();
  const entries = Object.entries(cart).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) {
    store.delete(WHOLESALE_CART_COOKIE);
    return;
  }
  store.set(WHOLESALE_CART_COOKIE, JSON.stringify(Object.fromEntries(entries)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function cartCount(cart: WholesaleCart): number {
  return Object.keys(cart).length;
}
