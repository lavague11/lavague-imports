// Compare every imported app line's qty + unit price against the original xlsx
// export (import_lines.json) — per invoice, matched by item code. Lists any
// difference. (Expected: everything matches except invoices I deliberately
// corrected — HalalCo I261007669, Safa I261009672.)
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const SP = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/a60ff56fc7cdb416/f28188a3-78be-4bad-a37d-44a3a36c3290/scratchpad";
const fileLines = JSON.parse(readFileSync(`${SP}/import_lines.json`, "utf8"));
const cents = (v) => Math.round((Number(v) || 0) * 100);

// file: externalNumber -> multiset map key(itemCode|qty|unit) -> count
const fileByInv = new Map();
for (const l of fileLines) {
  if (!fileByInv.has(l.externalNumber)) fileByInv.set(l.externalNumber, new Map());
  const k = `${(l.itemCode ?? "").trim()}|${Math.round(Number(l.qty) || 0)}|${cents(l.unitUsd)}`;
  const m = fileByInv.get(l.externalNumber);
  m.set(k, (m.get(k) || 0) + 1);
}

const u = new URL(process.env.SUPABASE_URL || process.env.DATABASE_URL);
const c = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } });
await c.connect();
const rows = (await c.query(`SELECT i."externalNumber" ext, l."itemCode" ic, l.quantity q, l."unitPriceCents" up, l.description FROM "CustomerInvoiceLine" l JOIN "CustomerInvoice" i ON i.id=l."invoiceId" WHERE i.source='invoice_asap'`)).rows;
await c.end();

const appByInv = new Map();
const appDesc = new Map(); // key -> sample description
for (const r of rows) {
  if (!appByInv.has(r.ext)) appByInv.set(r.ext, new Map());
  const k = `${(r.ic ?? "").trim()}|${r.q}|${r.up}`;
  const m = appByInv.get(r.ext);
  m.set(k, (m.get(k) || 0) + 1);
  appDesc.set(`${r.ext}|${k}`, r.description);
}

const diffs = [];
const allInv = new Set([...fileByInv.keys(), ...appByInv.keys()]);
for (const inv of allInv) {
  const fm = fileByInv.get(inv) || new Map();
  const am = appByInv.get(inv) || new Map();
  const keys = new Set([...fm.keys(), ...am.keys()]);
  const invDiffs = [];
  for (const k of keys) {
    const fc = fm.get(k) || 0, ac = am.get(k) || 0;
    if (fc !== ac) invDiffs.push({ k, file: fc, app: ac, desc: appDesc.get(`${inv}|${k}`) || "" });
  }
  if (invDiffs.length) diffs.push({ inv, invDiffs });
}

console.log(`Invoices with any line diff: ${diffs.length}`);
for (const d of diffs) {
  console.log(`\n${d.inv}:`);
  for (const x of d.invDiffs) {
    const [ic, q, up] = x.k.split("|");
    console.log(`   itemCode=${ic} qty=${q} unit=$${(up/100).toFixed(2)}  file_count=${x.file} app_count=${x.app}  ${x.desc}`);
  }
}
