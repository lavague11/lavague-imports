// Copies all data from the source DB (SOURCE_URL, e.g. Neon) into the destination
// DB (SUPABASE_URL). Schema must already exist on the destination. Copies only
// tables that have rows, in FK-topological order, truncating the destination
// tables first (CASCADE) so the script is safe to re-run.
//
// Usage:
//   SOURCE_URL="postgresql://.../neondb" \
//   SUPABASE_URL="postgresql://lavague_app:***@db.<ref>.supabase.co:5432/postgres" \
//   node scripts/supabase-copy-data.mjs
import "dotenv/config";
import pg from "pg";

function clientFor(url) {
  const u = new URL(url);
  return new pg.Client({
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false },
  });
}

const src = clientFor(process.env.SOURCE_URL || process.env.DATABASE_URL);
const dst = clientFor(process.env.SUPABASE_URL);
await src.connect();
await dst.connect();

// Tables with data on the source.
const { rows: tbls } = await src.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public'`,
);
const withData = [];
for (const { tablename } of tbls) {
  const { rows } = await src.query(`SELECT count(*)::int n FROM "${tablename}"`);
  if (rows[0].n > 0) withData.push({ t: tablename, n: rows[0].n });
}
const names = new Set(withData.map((x) => x.t));

// json/jsonb columns per table — their values must be JSON.stringified on insert,
// otherwise node-postgres formats a JS array as a Postgres array literal ({...}),
// which is invalid JSON for a jsonb column.
const { rows: jsonCols } = await src.query(
  `SELECT table_name, column_name FROM information_schema.columns
   WHERE table_schema='public' AND data_type IN ('json','jsonb')`,
);
const jsonByTable = new Map();
for (const { table_name, column_name } of jsonCols) {
  if (!jsonByTable.has(table_name)) jsonByTable.set(table_name, new Set());
  jsonByTable.get(table_name).add(column_name);
}

// FK edges child -> parent (ignore self-references).
const { rows: fks } = await src.query(`
  SELECT tc.table_name AS child, ccu.table_name AS parent
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`);
const parents = new Map([...names].map((t) => [t, new Set()]));
for (const { child, parent } of fks) {
  if (names.has(child) && names.has(parent) && child !== parent) {
    parents.get(child).add(parent);
  }
}
// Topological order (parents first).
const order = [];
const done = new Set();
while (order.length < names.size) {
  let progressed = false;
  for (const t of names) {
    if (done.has(t)) continue;
    if ([...parents.get(t)].every((p) => done.has(p))) {
      order.push(t);
      done.add(t);
      progressed = true;
    }
  }
  if (!progressed) {
    // Cycle — append the rest in any order (FKs may be deferrable/nullable).
    for (const t of names) if (!done.has(t)) order.push(t), done.add(t);
  }
}

// Truncate destination tables that will receive data (reverse order, CASCADE).
await dst.query(
  `TRUNCATE ${order.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
);

let grand = 0;
for (const t of order) {
  const res = await src.query(`SELECT * FROM "${t}"`);
  const cols = res.fields.map((f) => f.name);
  const rows = res.rows;
  if (rows.length === 0) continue;
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const jsonSet = jsonByTable.get(t) || new Set();
  const maxParams = 60000;
  const batchSize = Math.max(1, Math.min(1000, Math.floor(maxParams / cols.length)));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const values = [];
    const tuples = chunk.map((row) => {
      const ph = cols.map((c) => {
        const v = row[c];
        values.push(jsonSet.has(c) && v != null ? JSON.stringify(v) : v);
        return `$${values.length}`;
      });
      return `(${ph.join(", ")})`;
    });
    await dst.query(
      `INSERT INTO "${t}" (${colList}) VALUES ${tuples.join(", ")}`,
      values,
    );
    inserted += chunk.length;
  }
  console.log(`  ${String(inserted).padStart(6)}  ${t}`);
  grand += inserted;
}
console.log(`Copied ${grand} rows across ${order.length} tables.`);
await src.end();
await dst.end();
