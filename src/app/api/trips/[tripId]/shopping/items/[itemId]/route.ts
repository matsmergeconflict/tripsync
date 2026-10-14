import type { NextRequest } from "next/server";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { assertUuid, handle, HttpError, json, readJson, requireOrganizer } from "@/lib/server/http";
import { normalizeUnit } from "@/lib/units";
import { shoppingItemSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[tripId]/shopping/items/[itemId]">;

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, itemId } = await ctx.params;
  await requireOrganizer(req, tripId);
  assertUuid(itemId, "Posten");
  const i = await readJson(req, shoppingItemSchema);
  await tx(async (c) => {
    const res = await c.query(
      `UPDATE shopping_items SET name=$3, quantity=$4, unit=$5, category=$6, team=$7, checked=$8 WHERE id=$1 AND trip_id=$2`,
      [itemId, tripId, i.name, i.quantity, i.quantity === null ? i.unit : normalizeUnit(i.unit), i.category, i.team, i.checked]
    );
    if (!res.rowCount) throw new HttpError(404, "Posten nicht gefunden");
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});

export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, itemId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  assertUuid(itemId, "Posten");
  await tx(async (c) => {
    const { rows } = await c.query(`DELETE FROM shopping_items WHERE id=$1 AND trip_id=$2 RETURNING name`, [itemId, tripId]);
    if (!rows[0]) throw new HttpError(404, "Posten nicht gefunden");
    await audit(c, tripId, me.actor, "shopping_item", itemId, "delete", rows[0]);
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});
