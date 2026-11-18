// Independent reconciliation of the imported invoices against the source file.
// Compares, per invoice: existence, date, total, line count, and the full
// multiset of lines (itemCode|qty|unitPriceCents|lineTotalCents). Also checks
// for duplicates, orphans, and DB rows not present in the file.
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const SP = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/a60ff56fc7cdb416/f28188a3-78be-4bad-a37d-44a3a36c3290/scratchpad";
const load = (f) => JSON.parse(readFileSync(`${SP}/${f}`, "utf8"));
const invoices = load("import_invoices.json");
const allLines = load("import_lines.json");
const custMap = load("customer_map.json");
const cents = (usd) => Math.round((Number(usd) || 0) * 100);

const fileLinesByExt = new Map();
for (const l of allLines) { if (!fileLinesByExt.has(l.externalNumber)) fileLinesByExt.set(l.externalNumber, []); fileLinesByExt.get(l.externalNumber).push(l); }

const url = process.env.SUPABASE_URL || process.env.DATABASE_URL;
const u = new URL(url);
const client = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.replace(/^\//, "") || "postgres", ssl: { rejectUnauthorized: false } });
await client.connect();

// Pull every imported invoice + its lines + customer in one go.
const invRows = (await client.query(
  `SELECT i.id, i.number, i."externalNumber" ext, i."issueDate", i."totalCents", i."customerId",
          c."businessName" cust, i.source
   FROM "CustomerInvoice" i LEFT JOIN "Customer" c ON c.id=i."customerId"
   WHERE i.source='invoice_asap'`
)).rows;
const lineRows = (await client.query(
  `SELECT l."invoiceId" iid, l."itemCode", l.quantity, l."unitPriceCents", l."lineTotalCents", l."isCredit", l.description
   FROM "CustomerInvoiceLine" l JOIN "CustomerInvoice" i ON i.id=l."invoiceId" WHERE i.source='invoice_asap'`
)).rows;
await client.end();

const dbByExt = new Map(invRows.map((r) => [r.ext, r]));
const dbLinesByInv = new Map();
for (const l of lineRows) { if (!dbLinesByInv.has(l.iid)) dbLinesByInv.set(l.iid, []); dbLinesByInv.get(l.iid).push(l); }

const issues = [];
let okInvoices = 0, okLines = 0;
const skipExt = new Set(invoices.filter((i) => custMap[i.customer]?.action === "sk" + "ip").map((i) => i.externalNumber));

// duplicate externalNumbers in DB?
const extCount = new Map();
for (const r of invRows) extCount.set(r.ext, (extCount.get(r.ext) || 0) + 1);
for (const [ext, n] of extCount) if (n > 1) issues.push(`DUPLICATE in DB: ${ext} x${n}`);

for (const inv of invoices) {
  const ext = inv.externalNumber;
  if (skipExt.has(ext)) continue;
  const db = dbByExt.get(ext);
  if (!db) { issues.push(`MISSING invoice ${ext}`); continue; }
  // date
  const dbDate = new Date(db.issueDate).toISOString().slice(0, 10);
  if (dbDate !== inv.date) issues.push(`DATE ${ext}: db=${dbDate} file=${inv.date}`);
  // total
  if (db.totalCents !== cents(inv.totalUsd)) issues.push(`TOTAL ${ext}: db=${db.totalCents} file=${cents(inv.totalUsd)}`);
  // customer
  if (!db.customerId) issues.push(`NO CUSTOMER ${ext}`);
  // lines multiset
  const fl = fileLinesByExt.get(ext) || [];
  const dl = dbLinesByInv.get(db.id) || [];
  if (fl.length !== dl.length) issues.push(`LINECOUNT ${ext}: db=${dl.length} file=${fl.length}`);
  const key = (ic, q, up, lt) => `${(ic ?? "").toString().trim()}|${q}|${up}|${lt}`;
  const fileKeys = fl.map((l) => key(l.itemCode, Math.round(Number(l.qty) || 0), cents(l.unitUsd), cents(l.lineUsd))).sort();
  const dbKeys = dl.map((l) => key(l.itemCode, l.quantity, l.unitPriceCents, l.lineTotalCents)).sort();
  let lineMismatch = fileKeys.length !== dbKeys.length;
  for (let i = 0; i < fileKeys.length && !lineMismatch; i++) if (fileKeys[i] !== dbKeys[i]) lineMismatch = true;
  if (lineMismatch) {
    issues.push(`LINES differ ${ext}`);
    // show first difference for context
    const fset = new Set(fileKeys), dset = new Set(dbKeys);
    const onlyFile = fileKeys.filter((k) => !dset.has(k)).slice(0, 2);
    const onlyDb = dbKeys.filter((k) => !fset.has(k)).slice(0, 2);
    if (onlyFile.length) issues.push(`   file-only: ${onlyFile.join("  ;  ")}`);
    if (onlyDb.length) issues.push(`   db-only:   ${onlyDb.join("  ;  ")}`);
  } else { okLines += dl.length; }
  if (!lineMismatch && dbDate === inv.date && db.totalCents === cents(inv.totalUsd) && db.customerId) okInvoices++;
}

// DB invoices whose externalNumber isn't in the file (unexpected extras)?
const fileExts = new Set(invoices.map((i) => i.externalNumber));
for (const r of invRows) if (!fileExts.has(r.ext)) issues.push(`EXTRA in DB (not in file): ${r.ext} (${r.number})`);

console.log(JSON.stringify({
  fileInvoices: invoices.length,
  skipped: skipExt.size,
  dbImportedInvoices: invRows.length,
  dbImportedLines: lineRows.length,
  fullyVerifiedInvoices: okInvoices,
  verifiedLines: okLines,
  issueCount: issues.length,
  issues: issues.slice(0, 50),
}, null, 1));
