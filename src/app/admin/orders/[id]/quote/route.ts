import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { applyQuote, dollarsToCents } from "@/lib/wholesale-quote";

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
    return redirectTo(`/admin/orders/${id}?${action === "send" ? "sent" : "saved"}=1`);
  } catch (error) {
    console.error("[quote] apply failed", error);
    return redirectTo(`/admin/orders/${id}?error=quote`);
  }
}
