import "server-only";
import type { Db } from "./db";

export interface Actor {
  type: "organizer" | "participant" | "system";
  id: string | null;
  label: string;
}

/** Felder, deren Inhalte nicht ins Protokoll geschrieben werden (nur "geändert"). */
const SENSITIVE = new Set(["allergies", "contact", "comment", "food_wishes"]);

export function diff(before: Record<string, unknown> | null, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (k === "version" || k === "updated_at" || k === "created_at") continue;
    const old = before ? before[k] : undefined;
    if (JSON.stringify(old ?? null) === JSON.stringify(v ?? null)) continue;
    changes[k] = SENSITIVE.has(k) ? { from: "•••", to: "•••" } : { from: old ?? null, to: v ?? null };
  }
  return changes;
}

export async function audit(
  db: Db,
  tripId: string,
  actor: Actor,
  entity: string,
  entityId: string | null,
  action: string,
  changes: Record<string, unknown> | null = null
): Promise<void> {
  if (changes && Object.keys(changes).length === 0 && action === "update") return;
  await db.query(
    `INSERT INTO audit_log (trip_id, actor_type, actor_id, actor_label, entity, entity_id, action, changes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tripId, actor.type, actor.id, actor.label, entity, entityId, action, changes ? JSON.stringify(changes) : null]
  );
}
