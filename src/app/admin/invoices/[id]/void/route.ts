import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Void an invoice (reversible book-keeping state — it is never hard-deleted).

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const { id } = await params;
  const fd = await request.formData();
  const unvoid = Boolean(fd.get("unvoid"));

  try {
    const prisma = requirePrisma();
    const invoice = await prisma.customerInvoice.findUnique({
      where: { id },
      select: { id: true, totalCents: true, paidCents: true },
    });
    if (!invoice) return redirectTo("/admin/invoices");

    if (unvoid) {
      // Restore to the status its totals imply.
      const paid = invoice.paidCents;
      const status =
        invoice.totalCents > 0 && paid >= invoice.totalCents ? "PAID" : paid > 0 ? "PARTIAL" : "SENT";
      await prisma.customerInvoice.update({ where: { id }, data: { status } });
      return redirectTo(`/admin/invoices/${id}?unvoided=1`);
    }

    await prisma.customerInvoice.update({ where: { id }, data: { status: "VOID" } });
    return redirectTo(`/admin/invoices/${id}?voided=1`);
  } catch (error) {
    console.error("[invoice] void failed", error);
    return redirectTo(`/admin/invoices/${id}?error=void`);
  }
}
