import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

// Global search (DASHBOARD §1b): customers, invoices (I-number or LV), products.
export async function GET(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ customers: [], invoices: [], products: [] }, { status: 401 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ customers: [], invoices: [], products: [] });

  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ customers: [], invoices: [], products: [] });
  const ci = { contains: q, mode: "insensitive" as const };

  const [customers, invoices, products] = await Promise.all([
    prisma.customer.findMany({ where: { OR: [{ businessName: ci }, { name: ci }, { email: ci }] }, take: 5, select: { id: true, businessName: true, name: true, email: true } }),
    prisma.customerInvoice.findMany({ where: { OR: [{ number: ci }, { externalNumber: ci }] }, take: 5, orderBy: { createdAt: "desc" }, select: { id: true, number: true, externalNumber: true, customer: { select: { businessName: true, name: true } } } }),
    prisma.product.findMany({ where: { name: ci }, take: 5, select: { slug: true, name: true, brand: true } }),
  ]);

  return NextResponse.json({
    customers: customers.map((c) => ({ id: c.id, label: c.businessName || c.name || c.email || "Customer" })),
    invoices: invoices.map((i) => ({ id: i.id, label: `${i.externalNumber || i.number}${i.externalNumber ? ` · ${i.number}` : ""}`, sub: i.customer?.businessName || i.customer?.name || "" })),
    products: products.map((p) => ({ slug: p.slug, label: p.name, sub: p.brand || "" })),
  });
}
