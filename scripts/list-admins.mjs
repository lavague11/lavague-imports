// Read-only: lists admin users so we can see the demo account before removing it.
import "dotenv/config";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(
  `SELECT id, email, role, "createdAt" FROM "AdminUser" ORDER BY "createdAt"`,
);
console.log("AdminUser rows:");
for (const r of rows) {
  console.log(`  ${r.email.padEnd(32)} ${String(r.role).padEnd(8)} ${r.id}`);
}
await c.end();
