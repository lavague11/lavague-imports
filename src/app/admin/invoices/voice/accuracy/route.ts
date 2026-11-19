import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { resolveSpokenItem } from "@/lib/admin/tag-match";

export const runtime = "nodejs";
export const maxDuration = 60;

// Accuracy + speed harness (PRODUCT_TAGS §9). Builds a test set from real past
// invoices (line description → the product it was actually for) and measures the
// resolver WITH vs WITHOUT the customer-history tier, plus avg time per item.
// Admin-only, read-only. ?limit=120 caps the number of items.
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "db" });

  const limit = Math.min(300, Math.max(10, Number(new URL(request.url).searchParams.get("limit")) || 120));

  const invoices = await prisma.customerInvoice.findMany({
    where: { customerId: { not: null }, status: { not: "VOID" }, lines: { some: { sku: { not: null }, isCredit: false } } },
    select: { customerId: true, lines: { where: { sku: { not: null }, isCredit: false }, select: { description: true, sku: true } } },
    orderBy: { issueDate: "desc" },
    take: 30,
  });

  const tests: { desc: string; sku: string; customerId: string }[] = [];
  for (const inv of invoices) {
    if (!inv.customerId) continue;
    for (const l of inv.lines) {
      if (l.sku && l.description.trim()) tests.push({ desc: l.description, sku: l.sku, customerId: inv.customerId });
      if (tests.length >= limit) break;
    }
    if (tests.length >= limit) break;
  }

  let withHistoryCorrect = 0;
  let noHistoryCorrect = 0;
  let totalMs = 0;
  const tiers: Record<string, number> = { history: 0, tag: 0, fuzzy: 0, none: 0 };
  const samples: { heard: string; correct: string; got: string | null; tier: string; ok: boolean }[] = [];

  for (const t of tests) {
    const t0 = Date.now();
    const withH = await resolveSpokenItem(prisma, { name: t.desc, customerId: t.customerId });
    totalMs += Date.now() - t0;
    const noH = await resolveSpokenItem(prisma, { name: t.desc });

    const gotW = withH.match?.sku ?? null;
    const gotN = noH.match?.sku ?? null;
    const okW = gotW === t.sku;
    if (okW) withHistoryCorrect += 1;
    if (gotN === t.sku) noHistoryCorrect += 1;
    tiers[withH.match?.source ?? "none"] += 1;

    if (samples.length < 20) samples.push({ heard: t.desc, correct: t.sku, got: gotW, tier: withH.match?.source ?? "none", ok: okW });
  }

  const n = tests.length || 1;
  return NextResponse.json({
    items: tests.length,
    withHistory: { correct: withHistoryCorrect, accuracy: +(withHistoryCorrect / n).toFixed(3) },
    noHistory: { correct: noHistoryCorrect, accuracy: +(noHistoryCorrect / n).toFixed(3) },
    avgMsPerItem: +(totalMs / n).toFixed(1),
    tiers,
    note: "Test items are past invoice lines (description → actual sku). 'withHistory' uses the customer-history tier; 'noHistory' isolates tag+fuzzy (tags backfill in stage 7). Arabic/Arabizi normalization isn't exercised by English descriptions.",
    samples,
  });
}
