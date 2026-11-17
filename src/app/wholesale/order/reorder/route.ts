import { NextResponse } from "next/server";

import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";
import { readWholesaleCart, writeWholesaleCart } from "@/lib/wholesale-cart";

// "Reorder all" — adds the customer's usual items (last cases ordered, still
// orderable) to the current order request, then opens the cart.
export async function POST() {
  const customer = await getCustomer();
  if (!customer || customer.role !== "WHOLESALE") {
    return new NextResponse(null, { status: 303, headers: { Location: "/login?next=/wholesale/order" } });
  }
  const prisma = getPrisma();
  if (!prisma) return new NextResponse(null, { status: 303, headers: { Location: "/wholesale/order" } });

  const past = await prisma.orderRequestLine.findMany({
    where: { request: { customerId: customer.id }, slug: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { slug: true, cases: true },
  });
  const lastCases = new Map<string, number>();
  for (const l of past) if (l.slug && !lastCases.has(l.slug)) lastCases.set(l.slug, l.cases);

  const slugs = [...lastCases.keys()];
  if (slugs.length) {
    const valid = await prisma.product.findMany({
      where: { slug: { in: slugs }, isActive: true, wholesaleEnabled: true },
      select: { slug: true },
    });
    const cart = await readWholesaleCart();
    for (const p of valid) {
      const n = lastCases.get(p.slug) ?? 1;
      cart[p.slug] = Math.max(cart[p.slug] ?? 0, n);
    }
    await writeWholesaleCart(cart);
  }
  return new NextResponse(null, { status: 303, headers: { Location: "/wholesale/cart" } });
}
