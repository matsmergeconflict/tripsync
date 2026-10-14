import type { NextRequest } from "next/server";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { handle, HttpError, json, readJson, requireOrganizer } from "@/lib/server/http";
import { getTrip } from "@/lib/server/repo";
import { mealSchema } from "@/lib/validation";

export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/meals">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const m = await readJson(req, mealSchema);
  const id = await tx(async (c) => {
    const trip = await getTrip(c, tripId);
    if (!trip) throw new HttpError(404, "Reise nicht gefunden");
    if (m.day < trip.start_date || m.day > trip.end_date) throw new HttpError(400, "Tag liegt außerhalb des Reisezeitraums");
    if (m.recipe_id) {
      const r = await c.query(`SELECT 1 FROM recipes WHERE id = $1 AND trip_id = $2`, [m.recipe_id, tripId]);
      if (!r.rowCount) throw new HttpError(400, "Rezept nicht gefunden");
    }
    const { rows } = await c.query(
      `INSERT INTO meals (trip_id, day, meal_type, dish, recipe_id, servings_override, kitchen_team, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [tripId, m.day, m.meal_type, m.dish, m.recipe_id, m.servings_override, m.kitchen_team, m.note]
    );
    await audit(c, tripId, me.actor, "meal", rows[0].id, "create", { day: m.day, meal_type: m.meal_type, dish: m.dish });
    await notifyTrip(c, tripId);
    return rows[0].id as string;
  });
  return json({ id }, 201);
});
