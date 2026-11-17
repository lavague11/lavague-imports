import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Add a note to a customer's timeline (public = visible to the customer, else staff-only).

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
  const fd = await request.formData();
  const body = String(fd.get("body") ?? "").trim();
  const isPublic = fd.get("public") === "on" || fd.get("public") === "true";
  if (!body) return redirectTo(`/admin/customers/${id}`);

  try {
    const prisma = requirePrisma();
    const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) return redirectTo("/admin/customers");
    await prisma.customerNote.create({ data: { customerId: id, body, isPublic, author: admin.email } });
    return redirectTo(`/admin/customers/${id}?note=1`);
  } catch (error) {
    console.error("[customer] add note failed", error);
    return redirectTo(`/admin/customers/${id}?note=error`);
  }
}
