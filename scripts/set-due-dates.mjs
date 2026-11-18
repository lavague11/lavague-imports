// Set imported invoices' due dates from Invoice ASAP's "Due" column (ia_full.csv).
// Falls back to issueDate when IA has no due date.
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const csv = readFileSync("C:/Users/La Vague/Downloads/ia_full.csv", "utf8").replace(/^\uFEFF/, "");
const due = new Map();
for (const line of csv.split("\n").slice(1)) {
  const f = line.split("\t"); if (!/^I\d/.test(f[0] || "")) continue;
  const d = (f[5] || "").trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) {
    const [m, da, y] = d.split("/");
    due.set(f[0].trim(), `${y}-${m.padStart(2,"0")}-${da.padStart(2,"0")}`);
  }
}

const u = new URL(process.env.SUPABASE_URL || process.env.DATABASE_URL);
const c = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } });
await c.connect();
const inv = (await c.query(`SELECT id, "externalNumber" ext, "issueDate" FROM "CustomerInvoice" WHERE source='invoice_asap'`)).rows;
let set = 0, fellback = 0;
for (const r of inv) {
  let d = due.get(r.ext);
  if (!d) { d = new Date(r.issueDate).toISOString().slice(0,10); fellback++; }
  await c.query(`UPDATE "CustomerInvoice" SET "dueDate"=$1::timestamp, "updatedAt"=now() WHERE id=$2`, [`${d}T12:00:00Z`, r.id]);
  set++;
}
// report aging on open invoices
const aging = (await c.query(`
  SELECT CASE WHEN "dueDate" IS NULL THEN 'no due'
    WHEN now()::date - "dueDate"::date <= 0 THEN 'current'
    WHEN now()::date - "dueDate"::date <= 30 THEN '1-30'
    WHEN now()::date - "dueDate"::date <= 60 THEN '31-60'
    ELSE '61+' END bucket,
    count(*) n, round(sum("totalCents"-"paidCents")/100.0,2) amt
  FROM "CustomerInvoice" WHERE source='invoice_asap' AND "totalCents">"paidCents"
  GROUP BY 1 ORDER BY 1`)).rows;
await c.end();
console.log(JSON.stringify({ invoicesUpdated: set, fellBackToIssueDate: fellback, open_aging: aging }, null, 1));
