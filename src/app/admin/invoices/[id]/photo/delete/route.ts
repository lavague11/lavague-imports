import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Delete one invoice photo (and its stored image). Owner-invoice scoped.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const { id } = await params;
  const fd = await request.formData();
  const photoId = String(fd.get("photoId") ?? "").trim();
  if (!photoId) return redirectTo(`/admin/invoices/${id}`);

  try {
    const prisma = requirePrisma();
    const photo = await prisma.invoicePhoto.findUnique({ where: { id: photoId }, select: { id: true, invoiceId: true, url: true } });
    if (!photo || photo.invoiceId !== id) return redirectTo(`/admin/invoices/${id}`);

    await prisma.invoicePhoto.delete({ where: { id: photoId } });
    // Best-effort: remove the backing image bytes too.
    if (photo.url.startsWith("/media/")) {
      await prisma.mediaAsset.delete({ where: { id: photo.url.slice("/media/".length) } }).catch(() => {});
    }
    return redirectTo(`/admin/invoices/${id}?photo=deleted`);
  } catch (error) {
    console.error("[invoice] photo delete failed", error);
    return redirectTo(`/admin/invoices/${id}?photo=error`);
  }
}
