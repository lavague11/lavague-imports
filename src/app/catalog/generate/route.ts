import { NextResponse } from "next/server";

import { generateCatalog } from "@/lib/build-catalog";
import { getPrisma } from "@/lib/db";

const MAX_ON_DEMAND = 500;

function pdfResponse(bytes: Uint8Array) {
  return new NextResponse(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="la-vague-catalog.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const prisma = getPrisma();
  if (!prisma) return new NextResponse("Catalog is temporarily unavailable.", { status: 503 });

  const sp = new URL(request.url).searchParams;
  const list = (key: string) => sp.getAll(key).flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  const countrySlugs = list("countries");
  const categorySlugs = list("categories");
  const sortMode = sp.get("sort") === "category" ? "category" : "country";
  const isFull = countrySlugs.length === 0 && categorySlugs.length === 0;

  // Unfiltered download → serve the pre-built complete catalog instantly.
  if (isFull) {
    const cached = await prisma.catalogCache
      .findUnique({ where: { key: `full-${sortMode}` }, select: { data: true } })
      .catch(() => null);
    if (cached) return pdfResponse(new Uint8Array(cached.data));
  }

  // Filtered (or cache miss) → build on demand.
  const result = await generateCatalog(prisma, { countrySlugs, categorySlugs, sortMode, max: MAX_ON_DEMAND });
  if (!result) return NextResponse.redirect(new URL("/catalog?empty=1", request.url), 303);
  return pdfResponse(result.pdf);
}
