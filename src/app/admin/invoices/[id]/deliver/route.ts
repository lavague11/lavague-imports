import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Record (or clear) delivery confirmation for an invoice.

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

  try {
    const prisma = requirePrisma();
    const invoice = await prisma.customerInvoice.findUnique({ where: { id }, select: { id: true } });
    if (!invoice) return redirectTo("/admin/invoices");

    if (fd.get("clear")) {
      await prisma.customerInvoice.update({
        where: { id },
        data: { deliveredAt: null, deliveredBy: null, deliveryNote: null },
      });
      return redirectTo(`/admin/invoices/${id}?delivered=cleared`);
    }

    const dateRaw = String(fd.get("deliveredAt") ?? "").trim();
    const deliveredAt = dateRaw ? new Date(dateRaw + "T12:00:00") : new Date();
    await prisma.customerInvoice.update({
      where: { id },
      data: {
        deliveredAt: Number.isNaN(deliveredAt.getTime()) ? new Date() : deliveredAt,
        deliveredBy: String(fd.get("deliveredBy") ?? "").trim() || null,
        deliveryNote: String(fd.get("deliveryNote") ?? "").trim() || null,
      },
    });
    return redirectTo(`/admin/invoices/${id}?delivered=1`);
  } catch (error) {
    console.error("[invoice] deliver failed", error);
    return redirectTo(`/admin/invoices/${id}?error=deliver`);
  }
}
