import { NextResponse } from "next/server";

import { requirePrisma } from "@/lib/db";

// Customer accepts/signs an invoice via its public token (in-app e-signature —
// no external service). Records the typed name + drawn signature + timestamp.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fd = await request.formData();
  const signerName = String(fd.get("signerName") ?? "").trim();
  const signatureData = String(fd.get("signatureData") ?? "").trim() || null;

  if (!signerName) return redirectTo(`/invoice/${token}?error=name`);

  try {
    const prisma = requirePrisma();
    const invoice = await prisma.customerInvoice.findUnique({
      where: { publicToken: token },
      select: { id: true, status: true, signedAt: true },
    });
    if (!invoice) return redirectTo(`/invoice/${token}?error=notfound`);
    if (invoice.status === "VOID") return redirectTo(`/invoice/${token}?error=void`);
    if (invoice.signedAt) return redirectTo(`/invoice/${token}?signed=already`);

    // Keep the stored signature image bounded (defensive).
    const sig = signatureData && signatureData.length < 200_000 ? signatureData : null;

    await prisma.customerInvoice.update({
      where: { id: invoice.id },
      data: { signerName, signatureData: sig, signedAt: new Date() },
    });

    return redirectTo(`/invoice/${token}?signed=1`);
  } catch (error) {
    console.error("[invoice] sign failed", error);
    return redirectTo(`/invoice/${token}?error=sign`);
  }
}
