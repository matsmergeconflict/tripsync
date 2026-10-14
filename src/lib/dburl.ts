/**
 * Datenbank-URL aus der Umgebung. Unterstützt die Variablennamen gängiger Hoster
 * (Vercel-Marketplace: Neon setzt DATABASE_URL / DATABASE_URL_UNPOOLED, Supabase POSTGRES_URL / POSTGRES_URL_NON_POOLING).
 * `direct` = Verbindung ohne Pooler – nötig für LISTEN (Live-Updates) und Migrationen.
 */
export function databaseUrl(direct = false): string | undefined {
  const e = process.env;
  return direct
    ? e.DATABASE_URL_UNPOOLED ?? e.POSTGRES_URL_NON_POOLING ?? e.DATABASE_URL ?? e.POSTGRES_URL
    : e.DATABASE_URL ?? e.POSTGRES_URL;
}
