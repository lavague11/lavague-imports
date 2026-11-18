import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { dismissDuplicateGroup, mergeProducts, undoMerge } from "@/lib/admin/duplicates";

// PRODUCTS_UI §17 cleanup actions: merge a duplicate group, mark Not Duplicates,
// or undo a merge. JSON in/out (client refreshes). No redirect.
export async function POST(request: Request) {
  let actor: string | undefined;
  try {
    const user = await requireAdmin();
    actor = user.email;
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: { action?: string; survivorSlug?: string; slugs?: string[]; key?: string; logId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    if (body.action === "merge" && body.survivorSlug && Array.isArray(body.slugs)) {
      const r = await mergeProducts(body.survivorSlug, body.slugs, actor);
      revalidatePath("/admin/products/duplicates");
      revalidatePath("/admin/products");
      revalidatePath("/shop");
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.action === "dismiss" && body.key) {
      await dismissDuplicateGroup(body.key);
      revalidatePath("/admin/products/duplicates");
      return NextResponse.json({ ok: true });
    }
    if (body.action === "undo" && body.logId) {
      const r = await undoMerge(body.logId);
      revalidatePath("/admin/products/duplicates");
      revalidatePath("/admin/products");
      revalidatePath("/shop");
      return NextResponse.json(r);
    }
  } catch (error) {
    console.error("[admin] duplicates action failed", error);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });
}
