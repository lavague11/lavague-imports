import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";

export const runtime = "nodejs";

// Purchase history for one customer: every product they've bought, most frequent
// first, with last qty / price / order date and times ordered. Each is matched to
// the catalog for a thumbnail / brand / SKU; items no longer in the catalog come
// back inCatalog:false (greyed in the UI). Also returns their most recent order's
// lines for "Repeat last order". Admin-only.

interface Item {
  description: string;
  name: string;
  brand: string;
  sku: string;
  imageUrl: string | null;
  lastQty: number;
  lastPriceCents: number | null;
  lastOrderISO: string;
  lastOrderLabel: string;
  timesOrdered: number;
  inCatalog: boolean;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const dateLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function matchCatalog(prisma: PrismaClient, query: string) {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3).slice(0, 6);
  if (tokens.length === 0) return null;
  const p = await prisma.product.findFirst({
    where: { isActive: true, OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
    select: { name: true, brand: true, imageUrl: true, variants: { select: { sku: true }, take: 1 } },
  });
  return p ? { name: p.name, brand: p.brand ?? "", imageUrl: p.imageUrl, sku: p.variants[0]?.sku ?? "" } : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "db" }, { status: 500 });

  const { id } = await params;

  const invoices = await prisma.customerInvoice.findMany({
    where: { customerId: id, status: { not: "VOID" } },
    orderBy: { issueDate: "desc" },
    select: { id: true, number: true, issueDate: true, lines: { orderBy: { id: "asc" } } },
  });

  // Aggregate by normalized description across all past invoices.
  const agg = new Map<string, { description: string; qty: number; priceCents: number | null; date: Date; count: number }>();
  for (const inv of invoices) {
    for (const l of inv.lines) {
      const desc = l.description.trim();
      if (!desc) continue;
      const key = norm(desc);
      const existing = agg.get(key);
      if (!existing) {
        agg.set(key, { description: desc, qty: l.quantity, priceCents: l.unitPriceCents, date: inv.issueDate, count: 1 });
      } else {
        existing.count += 1;
        if (inv.issueDate > existing.date) {
          existing.date = inv.issueDate;
          existing.qty = l.quantity;
          existing.priceCents = l.unitPriceCents;
        }
      }
    }
  }

  const sorted = [...agg.values()].sort((a, b) => b.count - a.count || b.date.getTime() - a.date.getTime()).slice(0, 100);
  const items: Item[] = await Promise.all(
    sorted.map(async (e) => {
      const match = await matchCatalog(prisma, e.description);
      return {
        description: e.description,
        name: match?.name || e.description,
        brand: match?.brand || "",
        sku: match?.sku || "",
        imageUrl: match?.imageUrl ?? null,
        lastQty: e.qty,
        lastPriceCents: e.priceCents,
        lastOrderISO: e.date.toISOString(),
        lastOrderLabel: dateLabel(e.date),
        timesOrdered: e.count,
        inCatalog: Boolean(match),
      };
    }),
  );

  const last = invoices[0];
  const lastOrder = last
    ? {
        number: last.number,
        label: dateLabel(last.issueDate),
        lines: last.lines
          .filter((l) => l.description.trim())
          .map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
      }
    : null;

  return NextResponse.json({ items, lastOrder });
}
