import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { saveProductEdits } from "@/lib/admin/products";
import { getPrisma } from "@/lib/db";

// Inline price edit from the desktop list (PRODUCTS_UI §10). Updates one
// variant's price (as a durable override draft) and returns JSON so the client
// can show a 5-second Undo. No redirect — safe on the live host.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  let userId: string | undefined;
  try {
    const user = await requireUser();
    userId = user.id;
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
    await saveProductEdits(slug, { variantPrices: { [sku]: cents } }, userId);
  } catch (error) {
    console.error("[admin] inline price save failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
