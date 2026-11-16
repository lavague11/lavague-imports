// Runs a .sql file against the Supabase DB as the app role.
// Usage: SUPABASE_URL="postgresql://lavague_app:***@db.<ref>.supabase.co:5432/postgres" \
//        node scripts/supabase-run-sql.mjs scripts/_supabase_schema.sql
// SSL is relaxed (Supabase presents a chain node doesn't bundle); the connection
// is still encrypted. No secret lives in this file — it comes from the env.
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.SUPABASE_URL;
if (!url) throw new Error("Set SUPABASE_URL");
const file = process.argv[2];
if (!file) throw new Error("Pass a .sql file path");

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
const sql = readFileSync(file, "utf8");
await c.query(sql);
console.log(`Applied ${file} (${sql.length} bytes) to ${u.hostname}.`);
await c.end();
