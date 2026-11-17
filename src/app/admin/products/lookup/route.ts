import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";

// Barcode lookup for the Add Product flow. Admin-gated.
//  1. Check our own catalog for the barcode first.
//  2. If not found, look it up in Open Food Facts (public, no key).
// Returns a plain JSON summary the client merges into the "Is this the item?"
// rows. Never invents data: fields absent upstream come back as "".

const clean = (s: string) => s.replace(/[^0-9]/g, "");
const first = (v: string | undefined | null) => (v ? v.split(",")[0].trim() : "");

export async function GET(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const url = new URL(request.url);
  const barcode = clean(url.searchParams.get("barcode") ?? "");
  if (barcode.length < 6) return NextResponse.json({ error: "bad-barcode" }, { status: 400 });

  // 1. Our own catalog.
  const prisma = getPrisma();
  if (prisma) {
    const hit = await prisma.product.findFirst({
      where: { barcode },
      select: { slug: true, name: true, brand: true, imageUrl: true },
    });
    if (hit) {
      return NextResponse.json({
        barcode,
        catalog: { found: true, slug: hit.slug, name: hit.name, brand: hit.brand ?? "", imageUrl: hit.imageUrl ?? null },
      });
    }
  }

  // 2. Open Food Facts (public API, no key). Generic client name, no personal data.
  try {
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,quantity,countries`;
    const res = await fetch(offUrl, {
      headers: { "User-Agent": "LaVagueImports-Admin/1.0 (catalog tool)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        status?: number;
        product?: { product_name?: string; brands?: string; quantity?: string; countries?: string };
      };
      if (data.status === 1 && data.product) {
        const p = data.product;
        return NextResponse.json({
          barcode,
          catalog: { found: false },
          off: {
            found: true,
            name: (p.product_name ?? "").trim(),
            brand: first(p.brands),
            size: (p.quantity ?? "").trim(),
            origin: first(p.countries),
          },
        });
      }
    }
  } catch (error) {
    console.error("[products] OFF lookup failed", error);
  }

  return NextResponse.json({ barcode, catalog: { found: false }, off: { found: false } });
}
