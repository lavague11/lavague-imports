import { NextResponse } from "next/server";

import { getCustomer } from "@/lib/customer-auth";
import { requirePrisma } from "@/lib/db";
import { quoteChangesEmail, salesInbox, sendEmail } from "@/lib/mail";
import { QUOTE_EMAILS_ENABLED, requestQuoteChanges } from "@/lib/wholesale-quote";

// Customer asks for changes to their quote, optionally editing case quantities.
// Full-page POST → 303 (Hostinger). Owner-gated in requestQuoteChanges.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer();
  if (!customer) return redirectTo(`/login?next=/account/orders/${id}`);
  if (customer.role !== "WHOLESALE") return redirectTo("/account");

  const form = await request.formData();
  const note = String(form.get("note") ?? "").trim();
  const caseEdits: Record<string, number> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("cases_")) {
      const n = Math.floor(Number(value));
      if (Number.isFinite(n)) caseEdits[key.slice("cases_".length)] = n;
    }
  }

  try {
    const prisma = requirePrisma();
    const res = await requestQuoteChanges(prisma, id, customer.id, { note, caseEdits });
    if (!res.ok) return redirectTo(`/account/orders/${id}?error=1`);

    if (QUOTE_EMAILS_ENABLED) {
      try {
        const o = await prisma.orderRequest.findUnique({
          where: { id },
          select: { reference: true, customer: { select: { businessName: true, name: true, email: true } } },
        });
        if (o) {
          const base = process.env.NEXT_PUBLIC_SITE_URL || "https://lavagueimport.com";
          const mail = quoteChangesEmail({
            reference: o.reference,
            businessName: o.customer.businessName || o.customer.name || o.customer.email,
            who: customer.name || customer.email,
            note: note || "(no note)",
            adminUrl: `${base}/admin/orders/${id}`,
          });
          await sendEmail({ to: salesInbox(), ...mail });
        }
      } catch {
        /* email best-effort */
      }
    }
    return redirectTo(`/account/orders/${id}?changes=1`);
  } catch {
    return redirectTo(`/account/orders/${id}?error=1`);
  }
}
