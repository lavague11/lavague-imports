// Set a DEFAULT storefront login password for every customer that has none yet.
// Non-destructive: only rows where passwordHash IS NULL are touched, so no
// customer's self-chosen password is overwritten. Records the affected ids to a
// JSON backup so the change can be reverted (set those back to NULL).
//
// Usage: node scripts/set-default-customer-passwords.mjs [password]
import "dotenv/config";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import pg from "pg";

const scrypt = promisify(scryptCb);
const PASSWORD = process.argv[2] || "Password1";

// Matches src/lib/auth.ts hashPassword exactly: scrypt, 16-byte salt, 64-byte key.
async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

const u = new URL(process.env.SUPABASE_URL || process.env.DATABASE_URL);
const c = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } });
await c.connect();

const targets = (await c.query(`SELECT id, email, role FROM "Customer" WHERE "passwordHash" IS NULL ORDER BY role, email`)).rows;

// Backup the affected ids first (revert = set passwordHash NULL where id in list).
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `scripts/migrations/backup_default_passwords_${stamp}.json`;
writeFileSync(backupPath, JSON.stringify({ when: new Date().toISOString(), password: PASSWORD, affectedIds: targets.map((t) => t.id) }, null, 1));

let done = 0;
const byRole = {};
for (const t of targets) {
  await c.query(`UPDATE "Customer" SET "passwordHash"=$1, "updatedAt"=now() WHERE id=$2 AND "passwordHash" IS NULL`, [await hashPassword(PASSWORD), t.id]);
  byRole[t.role] = (byRole[t.role] || 0) + 1;
  done++;
}

const stillNull = (await c.query(`SELECT count(*) n FROM "Customer" WHERE "passwordHash" IS NULL`)).rows[0].n;
const withPw = (await c.query(`SELECT count(*) n FROM "Customer" WHERE "passwordHash" IS NOT NULL`)).rows[0].n;
await c.end();

console.log(JSON.stringify({ password: PASSWORD, set: done, byRole, customersWithPasswordNow: withPw, stillWithoutPassword: stillNull, backup: backupPath }, null, 1));
