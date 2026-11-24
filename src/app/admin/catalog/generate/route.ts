import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { generateCatalog } from "@/lib/build-catalog";
import { getPrisma } from "@/lib/db";

// Admin-side catalog download (dashboard "Download catalog" modal). Same PDF as
// the storefront /catalog/generate, but gated on the ADMIN session instead of a
// wholesale CUSTOMER session. The admin modal fetches this, so empty selections
// return 404 (shown inline) rather than redirecting to a customer page.

// High enough to include the whole catalog; the PDF paginates as needed.
const MAX_ON_DEMAND = 10000;

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
  try {
    await requireAdmin();
  } catch {
    return new NextResponse("Not authorized.", { status: 401 });
  }

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

  const result = await generateCatalog(prisma, { countrySlugs, categorySlugs, sortMode, max: MAX_ON_DEMAND });
  if (!result) return new NextResponse("Nothing matched that selection.", { status: 404 });
  return pdfResponse(result.pdf);
}
