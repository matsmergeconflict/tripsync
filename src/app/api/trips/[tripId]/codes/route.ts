import type { NextRequest } from "next/server";
import { z } from "zod";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { baseUrl, handle, json, readJson, requireOrganizer } from "@/lib/server/http";
import { newShareCode } from "@/lib/server/tokens";

const schema = z.object({ which: z.enum(["invite", "public"]) });

/** Einladungs- oder öffentlichen Link neu erzeugen; der alte Link wird sofort ungültig. */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/codes">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const { which } = await readJson(req, schema);
  const code = newShareCode();
  await tx(async (c) => {
    await c.query(`UPDATE trips SET ${which === "invite" ? "invite_code" : "public_code"} = $2, updated_at = now() WHERE id = $1`, [tripId, code]);
    await audit(c, tripId, me.actor, "trip", tripId, which === "invite" ? "reset_invite_link" : "reset_public_link");
    await notifyTrip(c, tripId);
  });
  return json({ url: `${baseUrl(req)}/${which === "invite" ? "join" : "view"}/${code}` });
});
