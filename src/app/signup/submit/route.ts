import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/auth";
import { titleCaseName } from "@/lib/capitalize";
import { createCustomerSession } from "@/lib/customer-auth";
import { requirePrisma } from "@/lib/db";

// Create a customer account as a full-page POST → 303 (Post/Redirect/Get).

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return "/account";
  if (next.startsWith("/login") || next.startsWith("/signup")) return "/account";
  return next;
}

function redirectTo(pathAndQuery: string) {
  return new NextResponse(null, { status: 303, headers: { Location: pathAndQuery } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const rawName = String(form.get("name") ?? "").trim();
  const name = rawName ? titleCaseName(rawName) : null;
  const next = safeNext(form.get("next"));

  const fail = (code: string) => {
    const params = new URLSearchParams({ mode: "signup", error: code });
    if (next !== "/account") params.set("next", next);
    return redirectTo(`/login?${params.toString()}`);
  };

  if (!EMAIL_RE.test(email)) return fail("email");
  if (password.length < 8) return fail("weak");

  try {
    const prisma = requirePrisma();

    // An admin email should sign in as staff, not create a customer account.
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (admin) return fail("exists");

    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing) return fail("exists");

    const customer = await prisma.customer.create({
      data: { email, name, passwordHash: await hashPassword(password) },
    });
    await createCustomerSession(customer.id);
    return redirectTo(next);
  } catch {
    return fail("db");
  }
}
