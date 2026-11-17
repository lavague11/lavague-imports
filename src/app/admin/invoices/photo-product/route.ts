import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { createCustomProduct, saveUploadedImage } from "@/lib/admin/products";
import { formatUnitSize } from "@/lib/units";

export const runtime = "nodejs";

// Create a product on the fly from an invoice photo/voice: HIDDEN from the storefront
// (isActive=false) and flagged needsReview for later approval on the Products page.
// Returns the product so the client can add it to the invoice line. Admin-only.

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const fd = await request.formData();
  const name = clean(fd.get("name"));
  const categorySlug = clean(fd.get("categorySlug"));
  const priceStr = clean(fd.get("price"));
  if (!name) return NextResponse.json({ error: "name" }, { status: 400 });
  if (!priceStr || !(parseFloat(priceStr) > 0)) return NextResponse.json({ error: "price" }, { status: 400 });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";
  const sku = clean(fd.get("sku")) || `LV-${slug}`.toUpperCase().slice(0, 40);
  const caseNum = parseInt(clean(fd.get("unitsPerCase")), 10);
  const image = fd.get("image");
  let imageUrl: string | null = null;
  if (image instanceof File && image.size > 0) imageUrl = await saveUploadedImage(image);

  try {
    const created = await createCustomProduct({
      name,
      slug,
      sku,
      categorySlug: categorySlug || "pantry",
      description: `${name}.`,
      brand: clean(fd.get("brand")) || null,
      origin: clean(fd.get("origin")) || null,
      barcode: clean(fd.get("barcode")).replace(/[^0-9]/g, "") || null,
      imageUrl,
      priceCents: Math.round(parseFloat(priceStr) * 100),
      unitSize: formatUnitSize(clean(fd.get("unitSizeAmount")), clean(fd.get("unitSizeUnit"))) || clean(fd.get("size")) || null,
      unitsPerCase: Number.isFinite(caseNum) && caseNum > 0 ? caseNum : null,
      isActive: false,
      needsReview: true,
    });
    return NextResponse.json({
      ok: true,
      name,
      sku: created.sku,
      priceCents: Math.round(parseFloat(priceStr) * 100),
      imageUrl: created.imageUrl,
      slug: created.slug,
    });
  } catch (error) {
    console.error("[invoice] photo-product create failed", error);
    return NextResponse.json({ error: "create" }, { status: 500 });
  }
}
