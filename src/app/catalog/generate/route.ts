import { readFile } from "node:fs/promises";
import path from "node:path";

import { Jimp } from "jimp";
import { NextResponse } from "next/server";

import { buildCatalogPdf, type PdfCategory, type PdfProduct } from "@/lib/catalog-pdf";
import { getCategories, getCountryFilters } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";
import { site } from "@/lib/site";

const MAX_PRODUCTS = 500;

function detectType(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null; // webp/gif/other — pdf-lib can't embed these
}

/** Load image bytes for a product image url: DB media, local public file, or remote. */
async function loadImage(
  url: string | null,
  prisma: NonNullable<ReturnType<typeof getPrisma>>,
): Promise<{ bytes: Uint8Array; type: "png" | "jpg" } | null> {
  if (!url) return null;
  try {
    let bytes: Uint8Array | null = null;
    if (url.startsWith("/media/")) {
      const id = url.slice("/media/".length);
      const asset = await prisma.mediaAsset.findUnique({ where: { id }, select: { data: true } });
      if (asset) bytes = new Uint8Array(asset.data);
    } else if (url.startsWith("/")) {
      const buf = await readFile(path.join(process.cwd(), "public", url.replace(/^\//, "")));
      bytes = new Uint8Array(buf);
    } else if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
    }
    if (!bytes) return null;
    const type = detectType(bytes);
    if (!type) return null; // webp/gif etc. — jimp can't read these reliably
    // Already a small thumbnail — embed as-is (skip the costly re-encode).
    if (type === "jpg" && bytes.length < 45_000) return { bytes, type: "jpg" };
    // Otherwise downscale to a small JPEG so the PDF stays lightweight.
    const img = await Jimp.read(Buffer.from(bytes));
    if (img.width > 260) img.resize({ w: 260 });
    const out = await img.getBuffer("image/jpeg", { quality: 62 });
    return { bytes: new Uint8Array(out), type: "jpg" };
  } catch {
    return null;
  }
}

/** Run async tasks with a small concurrency cap. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function GET(request: Request) {
  const prisma = getPrisma();
  if (!prisma) return new NextResponse("Catalog is temporarily unavailable.", { status: 503 });

  const sp = new URL(request.url).searchParams;
  const list = (key: string) =>
    sp.getAll(key).flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  const countrySlugs = list("countries");
  const categorySlugs = list("categories");

  const [allCategories, allCountries] = await Promise.all([getCategories(), getCountryFilters()]);
  const countryNames = countrySlugs
    .map((slug) => allCountries.find((c) => c.slug === slug)?.name)
    .filter((n): n is string => Boolean(n));

  const where = {
    isActive: true,
    ...(categorySlugs.length ? { category: { slug: { in: categorySlugs } } } : {}),
    ...(countryNames.length ? { origin: { in: countryNames } } : {}),
  };

  const rows = await prisma.product.findMany({
    where,
    include: { category: true, variants: { orderBy: { position: "asc" }, take: 1 } },
    orderBy: [{ category: { position: "asc" } }, { name: "asc" }],
    take: MAX_PRODUCTS,
  });

  if (rows.length === 0) {
    return NextResponse.redirect(new URL("/catalog?empty=1", request.url), 303);
  }

  // Load images with a concurrency cap.
  const images = await pool(rows, 8, (p) => loadImage(p.imageUrl, prisma));

  // Group into categories in catalog order.
  const byCat = new Map<string, PdfCategory>();
  rows.forEach((p, idx) => {
    const key = p.category.slug;
    const g = byCat.get(key) ?? { name: p.category.name, products: [] };
    const v = p.variants[0];
    const prod: PdfProduct = {
      name: p.name,
      sku: v?.sku ?? "",
      size: v?.name && !/^each$/i.test(v.name) ? v.name : "",
      origin: p.origin,
      image: images[idx],
    };
    g.products.push(prod);
    byCat.set(key, g);
  });
  const orderedCats = allCategories
    .map((c) => byCat.get(c.slug))
    .filter((c): c is PdfCategory => Boolean(c));

  const scopeLabel = [
    countryNames.length ? countryNames.join(", ") : "All countries",
    categorySlugs.length ? categorySlugs.map((s) => allCategories.find((c) => c.slug === s)?.name ?? s).join(", ") : "All categories",
  ].join("  ·  ");

  const dateLabel = new Date(Number(sp.get("t")) || Date.now()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  const pdf = await buildCatalogPdf({
    scopeLabel: rows.length >= MAX_PRODUCTS ? `${scopeLabel}  (first ${MAX_PRODUCTS})` : scopeLabel,
    dateLabel,
    shopUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://lavagueimports.com") + "/shop",
    phone: site.phone,
    email: site.email,
    categories: orderedCats,
  });

  return new NextResponse(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="la-vague-catalog.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
