import type { NextRequest } from "next/server";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { handle, json, readJson, requireOrganizer } from "@/lib/server/http";
import { normalizeUnit } from "@/lib/units";
import { shoppingItemSchema } from "@/lib/validation";

/** Manuellen Einkaufsposten hinzufügen. */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/shopping/items">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const i = await readJson(req, shoppingItemSchema);
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO shopping_items (trip_id, name, quantity, unit, category, team, checked) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [tripId, i.name, i.quantity, i.quantity === null ? i.unit : normalizeUnit(i.unit), i.category, i.team, i.checked]
    );
    await audit(c, tripId, me.actor, "shopping_item", rows[0].id, "create", { name: i.name });
    await notifyTrip(c, tripId);
    return rows[0].id as string;
  });
  return json({ id }, 201);
});
