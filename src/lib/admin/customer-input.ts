import type { PrismaClient } from "@/generated/prisma/client";

// Shared helpers for creating customers from admin forms / imports.

export const slugify = (s: string) =>
  (s || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "customer";

/**
 * Email is unique + required by the schema. Use the supplied one when it's free,
 * otherwise mint a clearly-fake `<slug>@contacts.invalid` placeholder the admin
 * can fix later (same convention as the bulk importer).
 */
export async function resolveUniqueEmail(
  prisma: PrismaClient,
  opts: { email?: string | null; businessName?: string | null; name?: string | null },
): Promise<string> {
  const taken = async (e: string) =>
    Boolean(await prisma.customer.findUnique({ where: { email: e }, select: { id: true } }));

  const given = (opts.email ?? "").trim().toLowerCase();
  if (given && !(await taken(given))) return given;

  const base = slugify(opts.businessName || opts.name || "customer");
  let candidate = `${base}@contacts.invalid`;
  let n = 2;
  while (await taken(candidate)) candidate = `${base}-${n++}@contacts.invalid`;
  return candidate;
}
