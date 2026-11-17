// Imports wholesale customers from a CSV into the Customer table as role WHOLESALE.
// CSV columns: Customer Name, Contact, Phone, Email, Address.
// Idempotent: upserts on email. No secret in this file — SUPABASE_URL from env.
//
// Usage:
//   SUPABASE_URL="postgresql://lavague_app:***@db.<ref>.supabase.co:5432/postgres" \
//   node scripts/import-wholesale-customers.mjs "C:/path/to/customers.csv"
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

// --- tiny RFC-4180-ish CSV parser (handles quotes, commas, newlines) ---
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function cleanAddress(raw) {
  let a = (raw || "").trim();
  a = a.replace(/^\(UC\)\s*/i, "").trim(); // "(UC)" = unconfirmed marker
  if (!a || /^not found$/i.test(a)) return null;
  return a;
}
const nz = (v) => { const s = (v || "").trim(); return s === "" ? null : s; };

const file = process.argv[2];
if (!file) throw new Error("Pass the CSV path");
const url = process.env.SUPABASE_URL;
if (!url) throw new Error("Set SUPABASE_URL");

const rows = parseCsv(readFileSync(file, "utf8"));
const header = rows.shift().map((h) => h.trim().toLowerCase());
const col = (name) => header.indexOf(name);
const iName = col("customer name"), iContact = col("contact"),
  iPhone = col("phone"), iEmail = col("email"), iAddr = col("address");

const u = new URL(url);
const c = new pg.Client({
  host: u.hostname, port: Number(u.port || 5432),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

let inserted = 0, updated = 0, skipped = 0;
const seen = new Set();
for (const r of rows) {
  const email = (r[iEmail] || "").trim().toLowerCase();
  if (!email || seen.has(email)) { skipped++; continue; }
  seen.add(email);
  const businessName = nz(r[iName]);
  const name = nz(r[iContact]);
  const phone = nz(r[iPhone]);
  const address = cleanAddress(r[iAddr]);
  const id = "cust_" + randomBytes(9).toString("hex");
  const res = await c.query(
    `INSERT INTO "Customer" (id, email, name, role, "businessName", phone, address, "updatedAt")
     VALUES ($1,$2,$3,'WHOLESALE',$4,$5,$6, now())
     ON CONFLICT (email) DO UPDATE SET
       role='WHOLESALE',
       name=COALESCE(EXCLUDED.name, "Customer".name),
       "businessName"=COALESCE(EXCLUDED."businessName", "Customer"."businessName"),
       phone=COALESCE(EXCLUDED.phone, "Customer".phone),
       address=COALESCE(EXCLUDED.address, "Customer".address),
       "updatedAt"=now()
     RETURNING (xmax = 0) AS inserted`,
    [id, email, name, businessName, phone, address],
  );
  if (res.rows[0].inserted) inserted++; else updated++;
}

const { rows: counts } = await c.query(
  `SELECT count(*) FILTER (WHERE role='WHOLESALE')::int AS wholesale,
          count(*) FILTER (WHERE role='CUSTOMER')::int AS retail FROM "Customer"`,
);
console.log(`Imported wholesale customers: ${inserted} new, ${updated} updated, ${skipped} skipped.`);
console.log(`Customer table now: ${counts[0].wholesale} wholesale, ${counts[0].retail} retail.`);
await c.end();
