import type { NextRequest } from "next/server";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { handle, json, readJson, requireOrganizer } from "@/lib/server/http";
import { writeIngredients } from "@/lib/server/recipes";
import { recipeSchema } from "@/lib/validation";

export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/recipes">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const r = await readJson(req, recipeSchema);
  const id = await tx(async (c) => {
    const { rows } = await c.query(`INSERT INTO recipes (trip_id, name, base_servings, notes) VALUES ($1,$2,$3,$4) RETURNING id`, [
      tripId,
      r.name,
      r.base_servings,
      r.notes,
    ]);
    await writeIngredients(c, rows[0].id, r.ingredients);
    await audit(c, tripId, me.actor, "recipe", rows[0].id, "create", { name: r.name, ingredients: r.ingredients.length });
    await notifyTrip(c, tripId);
    return rows[0].id as string;
  });
  return json({ id }, 201);
});
