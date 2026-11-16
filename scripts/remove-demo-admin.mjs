// Section K: remove the demo admin admin@lavagueimports.com (plural "imports" —
// the demo domain; the real one is lavagueimport.com). Admins must be only
// aelzoghabi@gmail.com and sales@lavagueimport.com. Deletes the user's sessions
// first, then the user. Idempotent — a no-op if the row is already gone.
import "dotenv/config";
import pg from "pg";

const TARGET = "admin@lavagueimports.com";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const { rows: found } = await c.query(
  `SELECT id FROM "AdminUser" WHERE email = $1`,
  [TARGET],
);
if (found.length === 0) {
  console.log(`No "${TARGET}" row — nothing to remove.`);
  await c.end();
  process.exit(0);
}
const id = found[0].id;

let sessions = { rowCount: 0 };
try {
  sessions = await c.query(`DELETE FROM "AdminSession" WHERE "userId" = $1`, [id]);
} catch (e) {
  console.log(`(AdminSession cleanup skipped: ${e.message})`);
}
const del = await c.query(`DELETE FROM "AdminUser" WHERE id = $1`, [id]);

const { rows: remaining } = await c.query(
  `SELECT email, role FROM "AdminUser" ORDER BY email`,
);
console.log(
  `Removed ${del.rowCount} admin (${TARGET}) and ${sessions.rowCount} session(s).`,
);
console.log("Remaining admins:");
for (const r of remaining) console.log(`  ${r.email.padEnd(32)} ${r.role}`);
await c.end();
