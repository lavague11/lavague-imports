import { NextResponse } from "next/server";

import { createSession, verifyPassword } from "@/lib/auth";
import { createCustomerSession, findCustomerByIdentifier } from "@/lib/customer-auth";
import { requirePrisma } from "@/lib/db";

// Unified sign-in as a full-page POST → 303 (Post/Redirect/Get), NOT a Server
// Action — server-action redirects break on the live host. One email field
// serves both staff (AdminUser → /admin) and customers (Customer → next).

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return "/account";
  if (next.startsWith("/login") || next.startsWith("/signup")) return "/account";
  return next;
}

function redirectTo(pathAndQuery: string) {
  return new NextResponse(null, { status: 303, headers: { Location: pathAndQuery } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  // Accept either the new `identifier` (email OR phone) or the legacy `email`.
  const identifier = String(form.get("identifier") ?? form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const remember = form.get("remember") === "on";
  const next = safeNext(form.get("next"));

  const fail = (code: string) => {
    const params = new URLSearchParams({ error: code });
    if (next !== "/account") params.set("next", next);
    if (identifier) params.set("id", identifier);
    return redirectTo(`/login?${params.toString()}`);
  };

  try {
    const prisma = requirePrisma();

    // Staff first — an admin email routes to the admin workspace (email only).
    if (identifier.includes("@")) {
      const admin = await prisma.adminUser.findUnique({ where: { email: identifier.toLowerCase() } });
      if (admin) {
        if (await verifyPassword(password, admin.passwordHash)) {
          await createSession(admin.id, remember);
          return redirectTo("/admin");
        }
        return fail("invalid");
      }
    }

    // Otherwise a customer, by email or phone.
    const customer = await findCustomerByIdentifier(identifier);
    if (customer && customer.passwordHash && (await verifyPassword(password, customer.passwordHash))) {
      await createCustomerSession(customer.id, remember);
      return redirectTo(next);
    }
    return fail("invalid");
  } catch {
    return fail("db");
  }
}
