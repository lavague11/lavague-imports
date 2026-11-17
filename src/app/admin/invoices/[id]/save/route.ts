import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { computeTotals, dollarsToCents, parseLines, settledStatus } from "@/lib/invoice";

// Save the invoice editor: replaces line items and recomputes totals in one
// transaction. 303 to the invoice detail on success.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function dateOrNull(v: string): Date | null {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t + "T12:00:00"); // noon, avoid TZ day-shift
  return Number.isNaN(d.getTime()) ? null : d;
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
    const current = await prisma.customerInvoice.findUnique({
      where: { id },
      select: { id: true, status: true, paidCents: true, number: true },
    });
    if (!current) return redirectTo("/admin/invoices");

    // Invoice number is editable; only change it if non-empty and not taken.
    const nextNumber = String(fd.get("number") ?? "").trim();
    let number: string | undefined;
    if (nextNumber && nextNumber !== current.number) {
      const taken = await prisma.customerInvoice.findFirst({
        where: { number: nextNumber, NOT: { id } },
        select: { id: true },
      });
      if (taken) return redirectTo(`/admin/invoices/${id}/edit?error=number`);
      number = nextNumber;
    }

    const lines = parseLines(fd);
    const discountCents = dollarsToCents(String(fd.get("discount") ?? ""));
    const shippingCents = dollarsToCents(String(fd.get("shipping") ?? ""));
    const taxCents = dollarsToCents(String(fd.get("tax") ?? ""));
    const { subtotalCents, totalCents } = computeTotals(lines, discountCents, shippingCents, taxCents);

    const issueDate = dateOrNull(String(fd.get("issueDate") ?? ""));
    const dueDate = dateOrNull(String(fd.get("dueDate") ?? ""));
    const terms = String(fd.get("terms") ?? "").trim() || null;
    const salesRep = String(fd.get("salesRep") ?? "").trim() || null;
    const notes = String(fd.get("notes") ?? "").trim() || null;

    const status = settledStatus(totalCents, current.paidCents, current.status);

    await prisma.$transaction([
      prisma.customerInvoiceLine.deleteMany({ where: { invoiceId: id } }),
      prisma.customerInvoice.update({
        where: { id },
        data: {
          ...(number ? { number } : {}),
          ...(issueDate ? { issueDate } : {}),
          dueDate,
          terms,
          salesRep,
          notes,
          discountCents,
          shippingCents,
          taxCents,
          subtotalCents,
          totalCents,
          status,
          lines: {
            create: lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              lineTotalCents: l.lineTotalCents,
              isCredit: l.isCredit,
              creditReason: l.creditReason,
            })),
          },
        },
      }),
    ]);

    return redirectTo(`/admin/invoices/${id}`);
  } catch (error) {
    console.error("[invoice] save failed", error);
    return redirectTo(`/admin/invoices/${id}/edit?error=save`);
  }
}
