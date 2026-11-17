// One-off: split legacy single-line Customer.address into street/unit/city/state/zip
// for rows that don't have structured fields yet. Best-effort; leaves the legacy
// address intact. SUPABASE_URL from env.
import pg from "pg";

function parse(addr) {
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  const m = last.match(/^(.*?)\s+(\d{5}(?:-\d{4})?)$/);
  const state = m ? m[1].trim() : last;
  const zip = m ? m[2] : null;
  const city = parts[parts.length - 2] || null;
  const street = parts[0] || null;
  const unit = parts.length >= 4 ? parts[1] : null;
  return { street, unit, city, state, zip };
}

const url = process.env.SUPABASE_URL;
const u = new URL(url);
const c = new pg.Client({
  host: u.hostname, port: Number(u.port || 5432),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, "") || "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query(
  `SELECT id, address FROM "Customer" WHERE address IS NOT NULL AND street IS NULL`,
);
let updated = 0;
for (const r of rows) {
  const p = parse(r.address);
  if (!p) continue;
  await c.query(
    `UPDATE "Customer" SET street=$2, unit=$3, city=$4, state=$5, zip=$6, "updatedAt"=now() WHERE id=$1`,
    [r.id, p.street, p.unit, p.city, p.state, p.zip],
  );
  updated++;
}
console.log(`Parsed ${updated} of ${rows.length} legacy addresses into structured fields.`);
await c.end();
