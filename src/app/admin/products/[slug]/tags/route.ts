import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import type { TagKind } from "@/generated/prisma/client";
import { TAG_KINDS, addProductTag, getProductTags, removeProductTag } from "@/lib/admin/product-tags";

export const runtime = "nodejs";

// Add/remove a product tag (PRODUCT_TAGS §1). JSON API (not a redirect) so the
// edit form updates its chips in place. Admin-only.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  }
  const { slug } = await params;
  const body = (await request.json().catch(() => null)) as
    | { action?: string; kind?: string; value?: string; lang?: string | null; id?: string }
    | null;
  const action = body?.action;

  if (action === "remove" && body?.id) {
    await removeProductTag(body.id);
    return NextResponse.json({ ok: true, tags: await getProductTags(slug) });
  }

  if (action === "add") {
    const kind = body?.kind as TagKind | undefined;
    if (!kind || !TAG_KINDS.includes(kind)) return NextResponse.json({ ok: false, error: "kind" }, { status: 400 });
    const res = await addProductTag(slug, kind, String(body?.value ?? ""), { lang: body?.lang ?? null });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error });
    return NextResponse.json({ ok: true, tags: await getProductTags(slug) });
  }

  return NextResponse.json({ ok: false, error: "action" }, { status: 400 });
}
