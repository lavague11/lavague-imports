// Seeds ONE clearly-marked sample wholesale customer with a mix of invoices
// (paid / open / overdue / partial) + an order request, to demo the customer
// overview. Idempotent (recreates on re-run). Remove with:
//   node scripts/seed-sample-invoices.mjs --remove
// SUPABASE_URL from env. This is SAMPLE data (test-…@example.com).
import { randomBytes } from "node:crypto";
import pg from "pg";

const EMAIL = "test-cedargrove@example.com";
const id = (p) => `${p}_${randomBytes(6).toString("hex")}`;
const days = (n) => new Date(Date.now() + n * 86400000);

const url = process.env.SUPABASE_URL;
const u = new URL(url);
const c = new pg.Client({
  host: u.hostname, port: Number(u.port || 5432),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, "") || "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();

// Always clear any previous sample (cascades invoices/lines/requests).
await c.query(`DELETE FROM "Customer" WHERE email = $1`, [EMAIL]);
if (process.argv.includes("--remove")) {
  console.log("Removed the sample customer and its invoices.");
  await c.end();
  process.exit(0);
}

const custId = id("cust");
await c.query(
  `INSERT INTO "Customer"(id,email,name,role,"businessName",phone,street,city,state,zip,address,"updatedAt")
   VALUES($1,$2,$3,'WHOLESALE',$4,$5,$6,$7,$8,$9,$10,now())`,
  [custId, EMAIL, "Dana Whitfield", "Cedar Grove Market (sample)", "(201) 555-0188",
   "488 Palisade Ave", "Jersey City", "NJ", "07307", "488 Palisade Ave, Jersey City, NJ 07307"],
);

// invoices: [number, status, issueOffset, dueOffset, paidCents, lines[[desc,qty,unitCents]]]
const invoices = [
  ["LV-0001", "PAID", -40, -25, 48500, [["Moroccan olive oil — 1L (case of 12)", 5, 7200], ["Sultan green tea — 200g (case of 24)", 5, 2500]]],
  ["LV-0002", "SENT", -10, 20, 0, [["Dalia couscous — 1kg (case of 10)", 8, 2400], ["Pitted green olives — 5kg pail", 6, 2050]]],
  ["LV-0003", "SENT", -45, -15, 0, [["Harissa paste — 400g (case of 12)", 10, 3600], ["Argan oil — 250ml (case of 6)", 4, 3900]]],
  ["LV-0004", "PARTIAL", -5, 25, 30000, [["Medjool dates — 5kg", 12, 4200], ["Orange blossom water — 500ml (case of 12)", 5, 5000]]],
];

for (const [number, status, issO, dueO, paid, lines] of invoices) {
  const invId = id("inv");
  const subtotal = lines.reduce((s, [, q, unit]) => s + q * unit, 0);
  // These are all SENT/PARTIAL/PAID (not drafts), so they carry a customer link
  // + sentAt — the state a real invoice has once it's been sent to the customer.
  const token = randomBytes(24).toString("base64url");
  await c.query(
    `INSERT INTO "CustomerInvoice"(id,number,"customerId",status,"issueDate","dueDate","subtotalCents","totalCents","paidCents","publicToken","sentAt","updatedAt")
     VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$5,now())`,
    [invId, number, custId, status, days(issO), days(dueO), subtotal, paid, token],
  );
  for (const [desc, qty, unit] of lines) {
    await c.query(
      `INSERT INTO "CustomerInvoiceLine"(id,"invoiceId",description,quantity,"unitPriceCents","lineTotalCents")
       VALUES($1,$2,$3,$4,$5,$6)`,
      [id("il"), invId, desc, qty, unit, qty * unit],
    );
  }
  // Back paidCents with a real payment row so the demo matches the live model
  // (paidCents is always the sum of CustomerPayment rows).
  if (paid > 0) {
    await c.query(
      `INSERT INTO "CustomerPayment"(id,"invoiceId","amountCents",method,reference,"receivedAt","recordedBy")
       VALUES($1,$2,$3,'CHECK',$4,$5,'sales@lavagueimport.com')`,
      [id("pay"), invId, paid, `Check ${1000 + Math.floor(Math.random() * 900)}`, days(issO + 2)],
    );
  }
}

// one order request too
const reqId = id("req");
await c.query(
  `INSERT INTO "OrderRequest"(id,reference,"customerId",status,note,"updatedAt") VALUES($1,$2,$3,'SUBMITTED',$4,now())`,
  [reqId, "WR-SAMPLE1", custId, "Standing monthly order — call to confirm."],
);
await c.query(
  `INSERT INTO "OrderRequestLine"(id,"requestId",slug,"productName","unitSize","casePack",cases) VALUES($1,$2,$3,$4,$5,$6,$7)`,
  [id("orl"), reqId, "7-spice-mix", "7 Spice Mix", "Each", 12, 5],
);

console.log(`Seeded sample customer ${EMAIL} (id ${custId}) with 4 invoices + 1 order request.`);
await c.end();
