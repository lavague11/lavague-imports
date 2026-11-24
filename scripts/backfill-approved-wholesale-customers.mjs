// One-off backfill: APPROVED wholesale applications that were submitted without
// an account never got a Customer row, so the business is missing from the
// wholesale customer base. This creates a WHOLESALE customer for each such
// application (find-or-create by email) and links it back. Idempotent — it
// skips applications that are already linked or already have a customer.
//
// Mirrors the fixed reviewApplication() approval path. Uses the app's own
// DATABASE_URL from .env (production). Run: node scripts/backfill-approved-wholesale-customers.mjs

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

function composeAddress({ street, unit, city, state, zip }) {
  if (street || city || state || zip) {
    const cityLine = [city, [state, zip].filter(Boolean).join(" ").trim()].filter(Boolean).join(", ");
    return [street, unit, cityLine].filter(Boolean).join(", ") || null;
  }
  return null;
}

function titleCaseName(input) {
  const cleaned = String(input).replace(/\s+/g, " ").trim();
  return cleaned.replace(/(^|[\s\-.])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const adapter = new PrismaPg(
  { connectionString },
  process.env.DATABASE_SSL_NO_VERIFY === "true" ? { ssl: { rejectUnauthorized: false } } : undefined,
);
const prisma = new PrismaClient({ adapter });

async function main() {
  const apps = await prisma.wholesaleApplication.findMany({
    where: { status: "APPROVED", customerId: null },
    orderBy: { reviewedAt: "asc" },
  });

  console.log(`Found ${apps.length} approved application(s) with no linked customer.`);
  let created = 0;
  let linked = 0;

  for (const app of apps) {
    const addr = {
      street: app.addressLine1 || null,
      unit: app.addressLine2 || null,
      city: app.city || null,
      state: app.state || null,
      zip: app.postalCode || null,
    };
    const existing = await prisma.customer.findUnique({ where: { email: app.email }, select: { id: true, role: true } });

    const customer = await prisma.customer.upsert({
      where: { email: app.email },
      update: { role: "WHOLESALE" },
      create: {
        email: app.email,
        role: "WHOLESALE",
        name: app.contactName ? titleCaseName(app.contactName) : null,
        businessName: app.businessName ? titleCaseName(app.businessName) : null,
        phone: app.phone || null,
        ...addr,
        address: composeAddress(addr),
      },
    });
    await prisma.wholesaleApplication.update({ where: { id: app.id }, data: { customerId: customer.id } });

    if (existing) {
      linked++;
      console.log(`  linked existing customer → ${app.businessName} <${app.email}> (promoted to WHOLESALE)`);
    } else {
      created++;
      console.log(`  created WHOLESALE customer → ${app.businessName} <${app.email}>`);
    }
  }

  console.log(`\nDone. Created ${created}, linked/promoted ${linked}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
