import type { NextRequest } from "next/server";
import { z } from "zod";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { assertUuid, handle, HttpError, json, readJson, requireOrganizer } from "@/lib/server/http";
import { writeIngredients } from "@/lib/server/recipes";
import { recipeSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[tripId]/recipes/[recipeId]">;
const patchSchema = recipeSchema.extend({ version: z.number().int() });

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, recipeId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  assertUuid(recipeId, "Rezept");
  const { version, ...r } = await readJson(req, patchSchema);
  await tx(async (c) => {
    const { rows } = await c.query(`SELECT * FROM recipes WHERE id = $1 AND trip_id = $2`, [recipeId, tripId]);
    if (!rows[0]) throw new HttpError(404, "Rezept nicht gefunden");
    const res = await c.query(
      `UPDATE recipes SET name=$3, base_servings=$4, notes=$5, version=version+1, updated_at=now() WHERE id=$1 AND version=$2`,
      [recipeId, version, r.name, r.base_servings, r.notes]
    );
    if (!res.rowCount) throw new HttpError(409, "Dieses Rezept wurde zwischenzeitlich geändert.");
    await writeIngredients(c, recipeId, r.ingredients);
    await audit(c, tripId, me.actor, "recipe", recipeId, "update", { name: r.name, base_servings: r.base_servings, ingredients: r.ingredients.length });
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});

export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, recipeId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  assertUuid(recipeId, "Rezept");
  await tx(async (c) => {
    const { rows } = await c.query(`DELETE FROM recipes WHERE id = $1 AND trip_id = $2 RETURNING name`, [recipeId, tripId]);
    if (!rows[0]) throw new HttpError(404, "Rezept nicht gefunden");
    await audit(c, tripId, me.actor, "recipe", recipeId, "delete", rows[0]);
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});
