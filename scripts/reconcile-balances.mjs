// Reconcile Invoice ASAP balances (ia_balances.csv) against the imported invoices.
// For each: IA paid = IA total - IA balance. Compares to the app's paidCents.
// --apply updates paidCents + status to match IA (does NOT invent payment rows,
// so invoices that already have real CSV payment records are left alone unless
// their paid total disagrees with IA, which is flagged).
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const csv = readFileSync("C:/Users/La Vague/Downloads/ia_balances.csv", "utf8").replace(/^\uFEFF/, "");
const cents = (s) => Math.round(parseFloat(String(s).replace(/[^0-9.-]/g, "")) * 100) || 0;
const ia = new Map();
for (const line of csv.split("\n").slice(1)) {
  const f = line.split("\t"); if (f.length < 4 || !/^I\d/.test(f[0])) continue;
  const total = cents(f[2]), bal = cents(f[3]);
  ia.set(f[0].trim(), { total, bal, paid: total - bal, status: (f[1] || "").trim(), attached: Number(f[4] || 0) });
}

const u = new URL(process.env.SUPABASE_URL || process.env.DATABASE_URL);
const c = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } });
await c.connect();
const inv = (await c.query(`SELECT id, "externalNumber" ext, "totalCents" t, "paidCents" p, status, (SELECT count(*) FROM "CustomerPayment" cp WHERE cp."invoiceId"=i.id) pays FROM "CustomerInvoice" i WHERE source='invoice_asap'`)).rows;

const r = { dbInvoices: inv.length, iaRows: ia.size, matchedPaid: 0, willUpdate: 0, totalMismatch: [], notInIA: [], withRealPayments_disagree: [], outstandingBeforeCents: 0, outstandingAfterCents: 0 };
let paidFull = 0, partial = 0, open = 0;
for (const row of inv) {
  const d = ia.get(row.ext);
  r.outstandingBeforeCents += row.t - row.p;
  if (!d) { r.notInIA.push(row.ext); r.outstandingAfterCents += row.t - row.p; continue; }
  if (d.total !== row.t) r.totalMismatch.push(`${row.ext}: db=${(row.t/100).toFixed(2)} ia=${(d.total/100).toFixed(2)}`);
  const newPaid = d.paid; // IA truth
  const status = newPaid >= row.t ? "PAID" : newPaid > 0 ? "PARTIAL" : "SENT";
  r.outstandingAfterCents += row.t - newPaid;
  if (status === "PAID") paidFull++; else if (status === "PARTIAL") partial++; else open++;
  if (newPaid === row.p) { r.matchedPaid++; continue; }
  // paid differs from what app has
  if (Number(row.pays) > 0) r.withRealPayments_disagree.push(`${row.ext}: app=${(row.p/100).toFixed(2)} ia=${(newPaid/100).toFixed(2)}`);
  r.willUpdate++;
  if (APPLY) await c.query(`UPDATE "CustomerInvoice" SET "paidCents"=$1, status=$2, "updatedAt"=now() WHERE id=$3`, [newPaid, status, row.id]);
}
await c.end();
r.statusAfter = { PAID: paidFull, PARTIAL: partial, SENT_open: open };
r.outstandingBefore = "$" + (r.outstandingBeforeCents/100).toLocaleString();
r.outstandingAfter = "$" + (r.outstandingAfterCents/100).toLocaleString();
r.totalMismatchCount = r.totalMismatch.length;
r.notInIACount = r.notInIA.length;
console.log(JSON.stringify({ applied: APPLY, ...r, totalMismatch: r.totalMismatch.slice(0,10), withRealPayments_disagree: r.withRealPayments_disagree.slice(0,10), notInIA: r.notInIA.slice(0,10) }, null, 1));
