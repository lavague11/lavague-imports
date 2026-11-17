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
  setProductPricing,
  type VariantPack,
} from "@/lib/admin/products";
import { requirePrisma } from "@/lib/db";
import { type FormState } from "@/lib/form";
import { sendEmail, wholesaleDecisionEmail } from "@/lib/mail";
import { formatUnitSize } from "@/lib/units";
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

/**
 * Per-variant packs from the form: sizeAmount__<sku> + sizeUnit__<sku> combine
 * into the size label, and case__<sku> is the units per case.
 */
function collectPacks(fd: FormData): Record<string, VariantPack> {
  const amounts: Record<string, string> = {};
  const units: Record<string, string> = {};
  const cases: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("sizeAmount__")) amounts[key.slice("sizeAmount__".length)] = value;
    else if (key.startsWith("sizeUnit__")) units[key.slice("sizeUnit__".length)] = value;
    else if (key.startsWith("case__")) cases[key.slice("case__".length)] = value;
  }

  const skus = new Set([...Object.keys(amounts), ...Object.keys(units), ...Object.keys(cases)]);
  const packs: Record<string, VariantPack> = {};
  for (const sku of skus) {
    const pack: VariantPack = {};
    if (sku in amounts || sku in units) {
      pack.size = formatUnitSize(amounts[sku], units[sku]);
    }
    if (sku in cases) {
      const n = parseInt((cases[sku] ?? "").trim(), 10);
      pack.unitsPerCase = Number.isFinite(n) && n > 0 ? n : null;
    }
    packs[sku] = pack;
  }
  return packs;
}

export async function saveProduct(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const slug = str(fd, "slug");
  if (!slug) return { status: "error", message: "Missing product." };

  const images = await collectImagesFromForm(fd);

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
        isFragile: fd.get("fragile") === "on",
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

/** Toggle a single product's visibility. `active` is the desired new state. */
export async function toggleActive(fd: FormData): Promise<void> {
  const user = await requireUser();
  const slug = str(fd, "slug");
  const active = fd.get("active") === "true";
  if (slug) await setActive([slug], active, user.id);
  revalidatePath("/admin/products");
  revalidatePath("/shop");
}

function dollarsToCents(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Save cost + price for one product from the pricing tool. */
export async function setPricing(fd: FormData): Promise<void> {
  const user = await requireUser();
  const slug = str(fd, "slug");
  const sku = str(fd, "sku");
  if (!slug) return;
  const priceCents = dollarsToCents(str(fd, "price"));
  const costCents = dollarsToCents(str(fd, "cost"));
  await setProductPricing(slug, sku, priceCents, costCents, user.id);
  revalidatePath("/admin/pricing");
  revalidatePath(`/shop/${slug}`);
  revalidatePath("/shop");
}

/** Mark a stock-notification request handled (customer has been emailed). */
export async function markNotified(fd: FormData): Promise<void> {
  await requireUser();
  const id = str(fd, "id");
  if (id) {
    const prisma = requirePrisma();
    await prisma.stockNotification.update({ where: { id }, data: { notified: true } });
  }
  revalidatePath("/admin/notifications");
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

/**
 * Approve or decline a wholesale application (Section E). Server-enforced admin.
 * Approving sets the application APPROVED, flips any linked customer to the
 * WHOLESALE role, and emails the applicant. Declining records a note and emails.
 */
export async function reviewApplication(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const decision = str(fd, "decision"); // "approve" | "decline"
  const note = optStr(fd, "note");
  if (!id || (decision !== "approve" && decision !== "decline")) return;

  const prisma = requirePrisma();
  const app = await prisma.wholesaleApplication.findUnique({ where: { id } });
  if (!app) return;

  const approved = decision === "approve";
  await prisma.wholesaleApplication.update({
    where: { id },
    data: {
      status: approved ? "APPROVED" : "REJECTED",
      decisionNote: note,
      reviewedAt: new Date(),
      reviewedBy: admin.email,
    },
  });

  // Flip the linked customer's role on approval.
  if (approved && app.customerId) {
    try {
      await prisma.customer.update({
        where: { id: app.customerId },
        data: { role: "WHOLESALE" },
      });
    } catch {
      /* customer may have been deleted; the application stays approved */
    }
  }

  // Email the applicant (best-effort; logs if mail isn't configured).
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://lavagueimport.com";
  const mail = wholesaleDecisionEmail({
    approved,
    businessName: app.businessName,
    note,
    loginUrl: `${base}/login`,
  });
  const result = await sendEmail({ to: app.email, subject: mail.subject, html: mail.html, text: mail.text });
  if (!result.ok) {
    console.warn(`[application] decision email not sent (${result.reason}) to ${app.email}`);
  }

  revalidatePath("/admin/wholesale");
  revalidatePath("/account");
}
