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
  // customerId is optional: a new invoice opens as a blank draft and gets a
  // customer assigned later from the editor ("Add customer").
  const customerId = String(fd.get("customerId") ?? "").trim();

  try {
    const prisma = requirePrisma();

    let linkedCustomerId: string | undefined;
    if (customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (customer) linkedCustomerId = customer.id;
    }

    const number = await mintInvoiceNumber(prisma);
    const invoice = await prisma.customerInvoice.create({
      data: { number, customerId: linkedCustomerId ?? null, status: "DRAFT" },
      select: { id: true },
    });
    return redirectTo(`/admin/invoices/${invoice.id}`);
  } catch (error) {
    console.error("[invoice] create failed", error);
    return redirectTo("/admin/invoices?error=create");
  }
}
