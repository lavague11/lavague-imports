import { NextResponse } from "next/server";

import { getCustomer } from "@/lib/customer-auth";
import { readWholesaleCart, writeWholesaleCart } from "@/lib/wholesale-cart";

function safeReturn(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/wholesale") ? v : "/wholesale/order";
}

export async function POST(request: Request) {
  const customer = await getCustomer();
  if (!customer || customer.role !== "WHOLESALE") {
    return new NextResponse(null, { status: 303, headers: { Location: "/login?next=/wholesale/order" } });
  }
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "").trim();
  const cases = Math.floor(Number(form.get("cases") ?? 0));
  const back = safeReturn(form.get("from"));

  if (slug) {
    const cart = await readWholesaleCart(customer.id);
    if (Number.isFinite(cases) && cases > 0) cart[slug] = Math.min(cases, 9999);
    else delete cart[slug];
    await writeWholesaleCart(customer.id, cart);
  }
  return new NextResponse(null, { status: 303, headers: { Location: back } });
}
