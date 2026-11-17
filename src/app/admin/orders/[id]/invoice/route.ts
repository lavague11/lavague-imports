import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { mintInvoiceNumber } from "@/lib/invoice";

// Convert a wholesale order request into a DRAFT invoice: seed one line per
// requested item (quantity = cases, price blank to be quoted), link it back to
// the request, mark the request QUOTED, then 303 to the invoice editor.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const { id } = await params;

  try {
    const prisma = requirePrisma();
    const order = await prisma.orderRequest.findUnique({
      where: { id },
      include: { lines: { orderBy: { productName: "asc" } } },
    });
    if (!order) return redirectTo("/admin/orders");

    const number = await mintInvoiceNumber(prisma);
    const invoice = await prisma.customerInvoice.create({
      data: {
        number,
        customerId: order.customerId,
        status: "DRAFT",
        orderRequestId: order.id,
        notes: order.note ? `From request ${order.reference}: ${order.note}` : `From request ${order.reference}`,
        lines: {
          create: order.lines.map((l) => ({
            description: [l.productName, l.unitSize ? `(${l.unitSize})` : "", l.casePack ? `— ${l.casePack}/case` : ""]
              .filter(Boolean)
              .join(" "),
            quantity: l.cases,
            unitPriceCents: 0,
            lineTotalCents: 0,
          })),
        },
      },
      select: { id: true },
    });

    await prisma.orderRequest.update({ where: { id }, data: { status: "QUOTED" } });

    return redirectTo(`/admin/invoices/${invoice.id}`);
  } catch (error) {
    console.error("[invoice] convert order failed", error);
    return redirectTo(`/admin/orders/${id}?error=invoice`);
  }
}
