// Three-way audit: Invoice ASAP (ia_balances.csv) vs import file (import_invoices.json)
// vs live DB. Surfaces every invoice that is in one source but not another, and
// every total/balance mismatch, plus the dollar sums side by side.
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const SP = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/a60ff56fc7cdb416/f28188a3-78be-4bad-a37d-44a3a36c3290/scratchpad";
const cents = (s) => Math.round(parseFloat(String(s).replace(/[^0-9.-]/g, "")) * 100) || 0;

// IA
const iaCsv = readFileSync("C:/Users/La Vague/Downloads/ia_balances.csv", "utf8").replace(/^\uFEFF/, "");
const ia = new Map();
for (const line of iaCsv.split("\n").slice(1)) { const f = line.split("\t"); if (!/^I\d/.test(f[0] || "")) continue; ia.set(f[0].trim(), { total: cents(f[2]), bal: cents(f[3]) }); }

// import file
const fileInv = JSON.parse(readFileSync(`${SP}/import_invoices.json`, "utf8"));
const file = new Map(fileInv.map((i) => [i.externalNumber, cents(i.totalUsd)]));

// DB
const u = new URL(process.env.SUPABASE_URL || process.env.DATABASE_URL);
const c = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } });
await c.connect();
const dbRows = (await c.query(`SELECT "externalNumber" ext, "totalCents" t, "paidCents" p FROM "CustomerInvoice" WHERE source='invoice_asap'`)).rows;
await c.end();
const db = new Map(dbRows.map((r) => [r.ext, { total: r.t, paid: r.p }]));

const sum = (m, f) => [...m.values()].reduce((s, v) => s + f(v), 0);
const keys = (m) => new Set(m.keys());
const diff = (a, b) => [...a].filter((k) => !b.has(k));

const iaK = keys(ia), fileK = keys(file), dbK = keys(db);
const out = {
  counts: { ia: ia.size, file: file.size, db: db.size },
  sums: {
    ia_total: "$" + (sum(ia, (v) => v.total) / 100).toLocaleString(),
    ia_balance: "$" + (sum(ia, (v) => v.bal) / 100).toLocaleString(),
    file_total: "$" + (sum(file, (v) => v) / 100).toLocaleString(),
    db_total: "$" + (sum(db, (v) => v.total) / 100).toLocaleString(),
    db_outstanding: "$" + (sum(db, (v) => v.total - v.paid) / 100).toLocaleString(),
  },
  inIA_notInFile: diff(iaK, fileK),
  inFile_notInIA: diff(fileK, iaK),
  inIA_notInDB: diff(iaK, dbK),
  inDB_notInIA: diff(dbK, iaK),
  inFile_notInDB: diff(fileK, dbK),
  totalMismatches: [],
};
for (const k of iaK) { if (db.has(k) && ia.get(k).total !== db.get(k).total) out.totalMismatches.push(`${k}: ia=${(ia.get(k).total/100).toFixed(2)} db=${(db.get(k).total/100).toFixed(2)}`); }
for (const k of iaK) { if (file.has(k) && ia.get(k).total !== file.get(k)) out.totalMismatches.push(`${k}(vsFILE): ia=${(ia.get(k).total/100).toFixed(2)} file=${(file.get(k)/100).toFixed(2)}`); }
console.log(JSON.stringify(out, null, 1));
