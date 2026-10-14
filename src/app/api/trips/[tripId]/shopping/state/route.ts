import type { NextRequest } from "next/server";
import { z } from "zod";
import { tx, notifyTrip } from "@/lib/server/db";
import { handle, json, readJson, requireOrganizer } from "@/lib/server/http";

const schema = z.object({
  item_key: z.string().min(1).max(200),
  checked: z.boolean(),
  team: z.string().trim().max(80).nullable().optional().transform((v) => v || null),
});

/** Abhak-Status / Einkaufsteam eines automatisch berechneten Postens setzen. */
export const PUT = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/shopping/state">) => {
  const { tripId } = await ctx.params;
  await requireOrganizer(req, tripId);
  const s = await readJson(req, schema);
  await tx(async (c) => {
    await c.query(
      `INSERT INTO shopping_state (trip_id, item_key, checked, team) VALUES ($1,$2,$3,$4)
       ON CONFLICT (trip_id, item_key) DO UPDATE SET checked=$3, team=$4`,
      [tripId, s.item_key, s.checked, s.team]
    );
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});
