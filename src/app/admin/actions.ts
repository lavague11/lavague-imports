"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createSession,
  hashPassword,
  requireAdmin,
  requireUser,
  verifyPassword,
} from "@/lib/auth";
import {
  createCustomProduct,
  localizeImage,
  saveProductEdits,
  setActive,
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

export async function login(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const next = str(fd, "next") || "/admin";
  try {
    const prisma = requirePrisma();
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return { status: "error", message: "Incorrect email or password." };
    }
    await createSession(user.id);
  } catch {
    return { status: "error", message: "Sign-in is unavailable — is the database connected?" };
  }
  redirect(next.startsWith("/admin") ? next : "/admin");
}

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

export async function saveProduct(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const slug = str(fd, "slug");
  if (!slug) return { status: "error", message: "Missing product." };

  // Resolve the image: localise a newly pasted remote URL, keep local paths.
  let imageUrl = optStr(fd, "imageUrl");
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    imageUrl = await localizeImage(slug, imageUrl);
  }

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
        imageUrl,
        origin: optStr(fd, "origin"),
        ribbon: optStr(fd, "ribbon"),
        categorySlug: str(fd, "categorySlug") || undefined,
        isFeatured: fd.get("isFeatured") === "on",
        isActive: fd.get("isActive") === "on",
        variantPrices,
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

export async function createProduct(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const name = str(fd, "name");
  const categorySlug = str(fd, "categorySlug");
  if (!name || !categorySlug) {
    return { status: "error", message: "Name and category are required." };
  }
  const slug =
    (str(fd, "slug") || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "product";
  const priceStr = str(fd, "price");
  let imageUrl = optStr(fd, "imageUrl");
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) imageUrl = await localizeImage(slug, imageUrl);

  try {
    await createCustomProduct({
      name,
      slug,
      sku: str(fd, "sku") || `LV-${slug}`.toUpperCase().slice(0, 40),
      categorySlug,
      description: str(fd, "description") || `${name}.`,
      origin: optStr(fd, "origin"),
      ribbon: optStr(fd, "ribbon"),
      imageUrl,
      priceCents: priceStr ? Math.round(parseFloat(priceStr) * 100) : null,
    });
  } catch (error) {
    console.error("[admin] createProduct failed", error);
    return { status: "error", message: "Couldn't create the product (duplicate slug, or DB offline?)." };
  }
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  redirect(`/admin/products/${slug}`);
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
