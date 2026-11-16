import { NextResponse } from "next/server";

import { destroyCustomerSession } from "@/lib/customer-auth";

// Sign a customer out as a full-page POST → 303 back to the home page.
export async function POST() {
  await destroyCustomerSession();
  return new NextResponse(null, { status: 303, headers: { Location: "/" } });
}
