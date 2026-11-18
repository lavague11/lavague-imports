import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const SP = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/a60ff56fc7cdb416/f28188a3-78be-4bad-a37d-44a3a36c3290/scratchpad";
const lines = JSON.parse(readFileSync(`${SP}/import_lines.json`, "utf8"));
const u = new URL(process.env.SUPABASE_URL || process.env.DATABASE_URL);
const c = new pg.Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } });
await c.connect();

const q = async (s) => (await c.query(s)).rows;

// Credit flag should equal (lineTotalCents < 0)
const badCredit = (await q(`SELECT count(*) n FROM "CustomerInvoiceLine" l JOIN "CustomerInvoice" i ON i.id=l."invoiceId" WHERE i.source='invoice_asap' AND l."isCredit" <> (l."lineTotalCents" < 0)`))[0].n;
const negDb = (await q(`SELECT count(*) n FROM "CustomerInvoiceLine" l JOIN "CustomerInvoice" i ON i.id=l."invoiceId" WHERE i.source='invoice_asap' AND l."lineTotalCents" < 0`))[0].n;
const negFile = lines.filter((l) => (l.lineUsd || 0) < 0 && l.customer !== "Ahmed Test").length;

// Description integrity: every DB (itemCode, description) must exist in the file.
const fileSet = new Set(lines.map((l) => `${l.itemCode ?? ""}||${l.originalName || l.cleanName || "(item)"}`));
const dbDesc = await q(`SELECT l."itemCode" ic, l.description d FROM "CustomerInvoiceLine" l JOIN "CustomerInvoice" i ON i.id=l."invoiceId" WHERE i.source='invoice_asap'`);
let descMiss = 0; const samples = [];
for (const r of dbDesc) { const k = `${r.ic ?? ""}||${r.d}`; if (!fileSet.has(k)) { descMiss++; if (samples.length < 5) samples.push(r.d); } }

const nonAscii = (await q(`SELECT description FROM "CustomerInvoiceLine" l JOIN "CustomerInvoice" i ON i.id=l."invoiceId" WHERE i.source='invoice_asap' AND description ~ '[^ -~]' LIMIT 4`)).map((r) => r.description);

await c.end();
console.log(JSON.stringify({ badCreditFlag: +badCredit, negLines_db: +negDb, negLines_file: negFile, descriptionsNotInFile: descMiss, descSamplesMissing: samples, nonAsciiSample: nonAscii }, null, 1));
