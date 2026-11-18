import { NextResponse } from "next/server";

import { findCustomerByIdentifier } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";

// Step 1 of the two-step sign-in: does an account exist for this email/phone?
// Returns whether it's found and has a password, so the client knows to ask for
// a password or offer to create an account.
export async function GET(request: Request) {
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ found: false });

  const identifier = (new URL(request.url).searchParams.get("identifier") || "").trim();
  if (identifier.length < 3) return NextResponse.json({ found: false });

  try {
    // Staff email routes to the admin workspace.
    if (identifier.includes("@")) {
      const admin = await prisma.adminUser.findUnique({ where: { email: identifier.toLowerCase() }, select: { name: true } });
      if (admin) return NextResponse.json({ found: true, hasPassword: true, kind: "admin", name: admin.name });
    }
    const customer = await findCustomerByIdentifier(identifier);
    if (customer) return NextResponse.json({ found: true, hasPassword: !!customer.passwordHash, kind: "customer", name: customer.name });
    return NextResponse.json({ found: false });
  } catch {
    return NextResponse.json({ found: false });
  }
}
