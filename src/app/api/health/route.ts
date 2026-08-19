import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";

// Temporary deploy diagnostic — reports what the live server sees for the
// database. No credentials are exposed (host only). Remove after debugging.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.DATABASE_URL;
  const hasDatabaseUrl = Boolean(url);
  const host = url ? (url.split("@")[1]?.split("/")[0] ?? null) : null;
  const endsWith = url ? url.slice(-24) : null;

  let db = "not-attempted";
  if (hasDatabaseUrl) {
    try {
      const prisma = getPrisma();
      const count = await prisma!.product.count();
      db = `ok:${count}`;
    } catch (error) {
      db = "error: " + (error instanceof Error ? error.message.slice(0, 160) : "unknown");
    }
  }

  return NextResponse.json({
    hasDatabaseUrl,
    host,
    urlEndsWith: endsWith,
    hasSiteUrl: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    db,
  });
}
