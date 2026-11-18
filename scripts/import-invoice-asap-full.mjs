// Full Invoice ASAP history import: 63 customers, 547 invoices, 8,629 lines.
// - Upserts customers by email (no duplicates); resolves each invoice's customer
//   via scripts' customer_map.json (overrides + fuzzy match, verified).
// - Preserves each line's amount sign exactly as in the file (credits are the
//   already-negative rows); invoice total = the stated total.
// - Keeps the original invoice date; status SENT; idempotent on externalNumber.
// Usage: SUPABASE_URL=... node scripts/import-invoice-asap-full.mjs [--dry-run]
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const SP = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/a60ff56fc7cdb416/f28188a3-78be-4bad-a37d-44a3a36c3290/scratchpad";
const load = (f) => JSON.parse(readFileSync(`${SP}/${f}`, "utf8"));
const DRY = process.argv.includes("--dry-run");

const customersSheet = load("import_customers.json");
const invoices = load("import_invoices.json");
const allLines = load("import_lines.json");
const custMap = load("customer_map.json"); // invoiceName -> {action, customerName, email}

const linesByExt = new Map();
for (const l of allLines) {
  if (!linesByExt.has(l.externalNumber)) linesByExt.set(l.externalNumber, []);
  linesByExt.get(l.externalNumber).push(l);
}
const sheetByName = new Map(customersSheet.map((c) => [c.name, c]));
const cents = (usd) => Math.round((Number(usd) || 0) * 100);
const dateAt = (iso) => (iso ? new Date(`${iso}T12:00:00Z`) : new Date());
const slug = (s) => (s || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "customer";
const normName = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const url = process.env.SUPABASE_URL || process.env.DATABASE_URL;
const u = new URL(url);
const client = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.replace(/^\//, "") || "postgres", ssl: { rejectUnauthorized: false } });
await client.connect();

// ---- customer caches ----
const dbRows = (await client.query(`SELECT id, lower(email) AS email, "businessName", name FROM "Customer"`)).rows;
const byEmail = new Map(dbRows.map((r) => [r.email, r.id]));
const byNorm = new Map();
for (const r of dbRows) { const k = normName(r.businessName || r.name); if (k && !byNorm.has(k)) byNorm.set(k, r.id); }

let created = 0;
async function ensureCustomer({ businessName, name, email, phone, address }) {
  let em = (email || "").toLowerCase().trim();
  if (em && byEmail.has(em)) return byEmail.get(em);
  const nk = normName(businessName || name);
  if (nk && byNorm.has(nk)) return byNorm.get(nk);
  // create with a free email (given, else a placeholder)
  if (!em || byEmail.has(em)) {
    const base = slug(businessName || name);
    let cand = `${base}@contacts.invalid`, n = 2;
    while (byEmail.has(cand)) cand = `${base}-${n++}@contacts.invalid`;
    em = cand;
  }
  if (DRY) { const fake = `new_${em}`; byEmail.set(em, fake); if (nk) byNorm.set(nk, fake); created++; return fake; }
  const id = `cust_${slug(businessName || name)}_${Math.random().toString(36).slice(2, 8)}`;
  await client.query(
    `INSERT INTO "Customer" (id, email, name, "businessName", phone, role, street, "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,'WHOLESALE',$6,now(),now()) ON CONFLICT (email) DO NOTHING`,
    [id, em, name || null, businessName || null, phone || null, address || null],
  );
  const realId = (await client.query(`SELECT id FROM "Customer" WHERE email=$1`, [em])).rows[0]?.id || id;
  byEmail.set(em, realId); if (nk) byNorm.set(nk, realId); created++;
  return realId;
}

// Resolve every invoice-tab name to a customer id (or null for skip).
const nameToId = new Map();
for (const [invName, m] of Object.entries(custMap)) {
  if (m.action === "skip") { nameToId.set(invName, null); continue; }
  if (m.action === "match") {
    const c = sheetByName.get(m.customerName);
    nameToId.set(invName, await ensureCustomer({ businessName: c.name, name: c.contact, email: c.email, phone: c.phone, address: c.address }));
  } else { // create
    nameToId.set(invName, await ensureCustomer({ businessName: invName, name: null, email: null }));
  }
}

// ---- import invoices ----
const report = { dryRun: DRY, customersCreated: 0, invoicesImported: 0, invoicesSkipped: 0, linesImported: 0, unmatchedCustomer: 0, totalMismatches: [], noCustomer: [] };
let processed = 0;
for (const inv of invoices) {
  const mapEntry = custMap[inv.customer];
  if (mapEntry && mapEntry.action === "skip") { report.invoicesSkipped++; continue; }
  const customerId = nameToId.get(inv.customer) ?? null;
  if (!customerId) report.noCustomer.push(inv.externalNumber);

  const lines = linesByExt.get(inv.externalNumber) || [];
  const mapped = lines.map((l) => {
    const lt = cents(l.lineUsd);       // signed, as in the file
    const up = cents(l.unitUsd);       // signed
    const isCredit = lt < 0;
    return { lt, up, isCredit, qty: Math.round(Number(l.qty) || 0), l };
  });
  const sumLt = mapped.reduce((s, m) => s + m.lt, 0);
  const subtotalCents = mapped.reduce((s, m) => s + Math.max(0, m.lt), 0);
  const sheetTotal = cents(inv.totalUsd);
  if (sumLt !== sheetTotal) report.totalMismatches.push({ ext: inv.externalNumber, sumLines: sumLt, stated: sheetTotal });

  if (!DRY) {
    await client.query("BEGIN");
    try {
      const existing = (await client.query(`SELECT id, number FROM "CustomerInvoice" WHERE "externalNumber"=$1`, [inv.externalNumber])).rows[0];
      let id, number;
      if (existing) { id = existing.id; number = existing.number; await client.query(`DELETE FROM "CustomerInvoiceLine" WHERE "invoiceId"=$1`, [id]); }
      else {
        const next = (await client.query(`UPDATE "NumberSeries" SET value = value + 1 WHERE key='invoice' RETURNING value`)).rows[0].value;
        number = `LV-${String(next).padStart(4, "0")}`;
        id = `inv_${Buffer.from(inv.externalNumber).toString("hex").slice(0, 18)}${Date.now().toString(36)}${processed}`;
      }
      const when = dateAt(inv.date);
      const notes = `Imported from Invoice ASAP — original #${inv.externalNumber}`;
      await client.query(
        `INSERT INTO "CustomerInvoice"
          (id, number, "externalNumber", "invoiceDate", source, "customerId", status, "issueDate", "dueDate",
           "subtotalCents","discountCents","shippingCents","taxCents","totalCents","paidCents", notes, "createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,'invoice_asap',$5,'SENT',$4,NULL,$6,0,0,0,$7,0,$8,now(),now())
         ON CONFLICT (id) DO UPDATE SET "customerId"=EXCLUDED."customerId", status='SENT', "issueDate"=EXCLUDED."issueDate",
           "invoiceDate"=EXCLUDED."invoiceDate", "subtotalCents"=EXCLUDED."subtotalCents", "totalCents"=EXCLUDED."totalCents",
           notes=EXCLUDED.notes, source='invoice_asap', "updatedAt"=now()`,
        [id, number, inv.externalNumber, when, customerId, subtotalCents, sheetTotal, notes],
      );
      // multi-row line insert
      if (mapped.length) {
        const vals = [], params = [];
        mapped.forEach((m, i) => {
          const b = i * 12;
          vals.push(`(gen_random_uuid()::text,$${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})`);
          params.push(id, (m.l.originalName || m.l.cleanName || "(item)"), m.qty, m.up, m.lt, m.isCredit, m.isCredit ? "Imported credit" : null, m.l.itemCode, m.l.originalName, m.l.cleanName, m.l.sku, m.l.brand);
        });
        await client.query(
          `INSERT INTO "CustomerInvoiceLine" (id,"invoiceId",description,quantity,"unitPriceCents","lineTotalCents","isCredit","creditReason","itemCode","originalName","cleanName",sku,brand) VALUES ${vals.join(",")}`,
          params,
        );
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); console.error("FAILED", inv.externalNumber, e.message); throw e; }
  }
  report.invoicesImported++;
  report.linesImported += mapped.length;
  processed++;
}
report.customersCreated = created;
await client.end();
console.log(JSON.stringify(report, null, 1));
