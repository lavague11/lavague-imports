import { NextResponse } from "next/server";

import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";
import { readWholesaleCart, writeWholesaleCart } from "@/lib/wholesale-cart";

// Reorder a specific past order: add its still-orderable lines to the cart.
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await getCustomer();
  if (!customer || customer.role !== "WHOLESALE") {
    return redirectTo("/login?next=/account/orders");
  }

  const { id } = await params;
  const prisma = getPrisma();
  if (!prisma) return redirectTo("/account/orders");

  // Owner-gated: only the order's own customer can reorder it.
  const order = await prisma.orderRequest.findUnique({
    where: { id },
    select: { customerId: true, lines: { where: { slug: { not: null } }, select: { slug: true, cases: true } } },
  });
  if (!order || order.customerId !== customer.id) return redirectTo("/account/orders");

  const wanted = new Map<string, number>();
  for (const l of order.lines) if (l.slug) wanted.set(l.slug, Math.max(wanted.get(l.slug) ?? 0, l.cases));

  const slugs = [...wanted.keys()];
  if (slugs.length) {
    const valid = await prisma.product.findMany({
      where: { slug: { in: slugs }, isActive: true, wholesaleEnabled: true },
      select: { slug: true },
    });
    const cart = await readWholesaleCart(customer.id);
    for (const p of valid) cart[p.slug] = Math.max(cart[p.slug] ?? 0, wanted.get(p.slug) ?? 1);
    await writeWholesaleCart(customer.id, cart);
  }

  return redirectTo("/wholesale/cart");
}
