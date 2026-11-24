import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { quoteReadyEmail, sendEmail } from "@/lib/mail";
import { formatPrice } from "@/lib/utils";
import { applyQuote, dollarsToCents, QUOTE_EMAILS_ENABLED } from "@/lib/wholesale-quote";

// Admin quote screen (pricing-models.md §3). Full-page POST → 303 (Hostinger).
// "Save draft" stores prices without sending; "Send quote" sets QUOTED +
// quoteSentAt. The pricing math and status rules live in applyQuote().

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
  const form = await request.formData();
  const action = form.get("action") === "send" ? "send" : "save";

  // One price_<lineId> field per line (dollars). Unknown lines are ignored by
  // applyQuote, which trusts the server's own line set + cases.
  const lines: { id: string; cases: number; quotedUnitPriceCents: number | null }[] = [];
  for (const [key, value] of form.entries()) {
    if (key.startsWith("price_")) {
      lines.push({ id: key.slice("price_".length), cases: 0, quotedUnitPriceCents: dollarsToCents(String(value)) });
    }
  }
  const adjustments = {
    discountCents: dollarsToCents(String(form.get("discount") ?? "")) ?? 0,
    shippingCents: dollarsToCents(String(form.get("shipping") ?? "")) ?? 0,
    taxCents: dollarsToCents(String(form.get("tax") ?? "")) ?? 0,
  };

  try {
    const prisma = requirePrisma();
    const res = await applyQuote(prisma, id, { lines, adjustments, action });
    if (!res.ok) return redirectTo(`/admin/orders/${id}?error=quote`);

    // Tell the customer their quote is ready (gated until the copy is approved).
    if (action === "send" && QUOTE_EMAILS_ENABLED) {
      try {
        const o = await prisma.orderRequest.findUnique({
          where: { id },
          select: { reference: true, quoteTotalCents: true, customer: { select: { businessName: true, name: true, email: true } } },
        });
        if (o?.customer.email) {
          const base = process.env.NEXT_PUBLIC_SITE_URL || "https://lavagueimport.com";
          const mail = quoteReadyEmail({
            reference: o.reference,
            businessName: o.customer.businessName || o.customer.name || o.customer.email,
            totalLabel: formatPrice(o.quoteTotalCents ?? 0),
            url: `${base}/account/orders/${id}`,
          });
          const sent = await sendEmail({ to: o.customer.email, ...mail });
          console.log(
            sent.ok
              ? `[quote-email] quote-ready sent to ${o.customer.email} (${o.reference})`
              : `[quote-email] quote-ready NOT sent to ${o.customer.email} (${o.reference}) — ${sent.reason}`,
          );
        }
      } catch {
        /* email best-effort */
      }
    }
    return redirectTo(`/admin/orders/${id}?${action === "send" ? "sent" : "saved"}=1`);
  } catch (error) {
    console.error("[quote] apply failed", error);
    return redirectTo(`/admin/orders/${id}?error=quote`);
  }
}
