import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { dollarsToCents, PAYMENT_METHODS, settledStatus, type PaymentMethod } from "@/lib/invoice";

// Record a manual payment against an invoice, recompute the paid total and
// status atomically, then 303 back to the detail page. (Online card payment is
// a separate, credentialed gateway — see docs/blocked.md.)

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const { id } = await params;
  const fd = await request.formData();
  const amountCents = dollarsToCents(String(fd.get("amount") ?? ""));
  const methodRaw = String(fd.get("method") ?? "OTHER").toUpperCase();
  const method = (PAYMENT_METHODS as readonly string[]).includes(methodRaw)
    ? (methodRaw as PaymentMethod)
    : "OTHER";
  const reference = String(fd.get("reference") ?? "").trim() || null;
  const note = String(fd.get("note") ?? "").trim() || null;
  const receivedRaw = String(fd.get("receivedAt") ?? "").trim();
  const receivedAt = receivedRaw ? new Date(receivedRaw + "T12:00:00") : new Date();

  if (amountCents <= 0) return redirectTo(`/admin/invoices/${id}?error=amount`);

  try {
    const prisma = requirePrisma();
    const invoice = await prisma.customerInvoice.findUnique({
      where: { id },
      select: { id: true, status: true, totalCents: true },
    });
    if (!invoice) return redirectTo("/admin/invoices");
    if (invoice.status === "VOID") return redirectTo(`/admin/invoices/${id}?error=void`);

    const agg = await prisma.customerPayment.aggregate({
      where: { invoiceId: id },
      _sum: { amountCents: true },
    });
    const newPaid = (agg._sum.amountCents ?? 0) + amountCents;
    const prev = invoice.status === "DRAFT" ? "SENT" : invoice.status;
    const status = settledStatus(invoice.totalCents, newPaid, prev);

    await prisma.$transaction([
      prisma.customerPayment.create({
        data: {
          id: randomUUID(),
          invoiceId: id,
          amountCents,
          method,
          reference,
          note,
          receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
          recordedBy: admin.email,
        },
      }),
      prisma.customerInvoice.update({ where: { id }, data: { paidCents: newPaid, status } }),
    ]);

    return redirectTo(`/admin/invoices/${id}?paid=1`);
  } catch (error) {
    console.error("[invoice] payment failed", error);
    return redirectTo(`/admin/invoices/${id}?error=payment`);
  }
}
