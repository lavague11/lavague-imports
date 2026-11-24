import { NextResponse } from "next/server";

import { getCustomer } from "@/lib/customer-auth";
import { requirePrisma } from "@/lib/db";
import { salesInbox, sendEmail } from "@/lib/mail";
import { makeReference } from "@/lib/utils";
import { readWholesaleCart, writeWholesaleCart } from "@/lib/wholesale-cart";

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request) {
  const customer = await getCustomer();
  if (!customer || customer.role !== "WHOLESALE") {
    return redirectTo("/login?next=/wholesale/order");
  }

  const cart = await readWholesaleCart(customer.id);
  const slugs = Object.keys(cart);
  if (slugs.length === 0) return redirectTo("/wholesale/order");

  const form = await request.formData();
  const note = String(form.get("note") ?? "").trim() || null;
  const reference = makeReference("WR");

  try {
    const prisma = requirePrisma();
    const products = await prisma.product.findMany({
      where: { slug: { in: slugs } },
      include: { variants: { orderBy: { position: "asc" }, take: 1 } },
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    const lines = slugs
      .map((slug) => {
        const p = bySlug.get(slug);
        const cases = cart[slug];
        if (!p || !cases) return null;
        const variant = p.variants[0];
        return {
          productId: p.id,
          slug: p.slug,
          productName: p.name,
          unitSize: variant?.name ?? null,
          casePack: variant?.unitsPerCase ?? p.casePack ?? null,
          cases,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    if (lines.length === 0) return redirectTo("/wholesale/order");

    await prisma.orderRequest.create({
      data: {
        reference,
        customerId: customer.id,
        note,
        lines: { create: lines },
      },
    });

    await writeWholesaleCart(customer.id, {});

    // Notify sales (best-effort; no prices — this is a request to quote).
    const list = lines.map((l) => `  ${l.cases} case(s) × ${l.productName}${l.unitSize ? ` (${l.unitSize})` : ""}`).join("\n");
    const who = customer.name || customer.email;
    await sendEmail({
      to: salesInbox(),
      replyTo: customer.email,
      subject: `New wholesale order request ${reference} — ${who}`,
      text: `New wholesale order request ${reference}\n\nFrom: ${who} <${customer.email}>\n${note ? `Note: ${note}\n` : ""}\nItems (${lines.length}):\n${list}\n\nQuote and invoice it in the admin.`,
      html: `<p><strong>New wholesale order request ${reference}</strong></p><p>From: ${who} &lt;${customer.email}&gt;</p>${note ? `<p>Note: ${note}</p>` : ""}<ul>${lines.map((l) => `<li>${l.cases} case(s) × ${l.productName}${l.unitSize ? ` (${l.unitSize})` : ""}</li>`).join("")}</ul><p>Quote and invoice it in the admin.</p>`,
    });
  } catch (error) {
    console.error("[wholesale-order] submit failed", error);
    return redirectTo("/wholesale/cart?error=1");
  }

  return redirectTo(`/wholesale/order/submitted?ref=${encodeURIComponent(reference)}`);
}
