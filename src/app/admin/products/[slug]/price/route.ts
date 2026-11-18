import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { saveDraftPrice } from "@/lib/admin/products";
import { getPrisma } from "@/lib/db";

// Inline price edit from the desktop list (PRODUCTS_UI §10). Saves the new price
// as a draft (§9) — not published until the product is published — and returns
// JSON so the client can show a 5-second Undo. No redirect — safe on the host.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { slug } = await params;
  if (!getPrisma()) return NextResponse.json({ ok: false }, { status: 500 });

  let body: { sku?: unknown; price?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const sku = typeof body.sku === "string" ? body.sku : "";
  const priceStr = (typeof body.price === "string" ? body.price : "").trim();
  if (!sku) return NextResponse.json({ ok: false }, { status: 400 });

  let cents: number | null = null;
  if (priceStr !== "") {
    const n = Math.round(parseFloat(priceStr) * 100);
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ ok: false }, { status: 400 });
    cents = n;
  }

  try {
    await saveDraftPrice(slug, sku, cents);
  } catch (error) {
    console.error("[admin] inline price save failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
