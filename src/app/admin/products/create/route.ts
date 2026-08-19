import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { collectImagesFromForm, createCustomProduct } from "@/lib/admin/products";
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

  const images = await collectImagesFromForm(fd);
  const priceStr = s(fd, "price");
  const caseStr = s(fd, "unitsPerCase");
  const caseNum = parseInt(caseStr, 10);

  try {
    await createCustomProduct({
      name,
      slug,
      sku: s(fd, "sku") || `LV-${slug}`.toUpperCase().slice(0, 40),
      categorySlug,
      description: s(fd, "description") || `${name}.`,
      origin: optS(fd, "origin"),
      ribbon: optS(fd, "ribbon"),
      images,
      priceCents: priceStr ? Math.round(parseFloat(priceStr) * 100) : null,
      unitSize: formatUnitSize(s(fd, "unitSizeAmount"), s(fd, "unitSizeUnit")),
      unitsPerCase: Number.isFinite(caseNum) && caseNum > 0 ? caseNum : null,
    });
  } catch (error) {
    console.error("[admin] createProduct failed", error);
    return redirectTo("/admin/products/new?error=create");
  }

  return redirectTo(`/admin/products/${slug}`);
}
