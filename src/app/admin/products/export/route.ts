import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { buildOrderBy, buildProductWhere, parseProductParams } from "@/lib/admin/product-query";
import { sourceLabel } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// Hard cap so an export can never run away as the catalog grows.
const MAX_ROWS = 20000;

// CSV export of the products list. "Current view" forwards the same query
// params as the page, so the export respects search + all filters + sort.
// "Selected" (slugs=...) exports only the ticked rows.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/admin/login", request.url));
  const prisma = getPrisma();
  if (!prisma) return new NextResponse("Database not connected", { status: 503 });

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const slugs = (url.searchParams.get("slugs") || "").split(",").map((s) => s.trim()).filter(Boolean);

  let where: Prisma.ProductWhereInput;
  let orderBy: Prisma.ProductOrderByWithRelationInput[];
  if (slugs.length) {
    where = { slug: { in: slugs } };
    orderBy = [{ name: "asc" }];
  } else {
    const parsed = parseProductParams(params);
    where = await buildProductWhere(prisma, parsed);
    orderBy = buildOrderBy(parsed.sortKey, parsed.dir);
  }

  const rows = await prisma.product.findMany({
    where,
    include: { category: true, variants: { orderBy: { position: "asc" }, take: 1 } },
    orderBy,
    take: MAX_ROWS,
  });

  const header = ["Name", "SKU", "Source", "Category", "Origin", "Retail Price", "Status", "Wholesale", "Slug"];
  const esc = (v: unknown) => `"${(v == null ? "" : String(v)).replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(",")];
  for (const p of rows) {
    const cents = p.variants[0]?.retailPriceCents ?? p.minPriceCents ?? null;
    lines.push(
      [
        p.name,
        p.variants[0]?.sku ?? "",
        sourceLabel(p.source),
        p.category.name,
        p.origin ?? "",
        cents == null ? "Price on request" : (cents / 100).toFixed(2),
        p.isActive ? "Visible" : "Hidden",
        p.wholesaleEnabled ? "Yes" : "No",
        p.slug,
      ].map(esc).join(","),
    );
  }
  // BOM so Excel reads the UTF-8 correctly; CRLF line endings for Excel.
  const csv = "﻿" + lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
