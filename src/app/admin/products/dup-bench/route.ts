import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { findSimilarBatch, findSimilarProducts } from "@/lib/admin/duplicate-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

// Benchmark the duplicate guard (PRODUCT_TAGS §5): the batched in-memory check
// used for big imports vs the per-row full check used on single-item paths.
// Admin-only, read-only.
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "db" });

  const all = await prisma.product.findMany({ select: { name: true, brand: true, barcode: true } });

  // Build a 2,500-row synthetic import from real names (repeat to reach 2,500).
  const rows: { name: string; brand: string | null; barcode: string | null }[] = [];
  while (rows.length < 2500 && all.length) rows.push(...all.slice(0, 2500 - rows.length));

  const tb = Date.now();
  const batch = await findSimilarBatch(prisma, rows);
  const batchMs = Date.now() - tb;

  // Per-row full check, small sample (for comparison on single-item paths).
  const sample = all.slice(0, 30);
  const tp = Date.now();
  for (const p of sample) await findSimilarProducts(prisma, { name: p.name, brand: p.brand, barcode: p.barcode, size: null });
  const perRowMs = (Date.now() - tp) / (sample.length || 1);

  return NextResponse.json({
    catalogSize: all.length,
    batched: { rows: rows.length, totalMs: batchMs, perRowMs: +(batchMs / (rows.length || 1)).toFixed(2), flagged: batch.filter((r) => r.exactBarcode || r.similar.length).length },
    perRowFullCheck: { sampled: sample.length, perRowMs: +perRowMs.toFixed(1), note: "used on single-item paths (voice/manual/photo), not bulk" },
  });
}
