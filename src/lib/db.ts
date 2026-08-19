import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * The storefront is designed to render before a database exists: catalog reads
 * fall back to the seed catalog in `src/lib/catalog/data.ts` when DATABASE_URL
 * is unset. Writes (quote requests, wholesale applications) do require a
 * database and surface a clear error instead.
 */
export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient | null {
  if (!isDatabaseConfigured) return null;

  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.prisma;
}

/** Use in write paths, where falling back to static data isn't an option. */
export function requirePrisma(): PrismaClient {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error(
      "DATABASE_URL is not set. Connect a Postgres database and run `npx prisma migrate dev` to enable this feature.",
    );
  }
  return prisma;
}
