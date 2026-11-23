import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createCustomerSession } from "@/lib/customer-auth";
import { requirePrisma } from "@/lib/db";

// Admin convenience: "Preview store". Signs staff into the STOREFRONT as a
// dedicated, synthetic WHOLESALE customer so they can see the logged-in store
// (and the catalog) without losing their admin session — the admin cookie
// (lv_admin_session) and the customer cookie (lv_customer_session) are separate.
// Opened with target="_blank" from the admin nav. Full-page POST → 303 (a
// server-action redirect breaks on the live host). The preview session is
// ephemeral (clears when the browser closes).

const PREVIEW_EMAIL = "store-preview@lavague.local";

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST() {
  try {
    await requireUser();
  } catch {
    return redirectTo("/login");
  }

  try {
    const prisma = requirePrisma();
    let preview = await prisma.customer.findUnique({
      where: { email: PREVIEW_EMAIL },
      select: { id: true },
    });
    if (!preview) {
      preview = await prisma.customer.create({
        data: {
          email: PREVIEW_EMAIL,
          name: "Store Preview",
          role: "WHOLESALE",
          passwordHash: null, // no password login — only reachable via this admin link
          notes: "Synthetic account for the admin “Preview store” link. Not a real customer.",
        },
        select: { id: true },
      });
    }
    await createCustomerSession(preview.id, false); // ephemeral (session cookie)
    return redirectTo("/");
  } catch {
    return redirectTo("/admin?preview=error");
  }
}
