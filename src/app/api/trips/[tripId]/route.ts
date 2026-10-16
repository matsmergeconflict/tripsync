import type { NextRequest } from "next/server";
import { pool, tx, notifyTrip } from "@/lib/server/db";
import { audit, diff } from "@/lib/server/audit";
import { baseUrl, handle, HttpError, json, readJson, requireOrganizer } from "@/lib/server/http";
import {
  getTrip,
  listAliases,
  listMeals,
  listParticipants,
  listRecipes,
  listShoppingItems,
  listShoppingState,
} from "@/lib/server/repo";
import { tripUpdateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[tripId]">;

/** Gesamtdaten einer Reise für Organisatoren. */
export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const db = pool();
  const trip = await getTrip(db, tripId, true);
  if (!trip) throw new HttpError(404, "Reise nicht gefunden");
  const [participants, organizers, meals, recipes, aliases, shoppingItems, shoppingState] = await Promise.all([
    listParticipants(db, tripId),
    db.query(`SELECT id, name, created_at FROM organizers WHERE trip_id = $1 AND revoked_at IS NULL ORDER BY created_at`, [tripId]),
    listMeals(db, tripId),
    listRecipes(db, tripId),
    listAliases(db, tripId),
    listShoppingItems(db, tripId),
    listShoppingState(db, tripId),
  ]);
  const base = baseUrl(req);
  const { invite_code, public_code, ...rest } = trip;
  return json({
    trip: rest,
    links: { invite: `${base}/join/${invite_code}`, public: `${base}/view/${public_code}` },
    me: { id: me.organizerId, name: me.name },
    organizers: organizers.rows,
    participants,
    meals,
    recipes,
    aliases,
    shopping: { items: shoppingItems, state: shoppingState },
  });
});

/** Reiseeinstellungen ändern (mit Versionsprüfung gegen gleichzeitige Änderungen). */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const input = await readJson(req, tripUpdateSchema);
  const { version, ...fields } = input;
  const updated = await tx(async (c) => {
    const before = await getTrip(c, tripId);
    if (!before) throw new HttpError(404, "Reise nicht gefunden");
    if (before.version !== version)
      throw new HttpError(409, "Die Reise wurde zwischenzeitlich von jemand anderem geändert.", { current: before });
    const next = { ...before, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
    if (next.end_date < next.start_date) throw new HttpError(400, "Ende muss nach dem Beginn liegen", { fields: { end_date: "Ende vor Beginn" } });
    if (next.start_date !== before.start_date || next.end_date !== before.end_date) {
      // Keine Daten "verwaisen" lassen: Anmeldungen, Ski-/Essenstage und Mahlzeiten müssen im neuen Zeitraum liegen
      const { rows: out } = await c.query(
        `SELECT
           (SELECT count(*) FROM participants p JOIN stays s ON s.participant_id = p.id
             WHERE p.trip_id = $1 AND p.status = 'active'
               AND ((s.arrival_date IS NOT NULL AND (s.arrival_date < $2 OR s.arrival_date > $3))
                 OR (s.departure_date IS NOT NULL AND (s.departure_date < $2 OR s.departure_date > $3)))) AS stays,
           (SELECT count(DISTINCT p.id) FROM participants p
             LEFT JOIN ski_days k ON k.participant_id = p.id LEFT JOIN meal_days m ON m.participant_id = p.id
             WHERE p.trip_id = $1 AND p.status = 'active'
               AND ((k.day IS NOT NULL AND (k.day < $2 OR k.day > $3)) OR (m.day IS NOT NULL AND (m.day < $2 OR m.day > $3)))) AS days,
           (SELECT count(*) FROM meals WHERE trip_id = $1 AND (day < $2 OR day > $3)) AS meals`,
        [tripId, next.start_date, next.end_date]
      );
      const o = out[0];
      if (o.stays || o.days || o.meals) {
        const parts = [
          o.stays && `${o.stays} Anmeldung(en) mit An-/Abreise`,
          o.days && `${o.days} Person(en) mit Ski- oder Essenstagen`,
          o.meals && `${o.meals} Mahlzeit(en)`,
        ].filter(Boolean);
        throw new HttpError(400, `Der neue Zeitraum ist zu kurz: ${parts.join(", ")} liegen außerhalb. Bitte diese zuerst anpassen.`, {
          fields: { start_date: "Daten außerhalb", end_date: "Daten außerhalb" },
        });
      }
    }
    const { rows } = await c.query(
      `UPDATE trips SET name=$2, location=$3, start_date=$4, end_date=$5, public_enabled=$6, invite_enabled=$7,
              ski_enabled=$8, ski_categories=$9, ski_notes=$10, require_approval=$12, form_texts=$13, version=version+1, updated_at=now()
        WHERE id=$1 AND version=$11 RETURNING version`,
      [
        tripId,
        next.name,
        fields.location === undefined ? before.location : fields.location,
        next.start_date,
        next.end_date,
        next.public_enabled,
        next.invite_enabled,
        next.ski_enabled,
        JSON.stringify(next.ski_categories),
        fields.ski_notes === undefined ? before.ski_notes : fields.ski_notes,
        version,
        next.require_approval,
        JSON.stringify(fields.form_texts ?? before.form_texts ?? {}),
      ]
    );
    if (!rows[0]) throw new HttpError(409, "Die Reise wurde zwischenzeitlich geändert.");
    await audit(c, tripId, me.actor, "trip", tripId, "update", diff(before as never, fields as never));
    await notifyTrip(c, tripId);
    return rows[0].version as number;
  });
  return json({ version: updated });
});

/** Reise inkl. aller Daten endgültig löschen (DSGVO). Erfordert Bestätigung mit dem Reisenamen. */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId } = await ctx.params;
  await requireOrganizer(req, tripId);
  const confirm = req.nextUrl.searchParams.get("confirm");
  const trip = await getTrip(pool(), tripId);
  if (!trip) throw new HttpError(404, "Reise nicht gefunden");
  if (confirm !== trip.name) throw new HttpError(400, "Zur Bestätigung muss der Reisename exakt angegeben werden");
  await tx(async (c) => {
    await c.query(`DELETE FROM trips WHERE id = $1`, [tripId]);
    await notifyTrip(c, tripId, "deleted");
  });
  return json({ ok: true });
});
