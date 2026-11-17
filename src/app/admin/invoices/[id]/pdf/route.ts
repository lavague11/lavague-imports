import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { composeAddress } from "@/lib/address";
import { requirePrisma } from "@/lib/db";
import { invoiceDisplay } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

// Serves the invoice as a generated PDF (pdf-lib — no external service).

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse(null, { status: 303, headers: { Location: "/admin/login" } });
  }

  const { id } = await params;
  const prisma = requirePrisma();
  const invoice = await prisma.customerInvoice.findUnique({
    where: { id },
    include: { customer: true, lines: true },
  });
  if (!invoice) return new NextResponse("Not found", { status: 404 });

  const c = invoice.customer;
  const bytes = await buildInvoicePdf({
    number: invoice.number,
    statusLabel: invoiceDisplay(invoice).label,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    terms: invoice.terms,
    salesRep: invoice.salesRep,
    billToName: c ? c.businessName || c.name || c.email : "No customer",
    billToContact: c && c.businessName && c.name ? c.name : null,
    billToEmail: c?.email ?? null,
    billToAddress: c ? composeAddress(c) : null,
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
