// Record payments from the Invoice ASAP PaymentDetail CSV onto imported invoices.
// Matches by original invoice number; dedupes on (invoice, amount, date, ref);
// updates paidCents + status; appends the Invoice URL to the invoice notes;
// reconciles the app balance against the CSV "Balance" and flags mismatches.
// Usage: SUPABASE_URL=... node scripts/record-payments-csv.mjs <csv> [--dry-run]
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
const DRY = process.argv.includes("--dry-run");
const raw = readFileSync(file, "utf8");

// --- CSV parse (handles quoted fields) ---
function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const rows = parseCsv(raw);
const header = rows[0];
const col = (name) => header.indexOf(name);
const C = {
  date: col("Payment Date"), inv: col("Invoice Number"), total: col("Total"),
  amount: col("Payment Amount"), balance: col("Balance"), txn: col("Transaction #"),
  type: col("Payment Type"), url: col("Invoice URL"),
};
const dollarsToCents = (s) => Math.round(parseFloat(String(s).replace(/[^0-9.-]/g, "")) * 100) || 0;
const toDate = (s) => { const [m, d, y] = String(s).split("/"); return new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}T12:00:00Z`); };
const methodOf = (t) => ({ check: "CHECK", cash: "CASH", "bank draft": "OTHER", ach: "ACH", wire: "WIRE", card: "CARD" }[String(t).toLowerCase().trim()] || "OTHER");

const payments = [];
for (const r of rows.slice(1)) {
  const inv = (r[C.inv] || "").trim();
  if (!inv || /^totals/i.test(r[0] || "")) continue;
  payments.push({
    inv, date: toDate(r[C.date]), amountCents: dollarsToCents(r[C.amount]),
    csvTotalCents: dollarsToCents(r[C.total]), csvBalanceCents: dollarsToCents(r[C.balance]),
    ref: (r[C.txn] || "").trim(), type: (r[C.type] || "").trim(), method: methodOf(r[C.type]),
    url: (r[C.url] || "").trim(),
  });
}

const u = new URL(process.env.SUPABASE_URL || process.env.DATABASE_URL);
const client = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } });
await client.connect();
const invRows = (await client.query(`SELECT id, number, "externalNumber" ext, "totalCents", notes FROM "CustomerInvoice" WHERE "externalNumber" IS NOT NULL`)).rows;
const byExt = new Map(invRows.map((r) => [r.ext, r]));
const existingPays = (await client.query(`SELECT "invoiceId", "amountCents", "receivedAt"::date d, COALESCE(reference,'') ref FROM "CustomerPayment"`)).rows;
const payKey = (iid, amt, date, ref) => `${iid}|${amt}|${new Date(date).toISOString().slice(0,10)}|${ref}`;
const existingKeys = new Set(existingPays.map((p) => payKey(p.invoiceId, p.amountCents, p.d, p.ref)));

const log = []; const flags = [];
let recorded = 0, skippedDup = 0, missing = 0;
const touchedInvoices = new Map(); // id -> {ext, total, csvBalance}

// sort most-recent payment first
payments.sort((a, b) => b.date - a.date);

for (const p of payments) {
  const invoice = byExt.get(p.inv);
  if (!invoice) { missing++; flags.push(`MISSING invoice ${p.inv} (payment $${p.amountCents/100})`); continue; }
  const key = payKey(invoice.id, p.amountCents, p.date, p.ref);
  if (existingKeys.has(key)) { skippedDup++; continue; }
  existingKeys.add(key);
  if (!DRY) {
    await client.query(
      `INSERT INTO "CustomerPayment" (id, "invoiceId", "amountCents", method, reference, "receivedAt", "recordedBy", note, "createdAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,'Waleed Elzoghabi (imported)',$6,now())`,
      [invoice.id, p.amountCents, p.method, p.ref || null, p.date, p.type && p.method === "OTHER" ? p.type : null],
    );
  }
  recorded++;
  touchedInvoices.set(invoice.id, { ext: p.inv, total: invoice.totalCents, csvBalance: p.csvBalanceCents, notes: invoice.notes, url: p.url });
}

// Recompute paidCents + status + notes per touched invoice, then reconcile.
for (const [id, info] of touchedInvoices) {
  const paid = (await client.query(`SELECT COALESCE(sum("amountCents"),0) s FROM "CustomerPayment" WHERE "invoiceId"=$1`, [id])).rows[0].s;
  const paidCents = Number(paid);
  const status = paidCents >= info.total ? "PAID" : paidCents > 0 ? "PARTIAL" : "SENT";
  const appBalance = info.total - paidCents;
  let notes = info.notes || "";
  if (info.url && !notes.includes(info.url)) notes = `${notes}\nOriginal: ${info.url}`.trim();
  if (!DRY) await client.query(`UPDATE "CustomerInvoice" SET "paidCents"=$1, status=$2, notes=$3, "updatedAt"=now() WHERE id=$4`, [paidCents, status, notes, id]);
  const match = appBalance === info.csvBalance;
  if (!match) flags.push(`BALANCE ${info.ext}: app=${(appBalance/100).toFixed(2)} csv=${(info.csvBalance/100).toFixed(2)}`);
  log.push({ ext: info.ext, total: (info.total/100).toFixed(2), csvBalance: (info.csvBalance/100).toFixed(2), appBalance: (appBalance/100).toFixed(2), paid: (paidCents/100).toFixed(2), status, ok: match });
}

await client.end();
console.log(JSON.stringify({
  dryRun: DRY, csvPayments: payments.length, recorded, skippedDuplicates: skippedDup,
  missingInvoices: missing, invoicesTouched: touchedInvoices.size,
  balanceMismatches: flags.filter((f)=>f.startsWith("BALANCE")).length,
  flags,
}, null, 1));
// CSV log
console.log("\n--- LOG (invoice, total, csvBalance, appBalance, paid, status, ok) ---");
for (const l of log.sort((a,b)=>a.ext<b.ext?1:-1)) console.log(`${l.ext}, ${l.total}, ${l.csvBalance}, ${l.appBalance}, ${l.paid}, ${l.status}, ${l.ok}`);
