import { NextResponse } from "next/server";

import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";
import { readWholesaleCart, writeWholesaleCart } from "@/lib/wholesale-cart";
import { usualItems } from "@/lib/wholesale-reorder";

// "Reorder all" — adds the customer's usual items (from past order requests, or
// from paid-invoice history for imported customers) to the current order
// request, then opens the cart. usualItems already restricts to active,
// wholesale-enabled products.
export async function POST() {
  const customer = await getCustomer();
  if (!customer || customer.role !== "WHOLESALE") {
    return new NextResponse(null, { status: 303, headers: { Location: "/login?next=/wholesale/order" } });
  }
  const prisma = getPrisma();
  if (!prisma) return new NextResponse(null, { status: 303, headers: { Location: "/wholesale/order" } });

  const items = await usualItems(prisma, customer.id);
  if (items.size) {
    const cart = await readWholesaleCart();
    for (const it of items.values()) {
      cart[it.slug] = Math.max(cart[it.slug] ?? 0, it.lastQty);
    }
    await writeWholesaleCart(cart);
  }
  return new NextResponse(null, { status: 303, headers: { Location: "/wholesale/cart" } });
}
