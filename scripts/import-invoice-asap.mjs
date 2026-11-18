// Import La Vague's Invoice ASAP history into the app DB as NEW records.
// Idempotent: upserts each invoice on externalNumber (re-running replaces that
// invoice's lines, never duplicates). Never creates products or invents SKUs.
//
// Usage (test, one invoice, forced customer id):
//   SUPABASE_URL=... node scripts/import-invoice-asap.mjs --only I261117680 --customer cust_xxx
//   add --dry-run to compute + print the report without writing.
//   --all imports every invoice (STEP 2; customer resolution required separately).
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const SP = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/a60ff56fc7cdb416/f28188a3-78be-4bad-a37d-44a3a36c3290/scratchpad";
const load = (f) => JSON.parse(readFileSync(`${SP}/${f}`, "utf8"));

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const has = (name) => args.includes(name);
const ONLY = opt("--only");
const FORCE_CUSTOMER = opt("--customer");
const DRY = has("--dry-run");
const ALL = has("--all");
if (!ONLY && !ALL) throw new Error("Pass --only <externalNumber> or --all");

const url = process.env.SUPABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set SUPABASE_URL or DATABASE_URL");
const u = new URL(url);
const client = new pg.Client({
  host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password), database: u.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
});

const cents = (usd) => Math.round((Number(usd) || 0) * 100);
const dateAt = (iso) => (iso ? new Date(`${iso}T12:00:00Z`) : new Date());

await client.connect();

// Catalog sets for the matched/unmatched report.
const variantSkus = new Set((await client.query(`SELECT lower(sku) s FROM "ProductVariant" WHERE sku IS NOT NULL`)).rows.map((r) => r.s));
const productNames = new Set((await client.query(`SELECT lower(name) n FROM "Product"`)).rows.map((r) => r.n));
const matchedProduct = (line) => {
  if (line.sku && variantSkus.has(line.sku.toLowerCase())) return "sku";
  if (!line.sku && line.cleanName && productNames.has(line.cleanName.toLowerCase())) return "name";
  return null;
};

const allInvoices = load("import_invoices.json");
const allLines = load("import_lines.json");
const linesByExt = new Map();
for (const l of allLines) {
  if (!linesByExt.has(l.externalNumber)) linesByExt.set(l.externalNumber, []);
  linesByExt.get(l.externalNumber).push(l);
}

const targets = ONLY ? allInvoices.filter((i) => i.externalNumber === ONLY) : allInvoices;
if (ONLY && targets.length === 0) throw new Error(`Invoice ${ONLY} not found in file`);

const report = [];
for (const inv of targets) {
  const lines = linesByExt.get(inv.externalNumber) || [];
  const subtotalCents = lines.filter((l) => !l.isCredit).reduce((s, l) => s + cents(l.lineUsd), 0);
  const creditsCents = lines.filter((l) => l.isCredit).reduce((s, l) => s + Math.abs(cents(l.lineUsd)), 0);
  const computedTotal = subtotalCents - creditsCents;
  const sheetTotal = cents(inv.totalUsd);

  // Resolve customer.
  let customerId = FORCE_CUSTOMER || null;
  if (!customerId && ALL) {
    // STEP 2 fuzzy resolution is handled by a separate pass; skip here.
    customerId = null;
  }

  await client.query("BEGIN");
  try {
    // Upsert invoice on externalNumber (reuse LV number + id on re-run).
    const existing = (await client.query(`SELECT id, number FROM "CustomerInvoice" WHERE "externalNumber"=$1`, [inv.externalNumber])).rows[0];
    let id, number;
    if (existing) {
      id = existing.id; number = existing.number;
      await client.query(`DELETE FROM "CustomerInvoiceLine" WHERE "invoiceId"=$1`, [id]);
    } else {
      const next = (await client.query(`UPDATE "NumberSeries" SET value = value + 1 WHERE key='invoice' RETURNING value`)).rows[0].value;
      number = `LV-${String(next).padStart(4, "0")}`;
      id = `inv_${Buffer.from(inv.externalNumber).toString("hex").slice(0, 18)}${Date.now().toString(36)}`;
    }
    const notes = `Imported from Invoice ASAP — original #${inv.externalNumber}`;
    const when = dateAt(inv.date);
    await client.query(
      `INSERT INTO "CustomerInvoice"
        (id, number, "externalNumber", "invoiceDate", source, "customerId", status,
         "issueDate", "dueDate", "subtotalCents", "discountCents", "shippingCents",
         "taxCents", "totalCents", "paidCents", notes, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,'invoice_asap',$5,'SENT',$4,NULL,$6,0,0,0,$7,0,$8,now(),now())
       ON CONFLICT (id) DO UPDATE SET
         "customerId"=EXCLUDED."customerId", status=EXCLUDED.status, "issueDate"=EXCLUDED."issueDate",
         "invoiceDate"=EXCLUDED."invoiceDate", "subtotalCents"=EXCLUDED."subtotalCents",
         "totalCents"=EXCLUDED."totalCents", notes=EXCLUDED.notes, source='invoice_asap', "updatedAt"=now()`,
      [id, number, inv.externalNumber, when, customerId, subtotalCents, sheetTotal, notes],
    );

    const lineReport = [];
    for (const l of lines) {
      const m = matchedProduct(l);
      const qty = Math.max(0, Math.round(Number(l.qty) || 0));
      const unit = cents(l.unitUsd) * (l.isCredit ? -1 : 1);
      const total = Math.abs(cents(l.lineUsd)) * (l.isCredit ? -1 : 1);
      await client.query(
        `INSERT INTO "CustomerInvoiceLine"
          (id, "invoiceId", description, quantity, "unitPriceCents", "lineTotalCents",
           "isCredit", "creditReason", "itemCode", "originalName", "cleanName", sku, brand)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, l.originalName || l.cleanName || "(item)", qty, unit, total, !!l.isCredit,
         l.isCredit ? "Imported credit" : null, l.itemCode, l.originalName, l.cleanName, l.sku, l.brand],
      );
      lineReport.push({ originalName: l.originalName, cleanName: l.cleanName, sku: l.sku || "", qty, unitUsd: l.unitUsd, lineUsd: l.lineUsd, isCredit: !!l.isCredit, matched: m ? `yes (${m})` : "no" });
    }

    if (DRY) { await client.query("ROLLBACK"); } else { await client.query("COMMIT"); }
    report.push({ externalNumber: inv.externalNumber, number, id, customerId, status: "SENT",
      subtotalCents, creditsCents, computedTotal, sheetTotal,
      totalsMatch: computedTotal === sheetTotal, lineCount: lines.length,
      matchedCount: lineReport.filter((r) => r.matched !== "no").length, lines: lineReport });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

await client.end();
console.log(JSON.stringify({ dryRun: DRY, invoices: report }, null, 2));
