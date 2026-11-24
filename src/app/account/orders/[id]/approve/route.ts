import { NextResponse } from "next/server";

import { getCustomer } from "@/lib/customer-auth";
import { requirePrisma } from "@/lib/db";
import { quoteApprovedEmail, salesInbox, sendEmail } from "@/lib/mail";
import { formatPrice } from "@/lib/utils";
import { approveQuote, QUOTE_EMAILS_ENABLED } from "@/lib/wholesale-quote";

// Customer approves their quote. Full-page POST → 303 (Hostinger). Owner-gated
// in approveQuote: another account can't approve this order.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer();
  if (!customer) return redirectTo(`/login?next=/account/orders/${id}`);
  if (customer.role !== "WHOLESALE") return redirectTo("/account");

  try {
    const prisma = requirePrisma();
    const res = await approveQuote(prisma, id, customer.id);
    if (!res.ok) return redirectTo(`/account/orders/${id}?error=1`);

    if (QUOTE_EMAILS_ENABLED) {
      try {
        const o = await prisma.orderRequest.findUnique({
          where: { id },
          select: { reference: true, quoteTotalCents: true, customer: { select: { businessName: true, name: true, email: true } } },
        });
        if (o) {
          const base = process.env.NEXT_PUBLIC_SITE_URL || "https://lavagueimport.com";
          const mail = quoteApprovedEmail({
            reference: o.reference,
            businessName: o.customer.businessName || o.customer.name || o.customer.email,
            who: customer.name || customer.email,
            totalLabel: formatPrice(o.quoteTotalCents ?? 0),
            adminUrl: `${base}/admin/orders/${id}`,
          });
          await sendEmail({ to: salesInbox(), ...mail });
        }
      } catch {
        /* email best-effort */
      }
    }
    return redirectTo(`/account/orders/${id}?approved=1`);
  } catch {
    return redirectTo(`/account/orders/${id}?error=1`);
  }
}
