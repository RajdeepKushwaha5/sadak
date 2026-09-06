/**
 * Apply supabase/migrations/*.sql in filename order.
 *
 * The SQL editor works but the seed migrations are ~380 KB of JSON inserts,
 * which is slow to paste and easy to apply out of order. Requires
 * SUPABASE_DB_URL in .env:
 *
 *   Dashboard -> Connect -> Session pooler -> URI
 *   (swap [YOUR-PASSWORD] for the database password set at project creation)
 *
 *   npx tsx scripts/run-migrations.ts
 *
 * Safe to re-run: each file goes in its own transaction, and a file that
 * fails only because its objects already exist is reported and skipped
 * rather than aborting the run.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { config } from "dotenv";

config();

const DIR = join(process.cwd(), "supabase", "migrations");
const ALREADY_EXISTS = new Set(["42P07", "42710", "42P06", "42723"]);

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Missing SUPABASE_DB_URL in .env. See the header of this file.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  let skipped = 0;

  for (const file of files) {
    const sql = readFileSync(join(DIR, file), "utf8");
    process.stdout.write(`  ${file.padEnd(36)}`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log("applied");
      applied += 1;
    } catch (err) {
      await client.query("rollback");
      const e = err as { code?: string; message?: string };
      if (e.code && ALREADY_EXISTS.has(e.code)) {
        console.log(`already present (${e.code})`);
        skipped += 1;
      } else {
        console.log(`FAILED  ${e.code ?? ""} ${e.message ?? err}`);
        await client.end();
        process.exit(1);
      }
    }
  }

  console.log(`\n${applied} applied, ${skipped} already present.`);
  await client.end();
}

main().catch((e) => {
  console.error("migration run failed:", e.message);
  process.exit(1);
});
