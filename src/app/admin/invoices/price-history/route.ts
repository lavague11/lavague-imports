import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";

// Price history for a line item: what THIS customer last paid for it (+ the last 5),
// and the catalog price as a fallback. Admin-only. Used by the editor's price hint.

const dateLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "db" }, { status: 500 });

  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim();
  const customerId = (url.searchParams.get("customerId") ?? "").trim();
  if (name.length < 3) return NextResponse.json({ lastPriceCents: null, catalogPriceCents: null, history: [] });

  // This customer's past paid prices for this item (most recent first).
  let lastPriceCents: number | null = null;
  let lastDate: string | null = null;
  const history: { priceCents: number; date: string }[] = [];
  if (customerId) {
    const lines = await prisma.customerInvoiceLine.findMany({
      where: { isCredit: false, description: { contains: name, mode: "insensitive" }, invoice: { customerId, status: { not: "VOID" } } },
      orderBy: { invoice: { issueDate: "desc" } },
      select: { unitPriceCents: true, invoice: { select: { issueDate: true } } },
      take: 5,
    });
    if (lines.length) {
      lastPriceCents = lines[0].unitPriceCents;
      lastDate = dateLabel(lines[0].invoice.issueDate);
      for (const l of lines) history.push({ priceCents: l.unitPriceCents, date: dateLabel(l.invoice.issueDate) });
    }
  }

  // Catalog price fallback.
  const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3).slice(0, 6);
  let catalogPriceCents: number | null = null;
  let imageUrl: string | null = null;
  if (tokens.length) {
    const p = await prisma.product.findFirst({
      where: { isActive: true, OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
      select: { imageUrl: true, variants: { select: { retailPriceCents: true }, take: 1 } },
    });
    catalogPriceCents = p?.variants[0]?.retailPriceCents ?? null;
    imageUrl = p?.imageUrl ?? null;
  }

  return NextResponse.json({ lastPriceCents, lastDate, catalogPriceCents, imageUrl, history });
}
