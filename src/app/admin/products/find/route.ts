import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

// Lightweight name lookup for the "looks like this already exists" hint while
// typing a product name (PRODUCTS_UI §12). Returns up to 3 close matches.
export async function GET(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ matches: [] }, { status: 401 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ matches: [] });

  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").trim();
  const brand = (url.searchParams.get("brand") || "").trim();
  const exclude = (url.searchParams.get("exclude") || "").trim();

  const words = `${brand} ${name}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (!words.length) return NextResponse.json({ matches: [] });

  const candidates = await prisma.product.findMany({
    where: {
      AND: [
        exclude ? { slug: { not: exclude } } : {},
        { OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
      ],
    },
    select: { slug: true, name: true, brand: true },
    take: 25,
  });

  const scored = candidates
    .map((c) => {
      const hay = `${c.brand ?? ""} ${c.name}`.toLowerCase();
      const score = words.reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
      return { ...c, score };
    })
    .filter((c) => c.score >= Math.min(words.length, 2))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ slug, name, brand }) => ({ slug, name, brand }));

  return NextResponse.json({ matches: scored });
}
