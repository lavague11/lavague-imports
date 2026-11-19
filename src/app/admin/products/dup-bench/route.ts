import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { findSimilarProducts } from "@/lib/admin/duplicate-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

// Benchmark the shared duplicate guard at scale (PRODUCT_TAGS §5). Runs
// findSimilarProducts over a sample of real product names and projects a
// 2,500-row check time. Admin-only, read-only. ?n=150 sets the sample size.
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "db" });

  const n = Math.min(400, Math.max(20, Number(new URL(request.url).searchParams.get("n")) || 150));
  const sample = await prisma.product.findMany({ select: { name: true, brand: true, barcode: true }, take: n, orderBy: { updatedAt: "desc" } });

  const t0 = Date.now();
  for (const p of sample) {
    await findSimilarProducts(prisma, { name: p.name, brand: p.brand, barcode: p.barcode, size: null });
  }
  const totalMs = Date.now() - t0;
  const perRow = totalMs / (sample.length || 1);
  return NextResponse.json({
    sampled: sample.length,
    totalMs,
    perRowMs: +perRow.toFixed(1),
    projected2500Ms: Math.round(perRow * 2500),
    projected2500Sec: +((perRow * 2500) / 1000).toFixed(1),
    note: "Sequential per-row check. A real bulk import can batch/parallelize; this is the conservative serial figure.",
  });
}
