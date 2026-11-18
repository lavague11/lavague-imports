// Item 7: match Invoice ASAP open/past-due invoices against the app's open ones.
// Produces: (a) open both, same balance; (b) open on one side only; (c) open both,
// different balance. Read-only — reports, changes nothing.
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const csv = readFileSync("C:/Users/La Vague/Downloads/ia_full.csv", "utf8").replace(/^\uFEFF/, "");
const cents = (s) => Math.round(parseFloat(String(s).replace(/[^0-9.-]/g, "")) * 100) || 0;
const daysLate = (due) => { const m = (due||"").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return null; const d = new Date(+m[3], +m[1]-1, +m[2]); return Math.round((Date.now()-d)/864e5); };

// IA open = balance > 0 (unpaid / past due). Negative balance = overpaid, not "open".
const iaOpen = new Map();
for (const line of csv.split("\n").slice(1)) {
  const f = line.split("\t"); if (!/^I\d/.test(f[0]||"")) continue;
  const bal = cents(f[4]);
  if (bal > 0) iaOpen.set(f[0].trim(), { customer: f[1], total: cents(f[3]), bal, due: f[5], late: daysLate(f[5]) });
}

const u = new URL(process.env.SUPABASE_URL || process.env.DATABASE_URL);
const c = new pg.Client({ host: u.hostname, port: Number(u.port||5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } });
await c.connect();
const rows = (await c.query(`SELECT i."externalNumber" ext, coalesce(c."businessName",c.name,'-') cust, i."totalCents" t, i."paidCents" p FROM "CustomerInvoice" i LEFT JOIN "Customer" c ON c.id=i."customerId" WHERE i.source='invoice_asap' AND i."totalCents">i."paidCents"`)).rows;
await c.end();
const appOpen = new Map(rows.map(r => [r.ext, { customer: r.cust, total: r.t, bal: r.t - r.p }]));

const money = (c) => '$' + (c/100).toFixed(2);
const both_same = [], only_ia = [], only_app = [], both_diff = [];
const keys = new Set([...iaOpen.keys(), ...appOpen.keys()]);
for (const k of keys) {
  const ia = iaOpen.get(k), app = appOpen.get(k);
  if (ia && app) { if (ia.bal === app.bal) both_same.push(`${k} ${app.customer} ${money(app.bal)}`); else both_diff.push(`${k} ${app.customer}: ia=${money(ia.bal)} app=${money(app.bal)} (diff ${money(app.bal-ia.bal)})`); }
  else if (ia && !app) only_ia.push(`${k} ${ia.customer} ${money(ia.bal)} (${ia.late}d late)`);
  else only_app.push(`${k} ${app.customer} ${money(app.bal)}`);
}
const sum = (m) => [...m.values()].reduce((s,v)=>s+v.bal,0);
console.log(JSON.stringify({
  ia_open_count: iaOpen.size, ia_open_total: money(sum(iaOpen)),
  app_open_count: appOpen.size, app_open_total: money(sum(appOpen)),
  a_both_same: both_same,
  b_only_in_IA: only_ia, b_only_in_APP: only_app,
  c_both_different: both_diff,
}, null, 1));
