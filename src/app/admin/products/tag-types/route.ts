import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { addTypeOption, listTypeOptions, removeTypeOption } from "@/lib/admin/product-tags";

export const runtime = "nodejs";

// Manage the controlled TYPE list (PRODUCT_TAGS §1). Admin-only JSON API.
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { action?: string; name?: string; id?: string } | null;

  if (body?.action === "add" && body.name?.trim()) {
    await addTypeOption(body.name);
    return NextResponse.json({ ok: true, options: await listTypeOptions() });
  }
  if (body?.action === "remove" && body.id) {
    await removeTypeOption(body.id);
    return NextResponse.json({ ok: true, options: await listTypeOptions() });
  }
  return NextResponse.json({ ok: false, error: "action" }, { status: 400 });
}
