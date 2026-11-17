import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { PHOTO_KINDS, type PhotoKind } from "@/lib/invoice-photo-constants";
import { storeInvoicePhoto } from "@/lib/invoice-photos";

// Upload a photo (proof of delivery / payment / other) to an invoice. Multipart
// POST → 303 back to the invoice. The image is stored in MediaAsset.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const { id } = await params;

  try {
    const prisma = requirePrisma();
    const invoice = await prisma.customerInvoice.findUnique({ where: { id }, select: { id: true } });
    if (!invoice) return redirectTo("/admin/invoices");

    const fd = await request.formData();
    const file = fd.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return redirectTo(`/admin/invoices/${id}?photo=none`);
    }

    const kindRaw = String(fd.get("kind") ?? "OTHER").toUpperCase();
    const kind = (PHOTO_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as PhotoKind) : "OTHER";
    let label = String(fd.get("label") ?? "").trim() || null;
    if (kind === "OTHER" && !label) label = "Other";
    if (kind !== "OTHER") label = label || null; // keep as optional caption

    const url = await storeInvoicePhoto(file);
    if (!url) return redirectTo(`/admin/invoices/${id}?photo=bad`);

    await prisma.invoicePhoto.create({
      data: { invoiceId: id, url, kind, label, uploadedBy: admin.email },
    });

    return redirectTo(`/admin/invoices/${id}?photo=1`);
  } catch (error) {
    console.error("[invoice] photo upload failed", error);
    return redirectTo(`/admin/invoices/${id}?photo=error`);
  }
}
