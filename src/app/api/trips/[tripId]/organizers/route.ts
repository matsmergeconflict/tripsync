import type { NextRequest } from "next/server";
import { z } from "zod";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { baseUrl, handle, json, readJson, requireOrganizer } from "@/lib/server/http";
import { hashToken, newSecretToken } from "@/lib/server/tokens";

const schema = z.object({ name: z.string().trim().min(1, "Name fehlt").max(80) });

/** Weiteren Organisator hinzufügen. Der persönliche Link wird nur einmal angezeigt. */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/organizers">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const { name } = await readJson(req, schema);
  const token = newSecretToken();
  const id = await tx(async (c) => {
    const { rows } = await c.query(`INSERT INTO organizers (trip_id, name, token_hash) VALUES ($1,$2,$3) RETURNING id`, [
      tripId,
      name,
      hashToken(token),
    ]);
    await audit(c, tripId, me.actor, "organizer", rows[0].id, "create", { name });
    await notifyTrip(c, tripId);
    return rows[0].id as string;
  });
  return json({ id, name, url: `${baseUrl(req)}/o/${token}` }, 201);
});
