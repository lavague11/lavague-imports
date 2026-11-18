import { NextResponse } from "next/server";

import { hashPassword, requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Admin-only: provision (or reset) a storefront login password for a customer.
// For B2B accounts imported without a login, this lets the owner set a password
// so the customer (or the owner, to test) can sign in. The password is typed by
// the admin, posted over HTTPS, and stored only as a scrypt hash.
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
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return redirectTo(`/admin/customers/${id}?login=short`);

  try {
    const prisma = requirePrisma();
    const existing = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return redirectTo("/admin/customers");
    await prisma.customer.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  } catch (error) {
    console.error("[customer] set-login failed", error);
    return redirectTo(`/admin/customers/${id}?login=error`);
  }

  return redirectTo(`/admin/customers/${id}?login=set`);
}
