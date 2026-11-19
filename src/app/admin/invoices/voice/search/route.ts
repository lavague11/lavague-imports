import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { searchCatalog } from "@/lib/admin/voice-catalog";

export const runtime = "nodejs";

// Free-text catalog search for the voice card's "change match" box. Admin-only.
// Returns line-ready hits; never creates anything.
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ results: [] }, { status: 401 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ results: [] });

  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const results = await searchCatalog(prisma, q, 6);
  return NextResponse.json({ results });
}
