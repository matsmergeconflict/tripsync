import "server-only";
import pg from "pg";

// DATE (1082) als "YYYY-MM-DD"-String statt JS-Date (verhindert Zeitzonenfehler)
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC (1700) als Zahl
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// INT8 (20) als Zahl (bigserial-IDs im Audit-Log bleiben klein)
pg.types.setTypeParser(20, (v) => Number(v));

const g = globalThis as unknown as { __tripsyncPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!g.__tripsyncPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL ist nicht gesetzt");
    g.__tripsyncPool = new pg.Pool({ connectionString, max: 10 });
  }
  return g.__tripsyncPool;
}

export type Db = pg.Pool | pg.PoolClient;

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Benachrichtigt alle verbundenen Clients einer Reise (wird erst nach COMMIT zugestellt). */
export async function notifyTrip(db: Db, tripId: string, kind: string = "change"): Promise<void> {
  await db.query("SELECT pg_notify('tripsync', $1)", [JSON.stringify({ tripId, kind })]);
}
