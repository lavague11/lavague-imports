// Creates (or updates) the first admin user from env vars.
// Run: ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=secret ADMIN_NAME="You" npm run admin:create
import "dotenv/config";
import { randomBytes, scrypt } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

function hash(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`scrypt$${salt.toString("hex")}$${key.toString("hex")}`);
    });
  });
}

const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const password = process.env.ADMIN_PASSWORD || "";
const name = process.env.ADMIN_NAME || null;

if (!email || password.length < 8) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars).");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const passwordHash = await hash(password);
const user = await prisma.adminUser.upsert({
  where: { email },
  update: { passwordHash, name, role: "ADMIN" },
  create: { email, passwordHash, name, role: "ADMIN" },
});
console.log(`Admin ready: ${user.email} (${user.role})`);
await prisma.$disconnect();
