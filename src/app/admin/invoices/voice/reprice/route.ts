import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export const runtime = "nodejs";

// Re-price voice-queued items against a customer's last-paid prices, once the
// customer is set. Returns { prices: { <sku||name>: cents } }.
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ prices: {} }, { status: 401 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ prices: {} });

  const body = (await request.json().catch(() => null)) as
    | { customerId?: string; items?: { sku?: string; name?: string }[] }
    | null;
  const customerId = (body?.customerId || "").trim();
  const items = Array.isArray(body?.items) ? body!.items : [];
  if (!customerId || items.length === 0) return NextResponse.json({ prices: {} });

  const prices: Record<string, number> = {};
  await Promise.all(
    items.map(async (it) => {
      const name = (it.name || "").trim();
      if (!name) return;
      const line = await prisma.customerInvoiceLine.findFirst({
        where: {
          isCredit: false,
          description: { contains: name, mode: "insensitive" },
          invoice: { customerId, status: { not: "VOID" } },
        },
        orderBy: { invoice: { issueDate: "desc" } },
        select: { unitPriceCents: true },
      });
      if (line) prices[it.sku || name] = line.unitPriceCents;
    }),
  );
  return NextResponse.json({ prices });
}
