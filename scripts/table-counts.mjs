// Row counts for every public table on the DB named by DB_URL env (default DATABASE_URL).
import "dotenv/config";
import pg from "pg";

const url = process.env.DB_URL || process.env.DATABASE_URL;
const u = new URL(url);
const c = new pg.Client({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows: tables } = await c.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
);
let total = 0;
for (const { tablename } of tables) {
  const { rows } = await c.query(`SELECT count(*)::int AS n FROM "${tablename}"`);
  if (rows[0].n > 0) console.log(`  ${String(rows[0].n).padStart(6)}  ${tablename}`);
  total += rows[0].n;
}
console.log(`${tables.length} tables, ${total} rows total on ${u.hostname}`);
await c.end();
