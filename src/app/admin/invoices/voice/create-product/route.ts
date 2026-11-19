import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { createCustomProduct } from "@/lib/admin/products";
import { addProductTag, guessTagsFor } from "@/lib/admin/product-tags";
import { findCatalogDuplicates, type CatalogHit } from "@/lib/admin/voice-catalog";

export const runtime = "nodejs";

// Create a product from the voice card — ONLY when the admin taps "Create".
// Runs a duplicate check first (brand + name + size); if a close match exists
// and the caller didn't force, returns it so the card can offer "use it instead".
// A created product is HIDDEN (isActive=false) and flagged needsReview.

const clean = (v: FormDataEntryValue | null | undefined) => String(v ?? "").trim();

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "db" }, { status: 500 });

  const fd = await request.formData().catch(() => null);
  const name = clean(fd?.get("name"));
  const brand = clean(fd?.get("brand"));
  const size = clean(fd?.get("size"));
  const heard = clean(fd?.get("heard"));
  const force = clean(fd?.get("force")) === "1";
  if (!name) return NextResponse.json({ error: "name" }, { status: 400 });

  // Duplicate check first — unless the admin already chose "create anyway".
  if (!force) {
    const dupes = await findCatalogDuplicates(prisma, name, brand, size);
    if (dupes.length) return NextResponse.json({ duplicate: dupes[0], alternatives: dupes.slice(1) });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";
  const sku = `LV-${slug}`.toUpperCase().slice(0, 40);

  try {
    const created = await createCustomProduct({
      name,
      slug,
      sku,
      categorySlug: "pantry", // generic catch-all; admin recategorizes on review
      description: `${name}.`,
      brand: brand || null,
      unitSize: size || null,
      priceCents: null, // price comes from the spoken order / later review
      isActive: false,
      needsReview: true,
    });

    // Attach guessed tags as a Draft (editable chips on review). The spoken name
    // becomes a SPOKEN tag so it's recognized next time.
    const guesses = await guessTagsFor(heard || name, { brand, size });
    for (const g of guesses) {
      await addProductTag(created.slug, g.kind, g.value, { source: "voice" }).catch(() => {});
    }

    const hit: CatalogHit = {
      name,
      brand: brand || null,
      sku: created.sku,
      packSize: size || "",
      priceCents: null,
      imageUrl: created.imageUrl,
    };
    return NextResponse.json({ created: hit });
  } catch (error) {
    console.error("[voice] create-product failed", error);
    return NextResponse.json({ error: "create" }, { status: 500 });
  }
}
