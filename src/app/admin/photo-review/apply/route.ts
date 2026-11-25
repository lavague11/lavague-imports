import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Photo review actions (#8). Full-page POST → 303 (Hostinger). Approving sets the
// product's live image to the sourced copy; rejecting drops the proposal and its
// stored media. Bulk approve covers every pending HIGH-confidence item.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

async function approve(prisma: ReturnType<typeof requirePrisma>, id: string) {
  const p = await prisma.pendingProductPhoto.findUnique({ where: { id }, select: { productId: true, mediaUrl: true, status: true } });
  if (!p || p.status !== "pending") return;
  await prisma.$transaction([
    prisma.product.update({ where: { id: p.productId }, data: { imageUrl: p.mediaUrl } }),
    prisma.pendingProductPhoto.update({ where: { id }, data: { status: "approved", reviewedAt: new Date() } }),
  ]);
}

async function reject(prisma: ReturnType<typeof requirePrisma>, id: string) {
  const p = await prisma.pendingProductPhoto.findUnique({ where: { id }, select: { mediaUrl: true, status: true } });
  if (!p || p.status !== "pending") return;
  await prisma.pendingProductPhoto.update({ where: { id }, data: { status: "rejected", reviewedAt: new Date() } });
  // Drop the orphaned media copy (never published).
  if (p.mediaUrl.startsWith("/media/")) {
    await prisma.mediaAsset.delete({ where: { id: p.mediaUrl.slice("/media/".length) } }).catch(() => {});
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const prisma = requirePrisma();

  try {
    if (action === "approveAllHigh") {
      const highs = await prisma.pendingProductPhoto.findMany({ where: { status: "pending", confidence: "high" }, select: { id: true } });
      for (const h of highs) await approve(prisma, h.id);
    } else {
      const id = String(form.get("id") ?? "");
      if (id && action === "approve") await approve(prisma, id);
      else if (id && action === "reject") await reject(prisma, id);
    }
  } catch (err) {
    console.error("[photo-review] apply failed", err);
    return redirectTo("/admin/photo-review?error=1");
  }

  // Show approved images on the storefront + products views.
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  return redirectTo(`/admin/photo-review?done=1`);
}
