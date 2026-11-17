import { NextResponse } from "next/server";

import { composeAddress } from "@/lib/address";
import { requirePrisma } from "@/lib/db";
import { invoiceDisplay } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

// Public PDF of an invoice, reachable only with its secret token.

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const prisma = requirePrisma();
  const invoice = await prisma.customerInvoice.findUnique({
    where: { publicToken: token },
    include: { customer: true, lines: true },
  });
  if (!invoice || !invoice.customer) return new NextResponse("Not found", { status: 404 });

  const c = invoice.customer;
  const bytes = await buildInvoicePdf({
    number: invoice.number,
    statusLabel: invoiceDisplay(invoice).label,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    terms: invoice.terms,
    salesRep: invoice.salesRep,
    billToName: c.businessName || c.name || c.email,
    billToContact: c.businessName && c.name ? c.name : null,
    billToEmail: c.email,
    billToAddress: composeAddress(c),
    lines: invoice.lines,
    subtotalCents: invoice.subtotalCents,
    discountCents: invoice.discountCents,
    shippingCents: invoice.shippingCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    notes: invoice.notes,
    signerName: invoice.signerName,
    signedAt: invoice.signedAt,
    signatureData: invoice.signatureData,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
