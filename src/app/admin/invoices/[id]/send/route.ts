import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { newPublicToken } from "@/lib/invoice";
import { invoiceEmail, sendEmail } from "@/lib/mail";
import { formatPrice } from "@/lib/utils";

// Mark an invoice sent: mint a public token (if absent), stamp sentAt, flip a
// DRAFT to SENT, and email the customer the link. Email is best-effort — the
// invoice is still marked sent (and the link copyable) if SMTP isn't configured.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const { id } = await params;

  try {
    const prisma = requirePrisma();
    const invoice = await prisma.customerInvoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) return redirectTo("/admin/invoices");
    if (invoice.status === "VOID") return redirectTo(`/admin/invoices/${id}?error=void`);
    if (!invoice.customer) return redirectTo(`/admin/invoices/${id}?error=nocustomer`);
    const customer = invoice.customer;

    const publicToken = invoice.publicToken ?? newPublicToken();
    const nextStatus = invoice.status === "DRAFT" ? "SENT" : invoice.status;

    await prisma.customerInvoice.update({
      where: { id },
      data: { publicToken, sentAt: invoice.sentAt ?? new Date(), status: nextStatus },
    });

    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://lavagueimport.com";
    const url = `${base}/invoice/${publicToken}`;
    const balance = invoice.totalCents - invoice.paidCents;
    const mail = invoiceEmail({
      number: invoice.number,
      businessName: customer.businessName || customer.name || "there",
      totalLabel: formatPrice(invoice.totalCents),
      balanceLabel: formatPrice(Math.max(0, balance)),
      dueLabel: invoice.dueDate ? fmtDate(invoice.dueDate) : null,
      url,
      note: invoice.notes,
    });
    const result = await sendEmail({
      to: customer.email,
      replyTo: undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (!result.ok) {
      console.warn(`[invoice] ${invoice.number} email not sent (${result.reason}) to ${customer.email}`);
      return redirectTo(`/admin/invoices/${id}?sent=link`);
    }
    return redirectTo(`/admin/invoices/${id}?sent=1`);
  } catch (error) {
    console.error("[invoice] send failed", error);
    return redirectTo(`/admin/invoices/${id}?error=send`);
  }
}
