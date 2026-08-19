"use server";

import { revalidatePath } from "next/cache";

import {
  hashPassword,
  requireAdmin,
  requireUser,
  verifyPassword,
} from "@/lib/auth";
import {
  collectImagesFromForm,
  saveProductEdits,
  setActive,
  type VariantPack,
} from "@/lib/admin/products";
import { requirePrisma } from "@/lib/db";
import { type FormState } from "@/lib/form";
import { makeReference } from "@/lib/utils";

function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}
function optStr(fd: FormData, k: string) {
  const v = str(fd, k);
  return v === "" ? null : v;
}

/* ---- auth ---- */

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = str(fd, "current");
  const next = str(fd, "next");
  const confirm = str(fd, "confirm");

  if (next.length < 8) {
    return { status: "error", message: "New password must be at least 8 characters." };
  }
  if (next !== confirm) {
    return { status: "error", message: "The new passwords don't match." };
  }
  try {
    const prisma = requirePrisma();
    const row = await prisma.adminUser.findUnique({ where: { id: user.id } });
    if (!row || !(await verifyPassword(current, row.passwordHash))) {
      return { status: "error", message: "Your current password is incorrect." };
    }
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(next) },
    });
  } catch {
    return { status: "error", message: "Couldn't update the password — is the database connected?" };
  }
  return { status: "success", message: "Password changed.", reference: user.id };
}

/* ---- products ---- */

/** Per-variant packs: size__<sku> (label) and case__<sku> (units per case). */
function collectPacks(fd: FormData): Record<string, VariantPack> {
  const packs: Record<string, VariantPack> = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    let sku: string | null = null;
    let field: "size" | "unitsPerCase" | null = null;
    if (key.startsWith("size__")) { sku = key.slice("size__".length); field = "size"; }
    else if (key.startsWith("case__")) { sku = key.slice("case__".length); field = "unitsPerCase"; }
    if (!sku || !field) continue;
    packs[sku] ??= {};
    if (field === "size") {
      packs[sku].size = value.trim() || null;
    } else {
      const n = parseInt(value.trim(), 10);
      packs[sku].unitsPerCase = Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return packs;
}

export async function saveProduct(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const slug = str(fd, "slug");
  if (!slug) return { status: "error", message: "Missing product." };

  const images = await collectImagesFromForm(fd, slug);

  // Per-variant prices: fields named price__<sku> in dollars.
  const variantPrices: Record<string, number | null> = {};
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("price__") || typeof value !== "string") continue;
    const sku = key.slice("price__".length);
    const trimmed = value.trim();
    variantPrices[sku] = trimmed === "" ? null : Math.round(parseFloat(trimmed) * 100);
  }

  try {
    await saveProductEdits(
      slug,
      {
        name: str(fd, "name") || undefined,
        description: str(fd, "description") || undefined,
        images,
        origin: optStr(fd, "origin"),
        ribbon: optStr(fd, "ribbon"),
        categorySlug: str(fd, "categorySlug") || undefined,
        isFeatured: fd.get("isFeatured") === "on",
        isActive: fd.get("isActive") === "on",
        variantPrices,
        variantPacks: collectPacks(fd),
      },
      user.id,
    );
  } catch (error) {
    console.error("[admin] saveProduct failed", error);
    return { status: "error", message: "Couldn't save — is the database connected?" };
  }

  revalidatePath("/admin/products");
  revalidatePath(`/shop/${slug}`);
  revalidatePath("/shop");
  return { status: "success", message: "Saved.", reference: slug };
}

export async function bulkSetActive(fd: FormData): Promise<void> {
  const user = await requireUser();
  const slugs = fd.getAll("slug").filter((s): s is string => typeof s === "string");
  const isActive = fd.get("action") === "show";
  if (slugs.length) await setActive(slugs, isActive, user.id);
  revalidatePath("/admin/products");
  revalidatePath("/shop");
}

/* ---- users (ADMIN) ---- */

export async function createUser(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const email = str(fd, "email").toLowerCase();
  const name = optStr(fd, "name");
  const password = str(fd, "password");
  const role = str(fd, "role") === "ADMIN" ? "ADMIN" : "EDITOR";
  if (!email || password.length < 8) {
    return { status: "error", message: "Email and a password of 8+ characters are required." };
  }
  try {
    const prisma = requirePrisma();
    await prisma.adminUser.create({
      data: { email, name, role, passwordHash: await hashPassword(password) },
    });
  } catch {
    return { status: "error", message: "Couldn't add user (email already exists?)." };
  }
  revalidatePath("/admin/users");
  return { status: "success", message: `Added ${email}.`, reference: makeReference("USR") };
}
