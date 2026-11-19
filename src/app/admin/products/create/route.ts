import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { collectImagesFromForm, createCustomProduct, parseNewSizeRows } from "@/lib/admin/products";
import { findSimilarProducts } from "@/lib/admin/duplicate-guard";
import { formatUnitSize } from "@/lib/units";

// Create a product via a full-page POST (Post/Redirect/Get), NOT a Server
// Action — server-action redirects re-render through the client error boundary
// on this host. On success we 303 to the new product's edit page; on failure we
// 303 back to the form with an ?error code. Locations are relative so they
// resolve against the public URL, not the proxy's internal origin.

function redirectTo(pathAndQuery: string) {
  return new NextResponse(null, { status: 303, headers: { Location: pathAndQuery } });
}

function s(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}
function optS(fd: FormData, k: string): string | null {
  return s(fd, k) || null;
}

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return redirectTo("/admin/login");
  }

  const fd = await request.formData();
  const name = s(fd, "name");
  const categorySlug = s(fd, "categorySlug");
  if (!name || !categorySlug) {
    return redirectTo("/admin/products/new?error=required");
  }

  const slug =
    (s(fd, "slug") || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "product";

  // Duplicate guard (§5): an exact barcode match blocks creation and opens the
  // existing product. (The form also warns on similar names/brand before submit.)
  const barcode = s(fd, "barcode").replace(/[^0-9]/g, "") || null;
  if (barcode && fd.get("force") !== "1") {
    const prisma = getPrisma();
    if (prisma) {
      const sim = await findSimilarProducts(prisma, { barcode, name, brand: optS(fd, "brand"), size: null });
      if (sim.exactBarcode) return redirectTo(`/admin/products/${sim.exactBarcode.slug}?dupe=barcode`);
    }
  }

  const images = await collectImagesFromForm(fd);

  // Sizes come from the "+ Add size" table (first row is the primary variant).
  // Fall back to legacy single fields when no table rows were submitted.
  const sizeRows = parseNewSizeRows(fd);
  const primary = sizeRows[0];
  const extras = sizeRows.slice(1);
  const legacyPrice = s(fd, "price");
  const legacyCase = parseInt(s(fd, "unitsPerCase"), 10);

  let created: { slug: string };
  try {
    created = await createCustomProduct({
      name,
      slug,
      sku: s(fd, "sku") || `LV-${slug}`.toUpperCase().slice(0, 40),
      categorySlug,
      description: s(fd, "description") || `${name}.`,
      origin: optS(fd, "origin"),
      brand: optS(fd, "brand"),
      barcode: s(fd, "barcode").replace(/[^0-9]/g, "") || null,
      ribbon: optS(fd, "ribbon"),
      images,
      priceCents: primary ? primary.priceCents ?? null : legacyPrice ? Math.round(parseFloat(legacyPrice) * 100) : null,
      unitSize: primary ? primary.size ?? null : formatUnitSize(s(fd, "unitSizeAmount"), s(fd, "unitSizeUnit")),
      unitsPerCase: primary ? primary.unitsPerCase ?? null : Number.isFinite(legacyCase) && legacyCase > 0 ? legacyCase : null,
      isFragile: fd.get("fragile") === "on",
      extraVariants: extras,
    });
  } catch (error) {
    console.error("[admin] createProduct failed", error);
    return redirectTo("/admin/products/new?error=create");
  }

  return redirectTo(`/admin/products/${created.slug}`);
}
