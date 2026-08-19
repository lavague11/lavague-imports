import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";

// Serves an admin image stored in the database (MediaAsset). Kept in Postgres
// rather than on disk so photos survive redeploys, which rebuild public/.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const prisma = getPrisma();
  if (!prisma) return new NextResponse("Not found", { status: 404 });

  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) return new NextResponse("Not found", { status: 404 });
    const body = new Uint8Array(asset.data);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": asset.contentType || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Error", { status: 500 });
  }
}
