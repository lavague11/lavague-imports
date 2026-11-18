import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

// Permanently delete a product (the client confirms first). Variants and any
// draft quote items cascade via the schema; the durable override is removed too
// so a re-import doesn't resurrect stale edits. Full-page POST → 303 (host-safe).
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireUser();
  } catch {
    return redirectTo("/admin/login");
  }

  const { slug } = await params;
  const prisma = getPrisma();
  if (!prisma) return redirectTo("/admin/products");

  try {
    const product = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) return redirectTo("/admin/products");
    await prisma.productOverride.deleteMany({ where: { slug } });
    await prisma.product.delete({ where: { id: product.id } });
  } catch (error) {
    console.error("[admin] delete product failed", error);
    return redirectTo(`/admin/products/${slug}?delerror=1`);
  }

  return redirectTo("/admin/products?deleted=1");
}
