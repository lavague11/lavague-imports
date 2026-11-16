import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/auth";
import { createCustomerSession } from "@/lib/customer-auth";
import { requirePrisma } from "@/lib/db";

// Complete a password reset. Validates the single-use, 30-minute token, sets the
// new password, marks the token used, and signs the customer in. Full-page POST.

function redirectTo(pathAndQuery: string) {
  return new NextResponse(null, { status: 303, headers: { Location: pathAndQuery } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  const back = (code: string) =>
    redirectTo(`/reset?token=${encodeURIComponent(token)}&error=${code}`);

  if (password.length < 8) return back("weak");
  if (password !== confirm) return back("mismatch");

  try {
    const prisma = requirePrisma();
    const row = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      return redirectTo("/reset?error=invalid");
    }
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: row.customerId },
        data: { passwordHash: await hashPassword(password) },
      }),
      prisma.passwordResetToken.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
      // Invalidate any other outstanding reset tokens for this customer.
      prisma.passwordResetToken.deleteMany({
        where: { customerId: row.customerId, usedAt: null },
      }),
    ]);
    await createCustomerSession(row.customerId);
  } catch {
    return redirectTo("/reset?error=invalid");
  }
  return redirectTo("/account");
}
