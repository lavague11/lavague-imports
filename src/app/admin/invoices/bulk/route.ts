import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Bulk archive / unarchive / delete selected invoices. Delete is permanent and
// cascades (lines, payments, photos); the client confirms before sending it.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const fd = await request.formData();
  const ids = fd.getAll("ids").map(String).map((s) => s.trim()).filter(Boolean);
  const action = String(fd.get("action") ?? "");
  if (ids.length === 0 || !["archive", "unarchive", "delete"].includes(action)) {
    return redirectTo("/admin/invoices");
  }

  try {
    const prisma = requirePrisma();
    let n = 0;
    if (action === "delete") {
      n = (await prisma.customerInvoice.deleteMany({ where: { id: { in: ids } } })).count;
    } else {
      n = (await prisma.customerInvoice.updateMany({ where: { id: { in: ids } }, data: { archived: action === "archive" } })).count;
    }
    return redirectTo(`/admin/invoices?bulk=${action}&n=${n}`);
  } catch (error) {
    console.error("[invoice] bulk action failed", error);
    return redirectTo("/admin/invoices?bulk=error");
  }
}
