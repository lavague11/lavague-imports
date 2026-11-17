import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { mintInvoiceNumber } from "@/lib/invoice";

// Create a blank draft invoice for a customer, then 303 to its editor.
// Full-page POST (Post/Redirect/Get) — never a Server Action (host-safe).

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const fd = await request.formData();
  const customerId = String(fd.get("customerId") ?? "").trim();
  if (!customerId) return redirectTo("/admin/invoices/new?error=customer");

  try {
    const prisma = requirePrisma();
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) return redirectTo("/admin/invoices/new?error=customer");

    const number = await mintInvoiceNumber(prisma);
    const invoice = await prisma.customerInvoice.create({
      data: { number, customerId, status: "DRAFT" },
      select: { id: true },
    });
    return redirectTo(`/admin/invoices/${invoice.id}/edit`);
  } catch (error) {
    console.error("[invoice] create failed", error);
    return redirectTo("/admin/invoices/new?error=create");
  }
}
