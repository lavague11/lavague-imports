import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { collectImagesFromForm, createCustomProduct } from "@/lib/admin/products";
import { formatUnitSize } from "@/lib/units";

// Create ONE product from the bulk-add review (PRODUCTS_UI §4). Saved hidden
// (isActive:false) + Needs review. Returns JSON so the client can show
// per-item progress and let one failure not block the rest.
function s(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  }

  const fd = await request.formData();
  const name = s(fd, "name");
  const categorySlug = s(fd, "categorySlug");
  if (!name || !categorySlug) return NextResponse.json({ ok: false, error: "required" }, { status: 400 });

  const slug =
    (s(fd, "slug") || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "product";
  const images = await collectImagesFromForm(fd);
  const priceStr = s(fd, "price");
  const caseNum = parseInt(s(fd, "unitsPerCase"), 10);

  try {
    const created = await createCustomProduct({
      name,
      slug,
      sku: s(fd, "sku") || `LV-${slug}`.toUpperCase().slice(0, 40),
      categorySlug,
      description: s(fd, "description") || `${name}.`,
      origin: s(fd, "origin") || null,
      brand: s(fd, "brand") || null,
      barcode: s(fd, "barcode").replace(/[^0-9]/g, "") || null,
      images,
      priceCents: priceStr ? Math.round(parseFloat(priceStr) * 100) : null,
      unitSize: formatUnitSize(s(fd, "unitSizeAmount"), s(fd, "unitSizeUnit")),
      unitsPerCase: Number.isFinite(caseNum) && caseNum > 0 ? caseNum : null,
      isFragile: fd.get("fragile") === "on" || fd.get("fragile") === "true",
      isActive: false,
      needsReview: true,
    });
    return NextResponse.json({ ok: true, slug: created.slug });
  } catch (error) {
    console.error("[admin] bulk create failed", error);
    return NextResponse.json({ ok: false, error: "create" }, { status: 500 });
  }
}
