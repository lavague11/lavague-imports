import { NextResponse } from "next/server";

import { getCustomer } from "@/lib/customer-auth";

// Per-request session probe for the (statically-rendered) storefront header.
// The header is a client component, so it fetches this to learn whether a
// customer is signed in — this keeps every store page static/cacheable instead
// of forcing the whole layout dynamic by reading cookies in the server layout.
// Must never be cached (per-user): no-store, force-dynamic.
export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCustomer();
  return NextResponse.json(
    customer
      ? { loggedIn: true, name: customer.name, email: customer.email, role: customer.role }
      : { loggedIn: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
