import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Delete a customer note (owner-scoped).

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
  const noteId = String(fd.get("noteId") ?? "").trim();
  if (!noteId) return redirectTo(`/admin/customers/${id}`);

  try {
    const prisma = requirePrisma();
    const note = await prisma.customerNote.findUnique({ where: { id: noteId }, select: { customerId: true } });
    if (note && note.customerId === id) {
      await prisma.customerNote.delete({ where: { id: noteId } });
    }
    return redirectTo(`/admin/customers/${id}?note=deleted`);
  } catch (error) {
    console.error("[customer] delete note failed", error);
    return redirectTo(`/admin/customers/${id}`);
  }
}
