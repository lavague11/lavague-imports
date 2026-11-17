// Imports wholesale CONTACTS from a CSV into the Customer table as role WHOLESALE.
// Robust successor to import-wholesale-customers.mjs:
//   - Adds EVERY business (dedupes by name), never silently drops no-email rows.
//   - Matches existing rows by email first, then by business name, so re-running
//     and the earlier 30-row import don't create duplicates.
//   - email is required+unique in the schema (it's also the login key), so rows
//     with no email, or an email already used by another business, get a clearly
//     fake "<slug>@contacts.invalid" placeholder + a note saying why.
//   - Strips the "(UC)" unconfirmed marker from name/address into a note.
// Dry run by default; pass --apply to write. SUPABASE_URL from env.
//
//   SUPABASE_URL="postgresql://lavague_app:***@db.<ref>.supabase.co:5432/postgres" \
//   node scripts/import-wholesale-contacts.mjs "C:/path/customers.csv" [--apply]
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const nz = (v) => { const s = (v || "").trim(); return s === "" ? null : s; };
const stripUC = (v) => (v || "").replace(/^\(UC\)\s*/i, "").trim();
function cleanAddress(raw) {
  const a = stripUC(raw);
  if (!a || /^not found$/i.test(a)) return null;
  return a;
}
const slugify = (s) => (s || "contact").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "contact";

const file = process.argv[2];
if (!file) throw new Error("Pass the CSV path");
const APPLY = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL;
if (!url) throw new Error("Set SUPABASE_URL");

const rows = parseCsv(readFileSync(file, "utf8"));
const header = rows.shift().map((h) => h.trim().toLowerCase());
const col = (n) => header.indexOf(n);
const iName = col("customer name"), iContact = col("contact"), iPhone = col("phone"), iEmail = col("email"), iAddr = col("address");

const u = new URL(url);
const c = new pg.Client({
  host: u.hostname, port: Number(u.port || 5432),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, "") || "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();

// Preload existing customers for matching + email-collision checks.
const existing = (await c.query(`SELECT id, lower(email) AS email, lower("businessName") AS bn FROM "Customer"`)).rows;
const idByEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email, e.id]));
const idByName = new Map(existing.filter((e) => e.bn).map((e) => [e.bn, e.id]));
const usedEmails = new Set(existing.map((e) => e.email).filter(Boolean));

let inserted = 0, updated = 0;
const flags = [];

for (const r of rows) {
  const businessName = stripUC(r[iName]);
  if (!businessName) continue;
  const bnKey = businessName.toLowerCase();
  const contact = nz(r[iContact]);
  const phone = nz(r[iPhone]);
  const address = cleanAddress(r[iAddr]);
  const realEmail = (r[iEmail] || "").trim().toLowerCase() || null;
  const unconfirmed = /^\(UC\)/i.test((r[iName] || "").trim());

  // Match an existing row by BUSINESS NAME only. Email is NOT used for matching:
  // several distinct businesses in this list share one email (same owner), so an
  // email match would collapse them onto one record. (Verified: the already-
  // imported rows' names match this CSV's names exactly, so name-match catches them.)
  const matchId = idByName.get(bnKey) || null;

  const noteParts = [];
  if (unconfirmed) noteParts.push("Unconfirmed contact (UC)");

  if (matchId) {
    // Update in place; never touch the email (avoids unique collisions).
    const note = noteParts.join("; ") || null;
    if (APPLY) {
      await c.query(
        `UPDATE "Customer" SET role='WHOLESALE',
           name=COALESCE($2, name),
           "businessName"=COALESCE($3, "businessName"),
           phone=COALESCE($4, phone),
           address=COALESCE($5, address),
           notes=COALESCE(notes, $6),
           "updatedAt"=now()
         WHERE id=$1`,
        [matchId, contact, businessName, phone, address, note],
      );
    }
    updated++;
    idByName.set(bnKey, matchId);
    continue;
  }

  // New record. Decide the email: real if free, else a clearly-fake placeholder.
  let email = realEmail;
  if (!email) { email = `${slugify(businessName)}@contacts.invalid`; noteParts.push("No email on file"); }
  else if (usedEmails.has(email)) { noteParts.push(`Email ${email} already used by another contact`); email = `${slugify(businessName)}@contacts.invalid`; }
  // Guard against placeholder collisions too.
  let finalEmail = email, n = 2;
  while (usedEmails.has(finalEmail)) finalEmail = `${slugify(businessName)}-${n++}@contacts.invalid`;
  usedEmails.add(finalEmail);

  if (finalEmail.endsWith("@contacts.invalid")) flags.push(`${businessName} -> ${finalEmail} (${noteParts[noteParts.length - 1]})`);

  const id = "cust_" + randomBytes(9).toString("hex");
  const note = noteParts.join("; ") || null;
  if (APPLY) {
    await c.query(
      `INSERT INTO "Customer" (id, email, name, role, "businessName", phone, address, notes, "updatedAt")
       VALUES ($1,$2,$3,'WHOLESALE',$4,$5,$6,$7, now())`,
      [id, finalEmail, contact, businessName, phone, address, note],
    );
  }
  inserted++;
  idByEmail.set(finalEmail, id);
  idByName.set(bnKey, id);
}

const counts = (await c.query(
  `SELECT count(*) FILTER (WHERE role='WHOLESALE')::int AS w, count(*) FILTER (WHERE role='CUSTOMER')::int AS r FROM "Customer"`,
)).rows[0];

console.log(`${APPLY ? "APPLIED" : "DRY RUN"} — ${rows.length} CSV rows: ${inserted} new, ${updated} updated.`);
if (flags.length) {
  console.log(`\nPlaceholder emails assigned (${flags.length}):`);
  for (const f of flags) console.log("  - " + f);
}
console.log(`\nCustomer table ${APPLY ? "now" : "currently"}: ${counts.w} wholesale, ${counts.r} retail.`);
await c.end();
