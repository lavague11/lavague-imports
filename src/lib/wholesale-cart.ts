import "server-only";

import { cookies } from "next/headers";

// Wholesale "order request" cart. Stores only { slug: cases } in a cookie —
// NEVER any price. Wholesale accounts submit a request in cases; admin quotes it.
//
// The cookie is namespaced to one account: the payload carries the owning
// customer id ({ c, items }), and a cart is honored only for that customer. A
// draft written by customer A is treated as empty for customer B, so one
// account can't inherit another's draft on a shared device. It is also cleared
// outright on login and logout (see customer-auth). Carts saved in the older
// un-namespaced shape (a bare { slug: cases } with no `c`) are ignored.
export const WHOLESALE_CART_COOKIE = "lv_wholesale_cart";
const MAX_CASES = 9999;

export type WholesaleCart = Record<string, number>;

interface CartPayload {
  c?: unknown;
  items?: unknown;
}

function sanitizeItems(obj: unknown): WholesaleCart {
  const out: WholesaleCart = {};
  if (obj && typeof obj === "object") {
    for (const [slug, v] of Object.entries(obj as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (slug && Number.isFinite(n) && n > 0) out[slug] = Math.min(n, MAX_CASES);
    }
  }
  return out;
}

/** The current account's cart, or {} when the cookie belongs to another account
 *  (or is in the old un-namespaced shape, or there is no customer id). */
export async function readWholesaleCart(customerId: string): Promise<WholesaleCart> {
  if (!customerId) return {};
  const store = await cookies();
  const raw = store.get(WHOLESALE_CART_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const { c, items } = parsed as CartPayload;
    if (c !== customerId) return {}; // not this account's cart
    return sanitizeItems(items);
  } catch {
    return {};
  }
}

/** Write the cart cookie, stamped with the owning customer id. Only call from
 *  route handlers / server actions. An empty cart deletes the cookie. */
export async function writeWholesaleCart(customerId: string, cart: WholesaleCart): Promise<void> {
  const store = await cookies();
  if (!customerId) {
    store.delete(WHOLESALE_CART_COOKIE);
    return;
  }
  const items = sanitizeItems(cart);
  if (Object.keys(items).length === 0) {
    store.delete(WHOLESALE_CART_COOKIE);
    return;
  }
  store.set(WHOLESALE_CART_COOKIE, JSON.stringify({ c: customerId, items }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Remove the wholesale cart cookie entirely. Called on login and logout so a
 *  draft never carries between sessions or accounts on a shared device. */
export async function clearWholesaleCart(): Promise<void> {
  const store = await cookies();
  store.delete(WHOLESALE_CART_COOKIE);
}

export function cartCount(cart: WholesaleCart): number {
  return Object.keys(cart).length;
}
