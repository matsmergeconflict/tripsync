import { execSync } from "node:child_process";

/** Setzt die Testdatenbank vor jedem Lauf zurück und spielt alle Migrationen ein. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://tripsync:tripsync@localhost:5432/tripsync_test";
  execSync("npx tsx scripts/migrate.ts --reset", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
