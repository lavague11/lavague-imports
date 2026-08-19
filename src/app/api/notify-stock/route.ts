import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Captures a customer's request to be emailed when an out-of-stock product is
// back. Stored in StockNotification; the admin acts on the pending list.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const productSlug = String(body?.productSlug ?? "").trim();
  const productName = String(body?.productName ?? "").trim();
  const variantSku = body?.variantSku ? String(body.variantSku).trim() : null;

  if (!EMAIL.test(email) || !productSlug) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });

  try {
    // Skip duplicate pending requests for the same email + product.
    const existing = await prisma.stockNotification.findFirst({
      where: { email, productSlug, notified: false },
      select: { id: true },
    });
    if (!existing) {
      await prisma.stockNotification.create({
        data: { email, productSlug, productName: productName || productSlug, variantSku },
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "error" }, { status: 500 });
  }
}
