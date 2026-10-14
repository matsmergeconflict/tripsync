/**
 * Führt SQL-Migrationen aus db/migrations in alphabetischer Reihenfolge aus.
 * Aufruf: DATABASE_URL=... npx tsx scripts/migrate.ts [--reset]
 * --reset löscht alle Tabellen (nur für Test-/Entwicklungsdatenbanken!).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt");
  const reset = process.argv.includes("--reset");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (reset) {
      if (process.env.NODE_ENV === "production") throw new Error("--reset ist in Produktion verboten");
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      console.log("Schema zurückgesetzt");
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(path.join(dir, f), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [f]);
        await client.query("COMMIT");
        console.log(`✓ ${f}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
