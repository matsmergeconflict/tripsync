import type { NextRequest } from "next/server";
import { pool } from "@/lib/server/db";
import { handle, json, requireOrganizer } from "@/lib/server/http";

/** Änderungsprotokoll (neueste zuerst). Optional gefiltert nach entity_id. */
export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/audit">) => {
  const { tripId } = await ctx.params;
  await requireOrganizer(req, tripId);
  const entityId = req.nextUrl.searchParams.get("entity_id");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100, 500);
  const { rows } = await pool().query(
    `SELECT id, actor_type, actor_label, entity, entity_id, action, changes, created_at
       FROM audit_log WHERE trip_id = $1 AND ($2::text IS NULL OR entity_id = $2)
      ORDER BY created_at DESC, id DESC LIMIT $3`,
    [tripId, entityId, limit]
  );
  return json({ entries: rows });
});
