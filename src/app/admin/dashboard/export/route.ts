import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { rangeWindow } from "@/lib/admin/range";
import { getPrisma } from "@/lib/db";

// Export a dashboard card's data as CSV (DASHBOARD §1b).
const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(esc).join(",")).join("\n");
const money = (c: number) => (c / 100).toFixed(2);

function send(name: string, body: string) {
  return new NextResponse(body, {
    headers: { "content-type": "text/csv;charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"` },
  });
}

export async function GET(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: false }, { status: 500 });

  const url = new URL(request.url);
  const card = url.searchParams.get("card") || "";
  const win = rangeWindow(url.searchParams.get("range") || "month", url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined);
  const invoiced = { in: ["SENT", "PARTIAL", "PAID"] as ("SENT" | "PARTIAL" | "PAID")[] };

  if (card === "top-products") {
    const lines = await prisma.customerInvoiceLine.groupBy({ by: ["sku"], where: { isCredit: false, sku: { not: null }, invoice: { status: invoiced, issueDate: { gte: win.start, lte: win.end } } }, _sum: { lineTotalCents: true, quantity: true } });
    const skus = lines.map((l) => l.sku).filter((s): s is string => !!s);
    const variants = skus.length ? await prisma.productVariant.findMany({ where: { sku: { in: skus } }, select: { sku: true, product: { select: { name: true } } } }) : [];
    const name = new Map(variants.map((v) => [v.sku, v.product.name]));
    const rows = lines
      .filter((l) => l.sku && (l._sum.lineTotalCents ?? 0) > 0)
      .sort((a, b) => (b._sum.lineTotalCents ?? 0) - (a._sum.lineTotalCents ?? 0))
      .map((l) => [name.get(l.sku as string) ?? l.sku!, l.sku!, money(l._sum.lineTotalCents ?? 0), l._sum.quantity ?? 0]);
    return send("top-products", csv([["Product", "SKU", "Revenue", "Cases"], ...rows]));
  }

  if (card === "top-customers") {
    const agg = await prisma.customerInvoice.groupBy({ by: ["customerId"], where: { customerId: { not: null }, status: invoiced, issueDate: { gte: win.start, lte: win.end } }, _sum: { totalCents: true } });
    const ids = agg.map((a) => a.customerId).filter((i): i is string => !!i);
    const custs = ids.length ? await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, businessName: true, name: true } }) : [];
    const nm = new Map(custs.map((c) => [c.id, c.businessName || c.name || "Customer"]));
    const rows = agg.sort((a, b) => (b._sum.totalCents ?? 0) - (a._sum.totalCents ?? 0)).map((a) => [nm.get(a.customerId as string) ?? "", money(a._sum.totalCents ?? 0)]);
    return send("top-customers", csv([["Customer", "Revenue"], ...rows]));
  }

  if (card === "biggest-balances") {
    const open = await prisma.customerInvoice.findMany({ where: { archived: false, status: { not: "VOID" }, totalCents: { gt: prisma.customerInvoice.fields.paidCents } }, select: { number: true, externalNumber: true, totalCents: true, paidCents: true, dueDate: true, customer: { select: { businessName: true, name: true } } } });
    const now = new Date();
    const rows = open
      .sort((a, b) => (b.totalCents - b.paidCents) - (a.totalCents - a.paidCents))
      .map((i) => [i.customer?.businessName || i.customer?.name || "", i.externalNumber || i.number, money(i.totalCents - i.paidCents), i.dueDate && i.dueDate < now ? Math.floor((now.getTime() - i.dueDate.getTime()) / 864e5) : 0]);
    return send("biggest-balances", csv([["Customer", "Invoice", "Balance", "Days late"], ...rows]));
  }

  return NextResponse.json({ ok: false, error: "unknown card" }, { status: 400 });
}
