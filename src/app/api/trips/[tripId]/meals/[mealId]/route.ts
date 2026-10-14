import type { NextRequest } from "next/server";
import { z } from "zod";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit, diff } from "@/lib/server/audit";
import { assertUuid, handle, HttpError, json, readJson, requireOrganizer } from "@/lib/server/http";
import { getTrip } from "@/lib/server/repo";
import { mealSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[tripId]/meals/[mealId]">;
const patchSchema = mealSchema.extend({ version: z.number().int() });

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, mealId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  assertUuid(mealId, "Mahlzeit");
  const { version, ...m } = await readJson(req, patchSchema);
  await tx(async (c) => {
    const { rows } = await c.query(`SELECT * FROM meals WHERE id = $1 AND trip_id = $2`, [mealId, tripId]);
    const before = rows[0];
    if (!before) throw new HttpError(404, "Mahlzeit nicht gefunden");
    const trip = await getTrip(c, tripId);
    if (m.day < trip!.start_date || m.day > trip!.end_date) throw new HttpError(400, "Tag liegt außerhalb des Reisezeitraums");
    if (m.recipe_id) {
      const r = await c.query(`SELECT 1 FROM recipes WHERE id = $1 AND trip_id = $2`, [m.recipe_id, tripId]);
      if (!r.rowCount) throw new HttpError(400, "Rezept nicht gefunden");
    }
    const res = await c.query(
      `UPDATE meals SET day=$3, meal_type=$4, dish=$5, recipe_id=$6, servings_override=$7, kitchen_team=$8, note=$9,
              version=version+1, updated_at=now()
        WHERE id=$1 AND version=$2`,
      [mealId, version, m.day, m.meal_type, m.dish, m.recipe_id, m.servings_override, m.kitchen_team, m.note]
    );
    if (!res.rowCount) throw new HttpError(409, "Diese Mahlzeit wurde zwischenzeitlich geändert.", { current: before });
    await audit(c, tripId, me.actor, "meal", mealId, "update", diff(before, m));
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});

export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, mealId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  assertUuid(mealId, "Mahlzeit");
  await tx(async (c) => {
    const { rows } = await c.query(`DELETE FROM meals WHERE id = $1 AND trip_id = $2 RETURNING day, dish`, [mealId, tripId]);
    if (!rows[0]) throw new HttpError(404, "Mahlzeit nicht gefunden");
    await audit(c, tripId, me.actor, "meal", mealId, "delete", rows[0]);
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});
